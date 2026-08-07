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
 * 이 모듈은 **내용을 읽지 않는다**. REQ-WS-014가 지정한 확정 기준이 크기와
 * 수정시각이고, 내용 읽기와 디코드 실패 판정(REQ-WS-031)은 조정 계층으로
 * 넘어가는 다음 단계의 일이다.
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
}

export interface ChangeConfirmerOptions {
  stat: StatFn;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  onConfirm: (event: ConfirmedFileEvent) => void;
  /** 유실 가능 조건이 감지되었을 때 호출된다 (REQ-WS-018). */
  onRescanNeeded?: (reason: string) => void;
  debounceMs?: number;
  maxPendingPaths?: number;
}

export interface ChangeConfirmer {
  /** 감시 대상 등록. `facts`는 등록 시점의 기준선(없으면 null). */
  track(path: string, facts: FileFacts | null): void;
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

    // 재검사 결과가 기준선과 같으면 실제 내용 변경이 아니다 (REQ-WS-014).
    // 중복 발행·속성 변경 이벤트가 여기서 걸러진다.
    if (sameFacts(facts, known)) return;

    register(path, facts);
    onConfirm(
      facts === null
        ? { path, kind: 'deleted', facts: null }
        : { path, kind: 'changed', facts },
    );
  }

  return {
    track(path, facts) {
      register(path, facts);
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
