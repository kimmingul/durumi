import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  attachCompositionGate,
  attachReconciliationCompositionGate,
  type CompositionSink,
} from '../../src/editor/compositionGate';
import { useReconciliationStore } from '../../src/store/reconciliationStore';
import { noticeFor, type ConfirmedChange } from '@shared/reconciliation';

/**
 * IME 게이트의 단위 검증. 실제 OS IME 충실도는 e2e와 수동 스모크가 담당하지만,
 * **조합 중 버퍼를 건드리지 않는다**는 계약 자체는 여기서 결정적으로 고정된다.
 */

const CHANGE: ConfirmedChange = { path: '/w/a.md', content: '# disk\n', mtimeMs: 1, size: 7 };

let el: HTMLElement;
let deferred: Array<() => void>;
/** 주입 가능한 지연 스케줄러 — 테스트가 실행 시점을 통제한다. */
const defer = (fn: () => void): (() => void) => {
  deferred.push(fn);
  return () => {
    deferred = deferred.filter((f) => f !== fn);
  };
};
const flushDeferred = (): void => {
  const pending = deferred;
  deferred = [];
  for (const fn of pending) fn();
};

function fire(type: 'compositionstart' | 'compositionend', data = ''): void {
  el.dispatchEvent(new CompositionEvent(type, { data, bubbles: true }));
}

function makeSink(): CompositionSink & { starts: number; ends: number } {
  const sink = {
    starts: 0,
    ends: 0,
    onCompositionStart() {
      sink.starts += 1;
    },
    onCompositionEnd() {
      sink.ends += 1;
    },
  };
  return sink;
}

beforeEach(() => {
  el = document.createElement('div');
  document.body.appendChild(el);
  deferred = [];
  useReconciliationStore.getState().reset();
});

afterEach(() => {
  el.remove();
  useReconciliationStore.getState().reset();
});

describe('조합 경계 관찰 — REQ-WS-020 / table.ts 선례', () => {
  it('compositionstart를 감지한다', () => {
    const sink = makeSink();
    attachCompositionGate(el, sink, { defer });
    fire('compositionstart');
    expect(sink.starts).toBe(1);
  });

  it('조합 중임을 조회할 수 있다', () => {
    const sink = makeSink();
    const gate = attachCompositionGate(el, sink, { defer });
    expect(gate.isComposing()).toBe(false);
    fire('compositionstart');
    expect(gate.isComposing()).toBe(true);
    fire('compositionend');
    expect(gate.isComposing()).toBe(false);
    gate.detach();
  });
});

describe('compositionend는 동기적으로 드레인하지 않는다 — 회귀 방지의 핵심', () => {
  it('compositionend 시점에는 아직 조정을 풀지 않는다', () => {
    // 브라우저는 compositionend 이후에 확정 텍스트를 담은 input 이벤트를
    // 별도 태스크로 보낸다. 그 전에 문서를 바꾸면 IME의 composing-range
    // 추적이 어긋난다 — pendingInlineFormat.ts:12-32가 기록한 실패다.
    const sink = makeSink();
    attachCompositionGate(el, sink, { defer });
    fire('compositionstart');
    fire('compositionend');
    expect(sink.ends).toBe(0);
  });

  it('지연분이 실행된 뒤에야 조정을 푼다', () => {
    const sink = makeSink();
    attachCompositionGate(el, sink, { defer });
    fire('compositionstart');
    fire('compositionend');
    flushDeferred();
    expect(sink.ends).toBe(1);
  });

  it('연속 조합에서는 지연분이 취소되어 보류가 유지된다', () => {
    // 한글은 음절이 연달아 조합된다. compositionend 직후 다음 음절의
    // compositionstart가 오면 조정이 그 사이를 비집고 들어가면 안 된다.
    const sink = makeSink();
    const gate = attachCompositionGate(el, sink, { defer });
    fire('compositionstart');
    fire('compositionend');
    fire('compositionstart'); // 다음 음절
    flushDeferred();

    expect(sink.ends).toBe(0);
    expect(gate.isComposing()).toBe(true);
  });

  it('연속 조합이 끝나면 그때 한 번 푼다', () => {
    const sink = makeSink();
    attachCompositionGate(el, sink, { defer });
    for (let i = 0; i < 3; i++) {
      fire('compositionstart');
      fire('compositionend');
      flushDeferred();
    }
    expect(sink.starts).toBe(3);
    expect(sink.ends).toBe(3);
  });
});

