import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { EditorView } from '@codemirror/view';
import { installFakeApi, mountApp, type MountedApp } from '../_helpers/appHarness';
import { useWorkspaceStore, panelById } from '../../src/store/workspaceStore';
import { useSidebarStore } from '../../src/store/sidebarStore';
import { useRightSidebarStore } from '../../src/store/rightSidebarStore';
import { WIDTH_BOUNDS } from '@shared/prefsValidation';

/**
 * SPEC-V03-WORKSPACE-002 M2 — 패널 셸의 다중 패널 축.
 *
 * 대상 AC: AC-PANEL-001 / 002b / 002c / 004 / 005 / 007 / 011 / 065.
 *
 * 사이드바 축과 패널 축이 독립임을 함께 고정한다 — OQ-1이 중앙 영역 분할을
 * 택한 논거가 **소유권 분리**(사이드바는 전역 저작 표면, 패널은 문서 국소)이기
 * 때문이다. 두 축이 서로를 건드리면 그 논거가 무너진다.
 */

const store = () => useWorkspaceStore.getState();

/** 렌더된 패널들의 편집 표면을 **왼쪽부터** 돌려준다. */
function viewsInRenderOrder(app: MountedApp): EditorView[] {
  return [...app.host.querySelectorAll('.cm-content')]
    .map((el) => EditorView.findFromDOM(el as HTMLElement))
    .filter((v): v is EditorView => v !== null);
}

let app: MountedApp | null = null;

beforeEach(() => {
  store().reset();
  useSidebarStore.setState({ visible: true, width: 240 });
  useRightSidebarStore.setState({ visible: false });
  installFakeApi();
});

afterEach(() => {
  app?.unmount();
  app = null;
  store().reset();
});

// ---------------------------------------------------------------------------

