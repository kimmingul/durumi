import { useReconciliationStore } from '../store/reconciliationStore';

/**
 * IME 조합 게이트 — 조합이 열려 있는 동안 조정이 버퍼를 건드리지 못하게 막는다.
 *
 * **왜 렌더러에 있는가**: 조합 상태는 렌더러에만 존재한다. main은 "외부 변경이
 * 확정됨"만 알리고 적용 시점 판단은 여기서 한다 (plan.md §B.2).
 *
 * **왜 compositionend에서 곧바로 풀지 않는가** — 이 파일의 핵심이다.
 * 브라우저는 `compositionend` 다음에 확정 텍스트를 담은 `input` 이벤트를
 * **별도 태스크로** 보낸다. 그 사이에 문서를 바꾸면 IME의 composing-range
 * 추적이 어긋난다. 이것은 추측이 아니라 이 저장소가 이미 겪은 실패다 —
 * `src/editor/keymap/pendingInlineFormat.ts:12-32`이 v0.2.29에서
 * "rewriting the doc during composition (even on the first event) confuses
 * the IME's composing-range tracking"라고 기록했고, 그 파일은 결국 Word식
 * 타입어헤드 UX를 포기하고 IME 안전을 택했다.
 *
 * 그래서 `compositionend`는 **드레인을 예약만** 하고, 예약분이 실행되기 전에
 * 다음 `compositionstart`가 오면 취소한다. 한글은 음절이 연달아 조합되므로
 * 이 취소가 없으면 음절 사이의 좁은 틈으로 조정이 비집고 들어간다.
 *
 * 관찰 방식은 이 저장소의 유일한 실행 코드 선례인
 * `src/editor/decorations/table.ts:810-926`을 따른다 —
 * `compositionstart`/`compositionend` 리스너로 플래그를 유지하는 형태다.
 * 다만 그 구현은 표 셀 전용이므로 에디터 일반 표면용은 여기서 새로 만든다.
 */

export interface CompositionSink {
  onCompositionStart(): void;
  onCompositionEnd(): void;
}

export interface CompositionGateOptions {
  /**
   * `compositionend` 이후 드레인을 미루는 스케줄러. 취소 함수를 돌려줘야 한다.
   * 기본값은 매크로태스크(`setTimeout(…, 0)`)다 — 마이크로태스크는 확정
   * `input` 이벤트보다 **먼저** 실행되므로 이 목적에 쓸 수 없다.
   */
  defer?: (fn: () => void) => () => void;
}

export interface CompositionGate {
  isComposing(): boolean;
  detach(): void;
}

const defaultDefer = (fn: () => void): (() => void) => {
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
};

export function attachCompositionGate(
  target: HTMLElement,
  sink: CompositionSink,
  options: CompositionGateOptions = {},
): CompositionGate {
  const defer = options.defer ?? defaultDefer;
  let composing = false;
  let cancelPendingEnd: (() => void) | null = null;

  const clearPending = (): void => {
    cancelPendingEnd?.();
    cancelPendingEnd = null;
  };

  const onStart = (): void => {
    // 예약된 드레인이 있으면 취소한다 — 연속 조합의 틈을 막는다.
    clearPending();
    if (composing) return; // 중복 start는 한 번으로 본다
    composing = true;
    sink.onCompositionStart();
  };

  const onEnd = (): void => {
    if (!composing) return; // start 없는 end는 무시한다
    composing = false;
    clearPending();
    cancelPendingEnd = defer(() => {
      cancelPendingEnd = null;
      sink.onCompositionEnd();
    });
  };

  target.addEventListener('compositionstart', onStart);
  target.addEventListener('compositionend', onEnd);

  return {
    isComposing: () => composing,
    detach() {
      target.removeEventListener('compositionstart', onStart);
      target.removeEventListener('compositionend', onEnd);
      clearPending();
    },
  };
}

/**
 * 게이트를 조정 스토어에 배선한다. 에디터의 편집 표면(CodeMirror `contentDOM`)에
 * 붙인다.
 */
export function attachReconciliationCompositionGate(
  target: HTMLElement,
  options: CompositionGateOptions = {},
): CompositionGate {
  return attachCompositionGate(
    target,
    {
      onCompositionStart() {
        useReconciliationStore.getState().dispatch({ type: 'composition-start' });
      },
      onCompositionEnd() {
        useReconciliationStore.getState().dispatch({ type: 'composition-end' });
      },
    },
    options,
  );
}
