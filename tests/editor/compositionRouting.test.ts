import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EditorState, type Transaction } from '@codemirror/state';
import type { ReconciliationEffect } from '@shared/reconciliation';
import {
  useReconciliationStore,
  type RoutedReconciliationEvent,
} from '../../src/store/reconciliationStore';
import { registerReconciliationExecutor } from '../../src/editor/applyExternalChange';
import { attachReconciliationCompositionGate } from '../../src/editor/compositionGate';

/**
 * SPEC-V03-WORKSPACE-002 M0 — 조합(IME) 보류의 **문서 축 분리**와 게이트 정리.
 *
 * `shared/reconciliation.ts:57`의 `composing`은 창 전역 단일 boolean이었고 어느
 * 게이트든 그것을 썼다. 그래서 다른 표면의 `compositionend`가 진행 중인 조합의
 * 보류를 풀었고, `detach()`는 `onCompositionEnd()`를 부르지 않아 조합 중
 * 언마운트가 조정을 **영구 동결**시켰다.
 *
 * IME 안전은 이 저장소의 최우선 축이다 — v0.2.19~.28 계열이 다섯 번 출하되었다.
 *
 * 대상 AC: AC-PANEL-081 / 081b / 081c.
 */

// ---------------------------------------------------------------------------
// 스토어 어댑터 — AC 단언이 스토어 API 형태에 매이지 않도록 한 곳에 모은다.
// ---------------------------------------------------------------------------

type Handler = (effect: ReconciliationEffect) => void;

const store = () => useReconciliationStore.getState();

const bindTarget = (path: string, handler: Handler): (() => void) => {
  store().setEffectHandlerFor(path, handler);
  return () => store().setEffectHandlerFor(path, null);
};
const stateOf = (path: string) => store().stateFor(path);
const send = (path: string, event: RoutedReconciliationEvent): void => {
  store().dispatchFor(path, event);
};
/** 그 표면의 조합 게이트를 그 표면이 보고 있는 문서에 붙인다. */
const gateOn = (el: HTMLElement, path: string, defer: (fn: () => void) => () => void) =>
  attachReconciliationCompositionGate(el, () => path, { defer });

// ---------------------------------------------------------------------------

const CHANGE = (path: string, content: string) => ({ path, content, mtimeMs: 1, size: content.length });

let deferred: Array<() => void>;
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

const fire = (el: HTMLElement, type: 'compositionstart' | 'compositionend'): void => {
  el.dispatchEvent(new CompositionEvent(type, { bubbles: true }));
};

/** 편집 표면 하나 — 자기 요소·자기 문서·자기 적용 대상을 갖는다. */
function makeSurface(path: string, initial: string) {
  const el = document.createElement('div');
  document.body.appendChild(el);

  let docState = EditorState.create({ doc: initial });
  const target = {
    get state() {
      return docState;
    },
    dispatch(tr: Transaction) {
      docState = tr.state;
    },
  };

  const applies: string[] = [];
  const detachExecutor = registerReconciliationExecutor(target, (h) => {
    if (h === null) {
      bindTarget(path, () => {})();
      return;
    }
    bindTarget(path, (effect) => {
      if (effect.kind === 'apply-to-buffer') applies.push(effect.content);
      h(effect);
    });
  });

  return {
    el,
    path,
    applies,
    text: () => docState.doc.toString(),
    detachExecutor,
    dispose() {
      detachExecutor();
      el.remove();
    },
  };
}

beforeEach(() => {
  deferred = [];
  store().reset();
});
afterEach(() => {
  store().reset();
  document.body.replaceChildren();
});

// ---------------------------------------------------------------------------

describe('AC-PANEL-081 — 다른 표면의 조합 종료가 진행 중인 조합의 보류를 해제하지 않는다', () => {
  it('표면 B의 compositionend가 표면 A의 보류를 풀지 않는다', () => {
    const a = makeSurface('/w/a.md', 'A 버퍼\n');
    const b = makeSurface('/w/b.md', 'B 버퍼\n');
    const gateA = gateOn(a.el, a.path, defer);
    const gateB = gateOn(b.el, b.path, defer);

    // 표면 A에서 한글 조합이 열리고, A의 문서에 확정 변경이 큐에 들어간다.
    fire(a.el, 'compositionstart');
    send('/w/a.md', { type: 'external-change', change: CHANGE('/w/a.md', 'A 디스크\n') });
    expect(stateOf('/w/a.md')?.status).toBe('held-composition');

    // 표면 B에서 조합이 열렸다 닫히고 지연 드레인까지 실행된다.
    fire(b.el, 'compositionstart');
    fire(b.el, 'compositionend');
    flushDeferred();

    expect(stateOf('/w/a.md')?.status, '다른 표면의 조합 종료가 A의 보류를 풀었다').toBe(
      'held-composition',
    );
    expect(a.applies, '보류 중인데 apply-to-buffer가 산출되었다').toEqual([]);
    expect(a.text()).toBe('A 버퍼\n');

    // 표면 A 자신이 조합을 끝내고 드레인이 실행된 뒤에야 정책 라우터로 간다.
    fire(a.el, 'compositionend');
    flushDeferred();
    expect(a.applies).toEqual(['A 디스크\n']);

    gateA.detach();
    gateB.detach();
    a.dispose();
    b.dispose();
  });
});