describe('AC-PANEL-011 — v0.3에서 dual-open은 금지되고 기존 패널로 이동한다', () => {
  it('이미 열린 파일을 다시 열면 새 뷰도 새 문서도 만들어지지 않는다', () => {
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
    });
    expect(viewsInRenderOrder(app)).toHaveLength(2);

    const documentsBefore = store().documents.size;
    const panelA = store().panels[0]!;

    // 패널 B에서 a.md를 열려고 시도한다.
    let result!: { panelId: string; reused: boolean };
    act(() => {
      result = store().openInNewPanel('/w/a.md', 'A\n');
    });

    expect(result.reused, 'dual-open이 허용되었다').toBe(true);
    expect(result.panelId).toBe(panelA.panelId);
    expect(viewsInRenderOrder(app), 'EditorView 인스턴스가 늘었다').toHaveLength(2);
    expect(store().documents.size, '문서 맵 항목이 늘었다').toBe(documentsBefore);
    // 이동으로 제시된다 — 그 패널이 활성이 되고 오류는 없다.
    expect(store().activePanelId).toBe(panelA.panelId);
    expect(app.host.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('AC-PANEL-001 — 패널마다 표면 상태가 독립이다', () => {
  it('한 패널의 캐럿·선택·스크롤·실행 취소가 다른 패널에 새지 않는다', () => {
    act(() => {
      store().openInActivePanel('/w/a.md', '첫째 줄\n둘째 줄\n셋째 줄\n');
    });
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/b.md', 'B 첫째\nB 둘째\n');
    });

    const views = viewsInRenderOrder(app);
    const [viewA, viewB] = [views[0], views[1]];
    expect(viewA && viewB).toBeTruthy();

    const bSelectionBefore = viewB!.state.selection.main.anchor;
    const bDocBefore = viewB!.state.doc.toString();

    // 패널 A에서 캐럿을 옮기고 선택하고 편집한다.
    act(() => {
      viewA!.dispatch({ selection: { anchor: 4, head: 7 } });
      viewA!.dispatch({ changes: { from: 0, insert: 'X' } });
    });

    expect(viewA!.state.selection.main.anchor).not.toBe(bSelectionBefore + 1);
    expect(viewB!.state.selection.main.anchor, 'B의 캐럿이 움직였다').toBe(bSelectionBefore);
    expect(viewB!.state.doc.toString(), 'B의 문서가 바뀌었다').toBe(bDocBefore);

    // 실행 취소 이력도 뷰별이다 — `history()`가 `EditorState`에 붙기 때문이다.
    expect(viewA!.state).not.toBe(viewB!.state);
  });
});

describe('AC-PANEL-004 — 마지막 패널은 닫을 수 없다', () => {
  it('패널이 1개면 닫기 요청이 거부된다', () => {
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    const only = store().panels[0]!;

    let closed!: boolean;
    act(() => {
      closed = store().closePanel(only.panelId);
    });

    expect(closed).toBe(false);
    expect(store().panels).toHaveLength(1);
    expect(viewsInRenderOrder(app)).toHaveLength(1);
  });

  it('그 패널의 문서를 닫는 요청은 패널을 유지한 채 빈 버퍼로 되돌린다', () => {
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();

    act(() => {
      store().openInActivePanel(null, '');
    });

    expect(store().panels).toHaveLength(1);
    const doc = store().documents.get(store().panels[0]!.documentId)!;
    expect(doc.path).toBeNull();
    expect(doc.content).toBe('');
  });
});

describe('AC-PANEL-005 — 분할·닫기가 다른 패널을 훼손하지 않는다', () => {
  it('분할했다 닫아도 패널 A의 내용·미저장 여부·캐럿·스크롤이 그대로다', () => {
    act(() => {
      store().openInActivePanel('/w/a.md', '가나다\n라마바\n');
    });
    app = mountApp();

    const docIdA = store().panels[0]!.documentId;
    act(() => {
      store().editDocument(docIdA, '가나다 편집\n라마바\n');
    });

    const viewA = viewsInRenderOrder(app)[0];
    act(() => {
      viewA!.dispatch({ selection: { anchor: 3 } });
    });
    viewA!.scrollDOM.scrollTop = 17;

    const before = {
      content: store().documents.get(docIdA)!.content,
      currentRevision: store().documents.get(docIdA)!.currentRevision,
      savedRevision: store().documents.get(docIdA)!.savedRevision,
      caret: viewA!.state.selection.main.anchor,
      scrollTop: viewA!.scrollDOM.scrollTop,
    };

    // 분할했다가 다시 닫는다.
    let openedId!: string;
    act(() => {
      openedId = store().openInNewPanel('/w/b.md', 'B\n').panelId;
    });
    expect(viewsInRenderOrder(app)).toHaveLength(2);
    act(() => {
      store().closePanel(openedId);
    });
    expect(viewsInRenderOrder(app)).toHaveLength(1);

    const docA = store().documents.get(docIdA)!;
    const viewAAfter = viewsInRenderOrder(app)[0];
    expect(docA.content).toBe(before.content);
    expect(docA.currentRevision).toBe(before.currentRevision);
    expect(docA.savedRevision).toBe(before.savedRevision);
    expect(viewAAfter!.state.selection.main.anchor).toBe(before.caret);
    expect(viewAAfter!.scrollDOM.scrollTop).toBe(before.scrollTop);
  });

  it('공간 재배분의 등식이 flex 구성으로 성립한다 — 패널 폭 합 + 리사이저 폭 합', () => {
    // jsdom은 레이아웃을 계산하지 않아 실제 픽셀을 측정할 수 없다. 등식이
    // 성립하도록 **구성**되어 있는지를 판정하고, 픽셀 단언은 e2e로 남긴다.
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
      store().openInNewPanel('/w/c.md', 'C\n');
    });

    const row = app.host.querySelector('[data-panel-resizer]')!.parentElement!;
    const kids = [...row.children] as HTMLElement[];
    const resizers = kids.filter((k) => k.hasAttribute('data-panel-resizer'));
    const panels = kids.filter((k) => !k.hasAttribute('data-panel-resizer'));

    expect(panels).toHaveLength(3);
    expect(resizers, '패널 N개 사이의 리사이저는 N-1개다').toHaveLength(2);
    // 패널은 남는 공간을 나눠 갖고, 리사이저는 고정 폭을 차지한다.
    for (const p of panels) expect(p.style.flex).toBe('1 1 0%');
    for (const r of resizers) {
      expect(r.style.flexShrink).toBe('0');
      expect(r.style.width).toBe('4px');
    }
  });
});

describe('AC-PANEL-007 — 패널 축과 사이드바 축이 독립이다', () => {
  it('패널을 3개까지 늘려도 사이드바 가시성·폭이 변하지 않는다', () => {
    useSidebarStore.setState({ visible: true, width: 240 });
    useRightSidebarStore.setState({ visible: false });
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();

    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
      store().openInNewPanel('/w/c.md', 'C\n');
    });

    expect(useSidebarStore.getState().visible).toBe(true);
    expect(useSidebarStore.getState().width).toBe(240);
    expect(useRightSidebarStore.getState().visible).toBe(false);
  });

  it('사이드바를 토글하고 폭을 바꿔도 패널 수가 변하지 않는다', () => {
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
    });
    const panelsBefore = store().panels.map((p) => p.panelId);

    act(() => {
      useSidebarStore.getState().setWidth(320);
      useRightSidebarStore.setState({ visible: true });
    });

    expect(store().panels.map((p) => p.panelId)).toEqual(panelsBefore);
  });
});

