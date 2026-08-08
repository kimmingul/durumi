/**
 * 외부 변경 **확정** 계층 — 원시 감시 이벤트를 정규화된 확정 이벤트로 바꾼다.
 *
 * 설계의 한 문장: **이벤트는 신호일 뿐이고 진실은 항상 재검사에서 온다**
 * (REQ-WS-014). 이 원칙 하나가 플랫폼 차이 흡수(REQ-WS-017), 자기 저장 에코
 * 억제(REQ-WS-015), 중복 발행 무해화를 동시에 해결한다 — macOS(FSEvents)는
 * 이벤트를 병합하고 Windows(ReadDirectoryChangesW)는 rename을 old/new로 쪼개며
 * 중복 발행이 잦지만, 어느 쪽이든 확정 여부는 재검사한 크기·수정시각이 정한다.
 *
 * 시계와 stat이 주입 가능한 이유(AC-WS-015, C-6): 실시간 경쟁으로 "쓰기 도중
 * 부분 상태를 읽지 않는다"를 단언하면 비결정적이 된다. 두 의존을 밖에서
 * 넣을 수 있게 해 두면 Windows e2e 없이 양 플랫폼 시나리오를 유닛에서
 * 결정적으로 재생할 수 있다.
 *
 * 확정은 **2단계**다 (REQ-WS-014):
 *
 *  1. **메타데이터 재검사** — 감시 중인 *모든* 경로에 대해 크기·수정시각을
 *     기준값과 대조한다. 파일을 읽지 않는다.
 *  2. **내용 대조** — *열린 파일만*, 1단계를 통과했을 때만. 디스크 내용을
 *     버퍼가 마지막으로 로드·저장한 내용과 대조해 같으면 확정하지 않는다.
 *
 * 1단계만으로 부족한 이유: 내용이 같은 재작성(같은 내용 덮어쓰기, 일부 도구의
 * 저장 동작)도 mtime을 바꾸므로 1단계를 통과한다. 그대로 확정하면 내용이
 * 바뀌지 않았는데 조정이 돌아 캐럿과 실행 취소 이력이 흔들린다.
 *
 * 2단계가 비용을 만들지 않는 이유: 대상이 **열린 파일**뿐이고 그 파일은 이미
 * 버퍼에 전량 적재되어 있다. 읽은 내용은 확정 이벤트에 실려 나가 조정 계층의
 * 최소 diff·차이 보기가 재사용하므로 읽기는 한 번뿐이다. 열려 있지 않은
 * 경로는 1단계에서 끝나며 **읽기 호출이 발생하지 않는다** — 그 경계를 넘으면
 * REQ-WS-046이 `data/` 배제로 피한 대용량 읽기가 규약 폴더로 되돌아온다.
 */

/** 현행 `watchRoot`가 쓰던 합류 창을 그대로 유지한다. */
export const DEFAULT_DEBOUNCE_MS = 200;

/**
 * 경로별 보류 상한. 넘으면 이벤트를 버리는 대신 재검사를 요청한다
 * (REQ-WS-018의 "경로별 합류 용량을 초과한 이벤트 폭주").
 */
export const DEFAULT_MAX_PENDING_PATHS = 512;

export interface FileFacts {
  size: number;
  mtimeMs: number;
}

/** 파일이 없으면 null. */
export type StatFn = (path: string) => Promise<FileFacts | null>;

/** 읽을 수 없으면 null. 2단계에서만 호출된다. */
export type ReadContentFn = (path: string) => Promise<string | null>;

export interface RawWatchEvent {
  type: 'rename' | 'change';
  /** 절대 경로. 대소문자는 플랫폼에 따라 정규화되어 있지 않을 수 있다. */
  path: string;
}

export interface ConfirmedFileEvent {
  /** 추적 중인 정규 경로. 대소문자 차이는 여기서 흡수된다. */
  path: string;
  kind: 'changed' | 'deleted';
  /** 삭제일 때 null. */
  facts: FileFacts | null;
  /**
   * 2단계에서 읽은 디스크 내용. 열려 있지 않은 경로·삭제·읽기 실패는 null이다.
   * 조정 계층이 이 값을 재사용하므로 같은 파일을 다시 읽지 않는다.
   */
  content: string | null;
}

export interface ChangeConfirmerOptions {
  stat: StatFn;
  readContent: ReadContentFn;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  onConfirm: (event: ConfirmedFileEvent) => void;
  /** 유실 가능 조건이 감지되었을 때 호출된다 (REQ-WS-018). */
  onRescanNeeded?: (reason: string) => void;
  debounceMs?: number;
  maxPendingPaths?: number;
}

export interface ChangeConfirmer {
  /** 감시 대상 등록(열려 있지 않음). 1단계만 적용된다. */
  track(path: string, facts: FileFacts | null): void;
  /** 열린 파일 등록. `lastContent`는 버퍼가 마지막으로 로드·저장한 내용이다. */
  trackOpen(path: string, facts: FileFacts | null, lastContent: string): void;
  /** 버퍼가 새로 로드·저장되었을 때 2단계 대조 기준을 갱신한다. */
  setOpenContent(path: string, content: string): void;
  untrack(path: string): void;
  /** 앱 자신의 저장 직후 예상 상태를 기록한다 (REQ-WS-015). */
  noteSelfWrite(path: string, facts: FileFacts): void;
  /** 원시 감시 이벤트 투입. */
  ingest(event: RawWatchEvent): void;
  /** 열린 파일 전수 재검사 (REQ-WS-018). */
  rescan(): Promise<void>;
  readonly pendingCount: number;
  readonly trackedCount: number;
}