describe('AC-PANEL-081b — 게이트 detach가 조합 보류를 영구화하지 않는다', () => {
  it('조합 중 detach하면 보류가 해제되고 큐가 드레인된다', () => {
    const a = makeSurface('/w/a.md', 'A 버퍼\n');
    const gate = gateOn(a.el, a.path, defer);

    fire(a.el, 'compositionstart');
    send('/w/a.md', { type: 'external-change', change: CHANGE('/w/a.md', 'A 디스크\n') });
    expect(stateOf('/w/a.md')?.composing).toBe(true);
    expect(stateOf('/w/a.md')?.status).toBe('held-composition');

    // compositionend 없이 언마운트 — 오늘은 여기서 composing이 영구 latch된다.
    gate.detach();

    expect(stateOf('/w/a.md')?.composing, 'detach 후에도 composing이 참이다').toBe(false);
    expect(a.applies, '큐에 있던 확정 변경이 드레인되지 않았다').toEqual(['A 디스크\n']);
    expect(a.text()).toBe('A 디스크\n');

    // 이후 조정도 계속 동작한다 — 그 문서가 동결되지 않았다.
    send('/w/a.md', { type: 'external-change', change: CHANGE('/w/a.md', '그 다음\n') });
    expect(a.applies).toEqual(['A 디스크\n', '그 다음\n']);

    a.dispose();
  });

  it('PRESERVE — 지연 드레인과 연속 조합 취소 로직은 그대로다', () => {
    const a = makeSurface('/w/a.md', 'A 버퍼\n');
    const gate = gateOn(a.el, a.path, defer);

    // (1) compositionend는 동기적으로 드레인하지 않는다.
    fire(a.el, 'compositionstart');
    send('/w/a.md', { type: 'external-change', change: CHANGE('/w/a.md', 'A 디스크\n') });
    fire(a.el, 'compositionend');
    expect(a.applies, 'compositionend가 동기적으로 드레인했다').toEqual([]);

    // (2) 다음 음절의 compositionstart가 예약된 드레인을 취소한다.
    fire(a.el, 'compositionstart');
    flushDeferred();
    expect(a.applies, '연속 조합 사이로 조정이 비집고 들어왔다').toEqual([]);
    expect(stateOf('/w/a.md')?.status).toBe('held-composition');

    gate.detach();
    a.dispose();
  });
});

describe('AC-PANEL-081c — 해제가 실행자 분리보다 먼저 일어나 드레인이 손실되지 않는다', () => {
  it('패널 정리에서 보류분의 apply-to-buffer가 실행자에 도달한다', () => {
    const a = makeSurface('/w/a.md', 'A 버퍼\n');
    const gate = gateOn(a.el, a.path, defer);

    fire(a.el, 'compositionstart');
    send('/w/a.md', { type: 'external-change', change: CHANGE('/w/a.md', 'A 디스크\n') });
    expect(stateOf('/w/a.md')?.status).toBe('held-composition');

    // 선택한 규정: **해제가 실행자 분리보다 먼저**. 순서를 뒤집으면 드레인된
    // effect가 `handler?.(effect)`의 옵셔널 체이닝에 조용히 삼켜지고 상태만
    // settled로 정착한다 — 버퍼는 변경을 받지 못했는데 완료를 주장하는 조합이다.
    gate.detach();
    a.detachExecutor();

    expect(a.applies, '보류분이 실행자에 도달하지 않았다').toHaveLength(1);
    expect(a.text()).toBe('A 디스크\n');

    const settledButUnapplied =
      stateOf('/w/a.md') !== null && stateOf('/w/a.md')!.status === 'idle' && a.applies.length === 0;
    expect(settledButUnapplied, '버퍼는 못 받았는데 상태가 완료를 주장한다').toBe(false);

    a.el.remove();
  });

  it('규정이 소스에서 확인 가능하다 — 정리 함수가 해제를 먼저 수행한다', () => {
    // 규정 없이 두는 것이 이 AC의 실패 조건이므로, 택한 규정이 소스에
    // 드러나야 한다.
    const src = readFileSync(join(process.cwd(), 'src', 'editor', 'MarkdownEditor.tsx'), 'utf8');
    const release = src.lastIndexOf('compositionGate.detach()');
    const detachExec = src.lastIndexOf('detachExecutor');

    expect(release, '조합 게이트 해제 호출이 없다').toBeGreaterThan(-1);
    expect(detachExec, '실행자 분리 호출이 없다').toBeGreaterThan(-1);
    expect(release, '해제가 실행자 분리보다 뒤에 있다').toBeLessThan(detachExec);
    expect(src, '택한 규정의 근거가 소스에 없다').toContain('REQ-PANEL-071a');
  });
});