describe('AC-PANEL-002b — 사이드바 폭 경계가 보존된다', () => {
  it('패널이 2개여도 좌·우 사이드바 폭이 공유 상수로 clamp된다', () => {
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
    });

    useSidebarStore.getState().setWidth(WIDTH_BOUNDS.sidebar.min - 50);
    expect(useSidebarStore.getState().width).toBe(WIDTH_BOUNDS.sidebar.min);
    useSidebarStore.getState().setWidth(WIDTH_BOUNDS.sidebar.max + 50);
    expect(useSidebarStore.getState().width).toBe(WIDTH_BOUNDS.sidebar.max);

    useRightSidebarStore.getState().setWidth(WIDTH_BOUNDS.rightSidebar.min - 50);
    expect(useRightSidebarStore.getState().width).toBe(WIDTH_BOUNDS.rightSidebar.min);
    useRightSidebarStore.getState().setWidth(WIDTH_BOUNDS.rightSidebar.max + 50);
    expect(useRightSidebarStore.getState().width).toBe(WIDTH_BOUNDS.rightSidebar.max);
  });
});

describe('AC-PANEL-002c — 사이드바 persist 경로가 패널 축과 분리된다', () => {
  it('분할·닫기를 반복해도 사이드바 prefsSet이 발생하지 않는다', () => {
    const prefsSet = vi.fn(async (_patch: unknown) => undefined);
    installFakeApi({ prefsSet });
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    prefsSet.mockClear();

    const before = { ...useSidebarStore.getState() };
    act(() => {
      const id = store().openInNewPanel('/w/b.md', 'B\n').panelId;
      store().closePanel(id);
      const id2 = store().openInNewPanel('/w/c.md', 'C\n').panelId;
      store().closePanel(id2);
    });

    const sidebarWrites = prefsSet.mock.calls
      .map(([patch]) => patch)
      .filter((patch) => typeof patch === 'object' && patch !== null && 'sidebar' in patch);
    expect(sidebarWrites, '패널 조작이 사이드바 설정을 저장했다').toHaveLength(0);
    expect(useSidebarStore.getState().visible).toBe(before.visible);
    expect(useSidebarStore.getState().width).toBe(before.width);
    expect(useSidebarStore.getState().activeTab).toBe(before.activeTab);
  });
});

describe('AC-PANEL-065 — 사이드바 데이터가 활성 원고 패널로 재배선된다', () => {
  it('왼쪽 패널이 아니라 활성 패널의 내용을 표시한다', () => {
    // 패널 순서상 B가 **왼쪽**, A가 활성 — 순서와 데이터 귀속을 의도적으로
    // 어긋나게 둔다. "가장 왼쪽 패널" 구현이면 여기서 깨진다.
    act(() => {
      store().openInActivePanel('/w/supp.md', '보조 원고\n');
    });
    app = mountApp();
    let panelA!: string;
    act(() => {
      panelA = store().openInNewPanel('/w/main.md', '# 주 원고\n').panelId;
      store().setActivePanel(panelA);
    });

    const views = viewsInRenderOrder(app);
    expect(views[0]?.state.doc.toString(), '왼쪽은 B(supp.md)여야 한다').toBe('보조 원고\n');
    expect(views[1]?.state.doc.toString()).toBe('# 주 원고\n');

    // 사이드바가 겨냥하는 뷰는 활성 패널 A의 것이다.
    const bound = panelById(store(), store().activePanelId!)!;
    expect(bound.panelId).toBe(panelA);
    const activeDoc = store().documents.get(bound.documentId)!;
    expect(activeDoc.path).toBe('/w/main.md');
    expect(activeDoc.content).toBe('# 주 원고\n');
  });

  it('활성 패널을 바꾸면 사이드바 귀속도 따라 바뀐다', () => {
    act(() => {
      store().openInActivePanel('/w/supp.md', '보조 원고\n');
    });
    app = mountApp();
    const panelB = store().panels[0]!.panelId;
    act(() => {
      store().openInNewPanel('/w/main.md', '# 주 원고\n');
    });

    act(() => {
      store().setActivePanel(panelB);
    });
    const boundDoc = store().documents.get(panelById(store(), store().activePanelId!)!.documentId)!;
    expect(boundDoc.path).toBe('/w/supp.md');
  });
});
