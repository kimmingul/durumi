import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  PANEL_EVENT_NAMES,
  acceptsPanelEvent,
  addPanelScopedListener,
  dispatchPanelEvent,
  panelIdOfEvent,
  withPanelId,
} from '../../src/editor/panelEvents';
import { resetPanelViews, setPanelView, panelIdOfView } from '../../src/store/panelViews';

/**
 * 창 전역 이벤트가 **발신 패널을 식별**하는가 (REQ-PANEL-034, AC-PANEL-034).
 *
 * ## 이 검사가 막는 결함
 *
 * 수신 측은 `window`에 붙는다. 패널이 N개면 N개의 수신기가 같은 이벤트에
 * 반응하고, `EditorToolbar`처럼 패널마다 하나씩 마운트되는 수신기는 링크
 * 대화상자를 N개 연다. 요구가 "N개의 대화상자가 동시에 열린다"를 이름으로
 * 지목한 이유다.
 *
 * 여섯 이벤트 전부에 대해 같은 단언을 돌린다 — AC-PANEL-034가 이름으로 열거한
 * 목록이 그대로 `PANEL_EVENT_NAMES`이므로, 목록이 늘거나 줄면 이 검사가 함께
 * 따라간다.
 */

function makeView(): EditorView {
  return new EditorView({ state: EditorState.create({ doc: '본문\n' }) });
}

let viewA: EditorView;
let viewB: EditorView;

beforeEach(() => {
  resetPanelViews();
  viewA = makeView();
  viewB = makeView();
  setPanelView('panel-A', viewA);
  setPanelView('panel-B', viewB);
});

afterEach(() => {
  viewA.destroy();
  viewB.destroy();
  resetPanelViews();
});

describe('발신 패널의 식별', () => {
  it('뷰로부터 그 뷰가 속한 패널을 되찾는다', () => {
    expect(panelIdOfView(viewA)).toBe('panel-A');
    expect(panelIdOfView(viewB)).toBe('panel-B');
  });

  it('등록되지 않은 뷰는 식별되지 않는다 — 추측하지 않는다', () => {
    const orphan = makeView();
    try {
      expect(panelIdOfView(orphan)).toBeNull();
    } finally {
      orphan.destroy();
    }
  });

  it('`withPanelId`는 기존 detail 필드를 보존한 채 발신 패널만 덧붙인다', () => {
    const detail = withPanelId(viewA, { from: 12, to: 20 });
    expect(detail).toEqual({ from: 12, to: 20, panelId: 'panel-A' });
  });

  for (const name of PANEL_EVENT_NAMES) {
    it(`\`${name}\`은 발신 패널을 싣는다`, () => {
      let seen: string | null | undefined;
      const onEvent = (e: Event) => { seen = panelIdOfEvent(e); };
      window.addEventListener(name, onEvent);
      try {
        dispatchPanelEvent(viewA, name);
      } finally {
        window.removeEventListener(name, onEvent);
      }
      expect(seen).toBe('panel-A');
    });
  }
});

describe('AC-PANEL-034 — 자기 패널이 발신자가 아닌 이벤트는 처리하지 않는다', () => {
  for (const name of PANEL_EVENT_NAMES) {
    it(`\`${name}\`: 패널 A의 발신에 A만 반응한다`, () => {
      let a = 0;
      let b = 0;
      const detachA = addPanelScopedListener(name, () => 'panel-A', () => { a += 1; });
      const detachB = addPanelScopedListener(name, () => 'panel-B', () => { b += 1; });
      try {
        dispatchPanelEvent(viewA, name);
      } finally {
        detachA();
        detachB();
      }
      expect(a, '발신 패널의 수신기가 반응하지 않았다').toBe(1);
      expect(b, '다른 패널의 수신기가 반응했다 — N개의 대화상자가 열린다').toBe(0);
    });
  }

  it('구독을 해제하면 더는 반응하지 않는다', () => {
    let n = 0;
    const detach = addPanelScopedListener('durumi:memo-focus', () => 'panel-A', () => { n += 1; });
    dispatchPanelEvent(viewA, 'durumi:memo-focus');
    detach();
    dispatchPanelEvent(viewA, 'durumi:memo-focus');
    expect(n).toBe(1);
  });
});

describe('식별할 수 없는 발신자', () => {
  it('발신 패널이 없는 이벤트는 모든 수신기가 처리한다', () => {
    // 조용히 버리면 기능이 이유 없이 죽는다. "식별 불가"는 "누구의 것도 아니다"가
    // 아니라 "모두의 것"이다.
    const legacy = new CustomEvent('durumi:memo-focus', { detail: { from: 3 } });
    expect(acceptsPanelEvent(legacy, 'panel-A')).toBe(true);
    expect(acceptsPanelEvent(legacy, 'panel-B')).toBe(true);
  });

  it('자기 패널을 아직 모르는 수신기는 처리한다', () => {
    const scoped = new CustomEvent('durumi:memo-focus', { detail: { panelId: 'panel-A' } });
    expect(acceptsPanelEvent(scoped, null)).toBe(true);
  });
});
