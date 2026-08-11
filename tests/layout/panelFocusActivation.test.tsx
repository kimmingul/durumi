import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { installFakeApi, mountApp, type MountedApp } from '../_helpers/appHarness';
import { useWorkspaceStore } from '../../src/store/workspaceStore';

/**
 * 활성 패널은 **가장 최근에 편집 포커스를 받은 패널**이다 (AC-PANEL-030·030b).
 *
 * ## 두 반쪽이 함께 있어야 의미가 있다
 *
 * "편집 표면에 포커스를 주면 활성이 된다"만 검사하면, 아무 포커스 이동에나
 * 반응하는 구현도 통과한다. 그 구현에서는 툴바 버튼을 누르려고 포커스가 떠나는
 * 순간 활성 패널을 잃는다 — REQ-PANEL-030이 그 경우를 이름으로 배제한 이유다.
 * 그래서 반대 방향(패널 밖 포커스는 활성 패널을 바꾸지 않는다)을 같은 파일에서
 * 함께 고정한다.
 */

const store = () => useWorkspaceStore.getState();

let app: MountedApp | null = null;

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function editSurfaces(app: MountedApp): HTMLElement[] {
  return [...app.host.querySelectorAll('.cm-content')] as HTMLElement[];
}

function focus(el: HTMLElement): void {
  act(() => {
    el.focus();
    // jsdom에서 `focus()`가 항상 focus 이벤트를 발화하지는 않는다. React가
    // 위임으로 듣는 것은 버블링되는 `focusin`이므로 그것을 함께 보낸다.
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  });
}

beforeEach(() => {
  store().reset();
  installFakeApi({ memoSidecarRead: async () => null, filesIndex: async () => [] });
});

afterEach(() => {
  app?.unmount();
  app = null;
  store().reset();
});

describe('AC-PANEL-030 — 활성 패널은 마지막 편집 포커스를 따른다', () => {
  it('패널 B의 편집 표면에 포커스를 주면 활성 패널이 B가 된다', async () => {
    app = mountApp();
    const panelA = store().activePanelId!;
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
    });
    const panelB = store().activePanelId!;
    await flush();

    // A를 활성으로 되돌려 놓고 시작한다.
    act(() => {
      store().setActivePanel(panelA);
    });
    expect(store().activePanelId).toBe(panelA);

    const surfaces = editSurfaces(app);
    expect(surfaces, '편집 표면이 둘이어야 한다').toHaveLength(2);
    focus(surfaces[1]!);

    expect(store().activePanelId, '편집 포커스가 활성 패널을 바꾸지 않았다').toBe(panelB);
  });

  it('다시 A로 포커스를 옮기면 활성 패널이 A로 돌아온다', async () => {
    app = mountApp();
    const panelA = store().activePanelId!;
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
    });
    await flush();

    const surfaces = editSurfaces(app);
    focus(surfaces[0]!);
    expect(store().activePanelId).toBe(panelA);
  });
});

describe('AC-PANEL-030b — 패널 밖 포커스 이동은 활성 패널을 바꾸지 않는다', () => {
  it('툴바·사이드바·상태바로 포커스가 옮겨가도 활성 패널은 B로 남는다', async () => {
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
    });
    const panelB = store().activePanelId!;
    await flush();

    focus(editSurfaces(app)[1]!);
    expect(store().activePanelId).toBe(panelB);

    // 툴바 버튼 — 패널 A의 것을 고른다. 그 버튼이 활성 패널을 A로 끌어가면
    // 사용자는 B를 보면서 A를 편집하게 된다.
    const panelBoxes = [...app.host.querySelectorAll('[data-panel-container] > div')];
    const toolbarButtonA = panelBoxes[0]!.querySelector('button');
    if (toolbarButtonA) {
      focus(toolbarButtonA as HTMLElement);
      expect(store().activePanelId, '툴바 포커스가 활성 패널을 바꿨다').toBe(panelB);
    }

    // 사이드바 항목.
    const sidebarFocusable = app.host.querySelector('aside button, aside input');
    if (sidebarFocusable) {
      focus(sidebarFocusable as HTMLElement);
      expect(store().activePanelId, '사이드바 포커스가 활성 패널을 바꿨다').toBe(panelB);
    }

    // 상태바 모드 컨트롤.
    const statusButton = app.host.querySelector('[data-testid="status-edit-mode"] button');
    expect(statusButton, '상태바 컨트롤이 없다').toBeTruthy();
    focus(statusButton as HTMLElement);
    expect(store().activePanelId, '상태바 포커스가 활성 패널을 바꿨다').toBe(panelB);
  });

  it('패널이 하나뿐이면 어떤 포커스 이동 후에도 그 패널이 활성이다', async () => {
    app = mountApp();
    const only = store().activePanelId!;
    await flush();

    const statusButton = app.host.querySelector('[data-testid="status-edit-mode"] button');
    focus(statusButton as HTMLElement);
    expect(store().activePanelId).toBe(only);

    focus(editSurfaces(app)[0]!);
    expect(store().activePanelId).toBe(only);
    expect(store().panels).toHaveLength(1);
  });
});
