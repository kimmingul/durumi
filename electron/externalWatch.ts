import type { ExternalFileChange } from '../shared/ipc-contract';
import {
  createChangeConfirmer,
  type ChangeConfirmer,
  type FileFacts,
  type RawWatchEvent,
} from './changeConfirmation';

/**
 * main→렌더러 채널의 **다리**.
 *
 * M4의 확정 계층은 크기·수정시각으로 변경을 판정하고(`ConfirmedFileEvent`),
 * M2의 조정 계층은 내용을 담은 형태를 소비한다. 그 사이에 내용 읽기가 있고,
 * 그 읽기는 **디코드에 실패할 수 있다** — REQ-WS-031이 규정한 경로다.
 *
 * 두 타입을 억지로 하나로 합치지 않고 이 모듈이 변환을 맡는다. 확정은
 * 확정대로(읽지 않는 1단계 + 열린 파일만 읽는 2단계), 조정은 조정대로 남는다.
 *
 * **디코드 실패를 대체 문자로 때우지 않는다.** `TextDecoder`의 기본 동작은
 * 잘못된 바이트를 U+FFFD로 바꾸는 것인데, 그러면 조정 계층이 그것을 정상
 * 내용으로 받아 버퍼를 손상된 텍스트로 덮어쓴다. `fatal: true`로 실패를
 * 실패로 남기고 사유를 함께 올려 보낸다.
 *
 * **신뢰 경계**: 감시 등록 전에 반드시 `assertAllowed`를 통과시킨다
 * (REQ-WS-019). 검증에 실패하면 추적도 시작하지 않는다 — 등록만 막고 추적을
 * 남기면 이후 이벤트가 조용히 흘러든다.
 */

export interface ExternalWatchDeps {
  stat: (path: string) => Promise<FileFacts | null>;
  readBytes: (path: string) => Promise<Uint8Array>;
  /** 신뢰 밖이면 throw. 기존 `assertAllowedPath`가 들어온다. */
  assertAllowed: (path: string) => Promise<void>;
  watchPath: (path: string) => Promise<void>;
  unwatchPath: (path: string) => Promise<void>;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

export interface ExternalWatchService {
  /** 열린 파일 감시 시작. `currentContent`는 버퍼가 지금 담고 있는 내용이다. */
  watchFile(path: string, currentContent: string): Promise<void>;
  unwatchFile(path: string): Promise<void>;
  /** 버퍼가 저장·재로드되어 기준 내용이 바뀌었을 때. */
  setOpenContent(path: string, content: string): void;
  /** 앱 자신의 저장 직후 예상 상태 (REQ-WS-015). */
  noteSelfWrite(path: string, facts: FileFacts): void;
  /** 원시 감시 이벤트 투입. */
  ingest(event: RawWatchEvent): void;
  rescan(): Promise<void>;
}

/** 유효한 UTF-8이면 문자열, 아니면 null. 대체 문자로 때우지 않는다. */
export function decodeUtf8Strict(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function createExternalWatchService(
  deps: ExternalWatchDeps,
  emit: (change: ExternalFileChange) => void,
): ExternalWatchService {
  /** 경로 → 마지막 디코드 실패 사유. 성공하면 지운다. */
  const decodeErrors = new Map<string, string>();
  /**
   * 이 서비스가 소유한 열린 파일 경로.
   *
   * 확정 계층은 추적하지 않던 경로의 이벤트를 "새 파일 생성"으로 확정한다 —
   * 규약 폴더 감시(REQ-WS-045)에는 맞지만 이 채널에는 틀리다. 그대로 두면
   * `assertAllowed`에 **실패한 경로의 이벤트도** 읽혀서 내용이 렌더러로
   * 올라간다. 소유 목록 밖의 이벤트는 여기서 끊는다.
   */
  const owned = new Set<string>();

  const confirmer: ChangeConfirmer = createChangeConfirmer({
    stat: deps.stat,
    readContent: async (path) => {
      let bytes: Uint8Array;
      try {
        bytes = await deps.readBytes(path);
      } catch (err) {
        decodeErrors.set(path, err instanceof Error ? err.message : String(err));
        return null;
      }
      const text = decodeUtf8Strict(bytes);
      if (text === null) {
        decodeErrors.set(path, '유효한 텍스트로 디코드되지 않았습니다 (UTF-8 아님)');
        return null;
      }
      decodeErrors.delete(path);
      return text;
    },
    setTimer: deps.setTimer,
    clearTimer: deps.clearTimer,
    onConfirm: (event) => {
      emit({
        path: event.path,
        kind: event.kind,
        content: event.content,
        // 삭제는 읽기를 시도하지 않으므로 디코드 오류가 아니다.
        decodeError: event.kind === 'deleted' ? null : (decodeErrors.get(event.path) ?? null),
        size: event.facts?.size ?? 0,
        mtimeMs: event.facts?.mtimeMs ?? 0,
      });
    },
  });

  return {
    async watchFile(path, currentContent) {
      // 검증이 먼저다. 실패하면 추적도 등록도 하지 않는다.
      await deps.assertAllowed(path);
      const facts = await deps.stat(path);
      confirmer.trackOpen(path, facts, currentContent);
      owned.add(path);
      await deps.watchPath(path);
    },

    async unwatchFile(path) {
      confirmer.untrack(path);
      owned.delete(path);
      decodeErrors.delete(path);
      await deps.unwatchPath(path);
    },

    setOpenContent(path, content) {
      confirmer.setOpenContent(path, content);
    },

    noteSelfWrite(path, facts) {
      confirmer.noteSelfWrite(path, facts);
    },

    ingest(event) {
      if (!owned.has(event.path)) return;
      confirmer.ingest(event);
    },

    rescan() {
      return confirmer.rescan();
    },
  };
}
