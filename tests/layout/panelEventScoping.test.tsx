import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import type { EditorView } from '@codemirror/view';
import { installFakeApi, mountApp, type MountedApp } from '../_helpers/appHarness';
import { useWorkspaceStore } from '../../src/store/workspaceStore';
import { getPanelView } from '../../src/store/panelViews';
import { panelIdOfEvent } from '../../src/editor/panelEvents';
import { dispatchEditLink } from '../../src/editor/decorations/linkInteract';
import { memoPanelToggleCommand } from '../../src/editor/keymap';

/**
 * 창 전역 이벤트의 패널 귀속 — **실제 발신부와 실제 수신부**로 (AC-PANEL-034).
 *
 * `tests/editor/panelEvents.test.ts`가 계약을 고정한다면 여기서는 그 계약이
 * 프로덕션 경로에 실제로 배선되었는지를 본다. 계약만 맞고 배선이 없으면 결함은
 * 그대로 남는다 — 그 조합이 정확히 M1의 `displayMode`가 있던 자리다(필드는
 * 있는데 읽는 곳이 0곳).
 */

const store = () => useWorkspaceStore.getState();

let app: MountedApp | null = null;

/**
 * lazy 대화상자는 동적 import를 거친다 — 마이크로태스크만으로는 모듈 그래프가
 * 풀리지 않으므로 매크로태스크를 몇 턴 흘려보낸다.
 */
async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** 그 패널의 편집 표면에 내용을 넣고 렌더된 위젯 요소를 집는다. */
function widgetIn(view: EditorView, doc: string, selector: string): HTMLElement {
  act(() => {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: doc },
      // 캐럿이 마커 안에 있으면 소스가 드러나 위젯이 렌더되지 않는다.
      selection: { anchor: doc.length },
    });
  });
  const el = view.dom.querySelector(selector);
  if (!el) throw new Error(`${selector}를 찾지 못했다`);
  return el as HTMLElement;
}

function captureEvent(name: string, emit: () => void): string | null | undefined {
  let seen: string | null | undefined;
  const onEvent = (e: Event) => { seen = panelIdOfEvent(e); };
  window.addEventListener(name, onEvent);
  try {
    emit();
  } finally {
    window.removeEventListener(name, onEvent);
  }
  return seen;
}

beforeEach(() => {
  store().reset();
  installFakeApi();
});

afterEach(() => {
  app?.unmount();
  app = null;
  store().reset();
});

describe('AC-PANEL-034 — 패널 A의 발신에 A의 수신 컴포넌트만 반응한다', () => {
  it('링크 편집 이벤트가 대화상자를 하나만 연다', async () => {
    app = mountApp();
    const panelA = store().activePanelId!;
    act(() => {
      store().openInNewPanel('/w/b.md', 'B 본문\n');
    });
    await flush();

    // 전제: 패널이 둘이고 둘 다 툴바를 갖는다. 이 전제가 깨지면 아래 단언은
    // 회귀를 잡지 못한다 — 수신기가 하나뿐이면 중복이 일어날 수 없다.
    expect(store().panels).toHaveLength(2);
    const viewA = getPanelView(panelA);
    expect(viewA, '패널 A의 편집 표면이 등록되지 않았다').not.toBeNull();

    act(() => {
      dispatchEditLink(
        { from: 0, to: 0, text: '라벨', url: 'https://example.com', title: '' },
        viewA!,
      );
    });
    await flush();

    const dialogs = document.querySelectorAll('[data-testid="insert-link-dialog"]');
    expect(dialogs.length, '패널 수만큼 대화상자가 열렸다').toBe(1);
  });
});

describe('실제 발신부가 발신 패널을 싣는다', () => {
  it('`durumi:edit-link` — 링크 컨텍스트 메뉴 경로', () => {
    app = mountApp();
    const panelA = store().activePanelId!;
    const viewA = getPanelView(panelA)!;

    const seen = captureEvent('durumi:edit-link', () => {
      dispatchEditLink({ from: 0, to: 1, text: 'x', url: 'u', title: '' }, viewA);
    });
    expect(seen).toBe(panelA);
  });

  it('`durumi:memo-panel-toggle` — 키맵 경로', () => {
    app = mountApp();
    const panelA = store().activePanelId!;
    const viewA = getPanelView(panelA)!;

    const seen = captureEvent('durumi:memo-panel-toggle', () => {
      memoPanelToggleCommand(viewA);
    });
    expect(seen).toBe(panelA);
  });

  it('`durumi:memo-focus` — 메모 아이콘 위젯 경로', () => {
    app = mountApp();
    const panelA = store().activePanelId!;
    const viewA = getPanelView(panelA)!;

    const seen = captureEvent('durumi:memo-focus', () => {
      widgetIn(viewA, 'hello %% @todo 확인 %% world\n다음', '.cm-memo-chat-icon').click();
    });
    expect(seen).toBe(panelA);
  });

  it('`durumi:cm-focus` — CriticMarkup 알약 경로', () => {
    app = mountApp();
    const panelA = store().activePanelId!;
    const viewA = getPanelView(panelA)!;

    const seen = captureEvent('durumi:cm-focus', () => {
      widgetIn(viewA, 'pre {>> 메모 <<} post\n다음', '.cm-cm-comment-pill').click();
    });
    expect(seen).toBe(panelA);
  });
});
