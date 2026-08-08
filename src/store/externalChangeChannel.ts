import type { ExternalFileChange } from '@shared/ipc-contract';
import { useReconciliationStore } from './reconciliationStore';

/**
 * main에서 올라온 확정 외부 변경을 조정 상태 기계로 넘기는 배선.
 *
 * 세 갈래가 **서로 다른 상태**로 가야 한다. 하나로 뭉뚱그리면 삭제나 디코드
 * 실패가 정상 변경으로 처리되어 버퍼를 덮어쓴다 — REQ-WS-030·031이 각각
 * 금지하는 결과다.
 *
 * | 입력 | 조정 이벤트 | 근거 |
 * |---|---|---|
 * | `kind: 'deleted'` | `external-delete` | REQ-WS-030 (버퍼 보존) |
 * | `decodeError` 있음 | `decode-error` | REQ-WS-031 (조정 중단) |
 * | 내용 있음 | `external-change` | REQ-WS-024·027 (정책이 판정) |
 *
 * 내용도 오류도 없는 조합은 있을 수 없지만, 통과시키면 null을 정상 내용으로
 * 넘기게 되므로 명시적으로 무시한다.
 */

/** 구독만 필요로 하는 최소 인터페이스 — 테스트가 `window.api` 없이 구동한다. */
export interface ExternalChangeSource {
  onExternalFileChange: (cb: (change: ExternalFileChange) => void) => () => void;
}

/** 구독 해제 클로저를 반환한다 (C-3). */
export function attachExternalChangeChannel(source: ExternalChangeSource): () => void {
  return source.onExternalFileChange((change) => {
    const { dispatch } = useReconciliationStore.getState();

    if (change.kind === 'deleted') {
      dispatch({ type: 'external-delete', path: change.path });
      return;
    }
    if (change.decodeError !== null) {
      dispatch({ type: 'decode-error', path: change.path, message: change.decodeError });
      return;
    }
    if (change.content === null) return;

    dispatch({
      type: 'external-change',
      change: {
        path: change.path,
        content: change.content,
        mtimeMs: change.mtimeMs,
        size: change.size,
      },
    });
  });
}