describe('비정상 이벤트열에도 상태가 깨지지 않는다', () => {
  it('start 없는 end는 무시한다', () => {
    const sink = makeSink();
    attachCompositionGate(el, sink, { defer });
    fire('compositionend');
    flushDeferred();
    expect(sink.ends).toBe(0);
  });

  it('중복 start는 한 번만 센다', () => {
    const sink = makeSink();
    const gate = attachCompositionGate(el, sink, { defer });
    fire('compositionstart');
    fire('compositionstart');
    expect(sink.starts).toBe(1);
    expect(gate.isComposing()).toBe(true);
  });

  it('detach 후에는 이벤트를 받지 않는다', () => {
    const sink = makeSink();
    const gate = attachCompositionGate(el, sink, { defer });
    gate.detach();
    fire('compositionstart');
    fire('compositionend');
    flushDeferred();
    expect(sink.starts).toBe(0);
    expect(sink.ends).toBe(0);
  });

  it('detach가 보류 중인 지연분을 취소한다', () => {
    const sink = makeSink();
    const gate = attachCompositionGate(el, sink, { defer });
    fire('compositionstart');
    fire('compositionend');
    gate.detach();
    flushDeferred();
    expect(sink.ends).toBe(0);
  });
});

describe('조정 계층 배선 — AC-WS-023b, REQ-WS-020, 021', () => {
  it('실제 조합이 조정 계층을 보류 상태로 들여보낸다 (AC-WS-023b)', () => {
    const gate = attachReconciliationCompositionGate(el, { defer });
    const store = useReconciliationStore.getState();

    fire('compositionstart');
    store.dispatch({ type: 'external-change', change: CHANGE });

    expect(useReconciliationStore.getState().state.status).toBe('held-composition');
    gate.detach();
  });

  it('보류 중 버퍼 적용 effect가 나가지 않는다 (REQ-WS-020)', () => {
    const applied: string[] = [];
    const gate = attachReconciliationCompositionGate(el, { defer });
    useReconciliationStore.getState().setEffectHandler((e) => {
      if (e.kind === 'apply-to-buffer') applied.push(e.content);
    });

    fire('compositionstart');
    useReconciliationStore.getState().dispatch({ type: 'external-change', change: CHANGE });
    expect(applied).toEqual([]);

    // compositionend 시점에도 아직 적용되지 않는다.
    fire('compositionend');
    expect(applied).toEqual([]);

    flushDeferred();
    expect(applied).toEqual(['# disk\n']);
    gate.detach();
  });

  it('보류 표면이 비침습적이다 (AC-WS-023a가 검증한 표면)', () => {
    const probe = document.createElement('input');
    document.body.appendChild(probe);
    probe.focus();
    const before = document.activeElement;

    const gate = attachReconciliationCompositionGate(el, { defer });
    fire('compositionstart');
    useReconciliationStore.getState().dispatch({ type: 'external-change', change: CHANGE });

    const notice = noticeFor(useReconciliationStore.getState().state)!;
    expect(notice.presentation).toBe('status');
    expect(notice.actions).toEqual([]);
    expect(document.activeElement).toBe(before);

    gate.detach();
    probe.remove();
  });

  it('보류 중 복수 변경은 조합 종료 후 최종 상태 1회만 적용된다 (REQ-WS-021)', () => {
    const applied: string[] = [];
    const gate = attachReconciliationCompositionGate(el, { defer });
    useReconciliationStore.getState().setEffectHandler((e) => {
      if (e.kind === 'apply-to-buffer') applied.push(e.content);
    });

    fire('compositionstart');
    for (const c of ['v1', 'v2', 'v3']) {
      useReconciliationStore
        .getState()
        .dispatch({ type: 'external-change', change: { ...CHANGE, content: c } });
    }
    fire('compositionend');
    flushDeferred();

    expect(applied).toEqual(['v3']);
    gate.detach();
  });

  it('연속 조합 사이에 조정이 끼어들지 않는다', () => {
    const applied: string[] = [];
    const gate = attachReconciliationCompositionGate(el, { defer });
    useReconciliationStore.getState().setEffectHandler((e) => {
      if (e.kind === 'apply-to-buffer') applied.push(e.content);
    });

    fire('compositionstart');
    useReconciliationStore.getState().dispatch({ type: 'external-change', change: CHANGE });
    fire('compositionend');
    fire('compositionstart'); // 다음 음절이 먼저 도착
    flushDeferred();

    expect(applied).toEqual([]);
    expect(useReconciliationStore.getState().state.status).toBe('held-composition');
    gate.detach();
  });
});

describe('기본 스케줄러', () => {
  it('주입하지 않으면 매크로태스크로 미룬다', () => {
    vi.useFakeTimers();
    const sink = makeSink();
    const gate = attachCompositionGate(el, sink);
    fire('compositionstart');
    fire('compositionend');
    expect(sink.ends).toBe(0); // 마이크로태스크로는 풀리지 않는다
    vi.advanceTimersByTime(1);
    expect(sink.ends).toBe(1);
    gate.detach();
    vi.useRealTimers();
  });
});
