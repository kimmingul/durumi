import { useReconciliationStore, type CompositionGateToken } from '../store/reconciliationStore';

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
      // 조합 중 detach되면 그 게이트가 쥐고 있던 보류를 **해제한다**
      // (SPEC-V03-WORKSPACE-002 REQ-PANEL-071). 해제하지 않으면 조합 중
      // 언마운트가 보류를 영구 latch시켜 이후 어떤 외부 변경도 적용되지 않는다
      // — 오류도 나지 않고 상태도 정상으로 보인다.
      //
      // 여기서만 **동기적으로** 푸는 것이 위 `onEnd`의 지연 드레인과 모순되지
      // 않는다: 지연은 `compositionend` 다음에 오는 확정 `input` 이벤트를
      // 기다리기 위한 것인데, detach된 표면에는 그 이벤트가 오지 않는다.
      if (composing) {
        composing = false;
        sink.onCompositionEnd();
      }
    },
  };
}

/**
 * 게이트를 조정 스토어에 배선한다. 에디터의 편집 표면(CodeMirror `contentDOM`)에
 * 붙인다.
 *
 * **조합은 표면에서 일어나고 조정 판정은 문서에 대해 일어난다** — 두 축이
 * 다르다(`design.md` §6.3). 그래서 게이트는 자기 식별자를 들고 자기가 보고 있는
 * 문서에 합류(OR)하며, 스토어가 "이 문서를 보는 게이트 중 하나라도 조합 중인가"를
 * 판정한다. 게이트마다 식별자가 다르므로 다른 표면의 조합 종료가 이 표면의
 * 보류를 풀 수 없다(REQ-PANEL-071).
 *
 * `resolvePath`가 함수인 이유: 패널은 문서를 갈아탄다. 조합이 **열린 시점의**
 * 경로를 붙들어 두어야, 조합 도중 재바인딩이 일어나도 해제가 같은 문서로 간다.
 */
export function attachReconciliationCompositionGate(
  target: HTMLElement,
  resolvePath: () => string | null,
  options: CompositionGateOptions = {},
): CompositionGate {
  const gate: CompositionGateToken = Symbol('composition-gate');
  let heldPath: string | null = null;

  return attachCompositionGate(
    target,
    {
      onCompositionStart() {
        heldPath = resolvePath();
        useReconciliationStore.getState().compositionStart(heldPath, gate);
      },
      onCompositionEnd() {
        useReconciliationStore.getState().compositionEnd(heldPath, gate);
        heldPath = null;
      },
    },
    options,
  );
}