function sameFacts(a: FileFacts | null, b: FileFacts | null): boolean {
  if (a === null || b === null) return a === b;
  return a.size === b.size && a.mtimeMs === b.mtimeMs;
}

/**
 * 대소문자 비정규화 경로를 추적 중인 정규 경로로 되돌린다 (REQ-WS-017).
 *
 * 대소문자를 무시하고 무조건 접는 대신 **추적 중인 경로에 대해서만** 접는
 * 이유: 대소문자를 구분하는 파일시스템에서 `a.md`와 `A.MD`는 서로 다른
 * 파일이다. 우리가 아는 경로로만 되돌리면 그 구분을 깨지 않는다.
 */
function canonicalKey(path: string): string {
  return path.toLowerCase();
}

export function createChangeConfirmer(options: ChangeConfirmerOptions): ChangeConfirmer {
  const {
    stat,
    setTimer,
    clearTimer,
    readContent,
    onConfirm,
    onRescanNeeded,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    maxPendingPaths = DEFAULT_MAX_PENDING_PATHS,
  } = options;

  /** 정규 경로 → 마지막으로 확인한 사실. */
  const baseline = new Map<string, FileFacts | null>();
  /** 소문자 키 → 정규 경로. */
  const canonical = new Map<string, string>();
  /** 정규 경로 → 자기 저장 예상 사실 (1회용). */
  const selfWrites = new Map<string, FileFacts>();
  /** 열린 파일의 정규 경로 → 버퍼가 마지막으로 로드·저장한 내용 (2단계 기준). */
  const openContent = new Map<string, string>();
  /** 정규 경로 → 보류 타이머. 루트당 하나가 아니라 **경로당 하나**다. */
  const pending = new Map<string, unknown>();

  function resolvePath(path: string): string {
    return canonical.get(canonicalKey(path)) ?? path;
  }

  function register(path: string, facts: FileFacts | null): void {
    baseline.set(path, facts);
    canonical.set(canonicalKey(path), path);
  }

  async function settle(path: string): Promise<void> {
    pending.delete(path);
    const facts = await stat(path);
    const known = baseline.get(path) ?? null;

    // 자기 저장으로 예상한 상태와 일치하면 외부 변경이 아니다 (REQ-WS-015).
    const expected = selfWrites.get(path);
    if (expected && sameFacts(facts, expected)) {
      selfWrites.delete(path);
      register(path, facts);
      return;
    }

    // --- 1단계: 메타데이터 재검사 (모든 경로, 읽기 없음) ---
    // 재검사 결과가 기준선과 같으면 실제 변경이 아니다. 중복 발행·속성 변경
    // 이벤트가 여기서 걸러진다.
    if (sameFacts(facts, known)) return;

    if (facts === null) {
      register(path, null);
      onConfirm({ path, kind: 'deleted', facts: null, content: null });
      return;
    }

    // --- 2단계: 내용 대조 (열린 파일만) ---
    if (!openContent.has(path)) {
      // 열려 있지 않은 경로 — 폴더 수준 변경 신호로 확정하고 읽지 않는다.
      register(path, facts);
      onConfirm({ path, kind: 'changed', facts, content: null });
      return;
    }

    const diskContent = await readContent(path);
    if (diskContent !== null && diskContent === openContent.get(path)) {
      // 내용 동일 재작성 — 확정하지 않는다. 기준 사실만 갱신해 재발화를 막는다.
      register(path, facts);
      return;
    }

    // 읽지 못했으면(diskContent === null) 억제하지 않는다 — 비교 불가를
    // "같다"로 해석하면 진짜 변경을 삼킨다.
    register(path, facts);
    if (diskContent !== null) openContent.set(path, diskContent);
    onConfirm({ path, kind: 'changed', facts, content: diskContent });
  }

  return {
    track(path, facts) {
      register(path, facts);
    },

    trackOpen(path, facts, lastContent) {
      register(path, facts);
      openContent.set(path, lastContent);
    },

    setOpenContent(path, content) {
      openContent.set(resolvePath(path), content);
    },

    untrack(path) {
      const timer = pending.get(path);
      if (timer !== undefined) {
        clearTimer(timer);
        pending.delete(path);
      }
      baseline.delete(path);
      canonical.delete(canonicalKey(path));
      selfWrites.delete(path);
      openContent.delete(path);
    },

    noteSelfWrite(path, facts) {
      selfWrites.set(resolvePath(path), facts);
    },

    ingest(event) {
      const path = resolvePath(event.path);

      const existing = pending.get(path);
      if (existing !== undefined) {
        // 같은 경로의 후속 이벤트는 창을 연장한다 — 쓰기가 진행 중인 파일을
        // 부분적으로 읽지 않기 위함이다.
        clearTimer(existing);
      } else if (pending.size >= maxPendingPaths) {
        // 이벤트를 버리는 대신 재검사로 회수한다 (REQ-WS-018).
        onRescanNeeded?.('coalesce-overflow');
        return;
      }

      pending.set(
        path,
        setTimer(() => {
          void settle(path);
        }, debounceMs),
      );
    },

    async rescan() {
      for (const path of [...baseline.keys()]) {
        await settle(path);
      }
    },

    get pendingCount() {
      return pending.size;
    },

    get trackedCount() {
      return baseline.size;
    },
  };
}
