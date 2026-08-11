import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { installFakeApi, mountApp, type MountedApp } from '../_helpers/appHarness';
import { useWorkspaceStore } from '../../src/store/workspaceStore';
import { useAppStore } from '../../src/store/appStore';
import { getPanelView } from '../../src/store/panelViews';
import { currentEditMode, editModeField } from '../../src/editor/editMode';

/**
 * 표시 모드의 **사용자 표면** (AC-PANEL-020·021·022·023·024).
 *
 * 스토어 계약은 `tests/store/panelDisplayMode.test.ts`가 고정한다. 여기서는 그
 * 값이 실제 편집 표면과 상태바에 도달하는지를 본다 — M1의 `displayMode`가
 * "필드는 있는데 읽는 곳이 0곳"이었던 자리가 정확히 이 사이다.
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

/** 상태바 모드 라디오 버튼들. */
function modeButtons(app: MountedApp): HTMLButtonElement[] {
  const group = app.host.querySelector('[data-testid="status-edit-mode"]');
  if (!group) throw new Error('상태바 모드 컨트롤이 없다');
  return [...group.querySelectorAll('button')] as HTMLButtonElement[];
}

function checkedMode(app: MountedApp): string | null {
  const btn = modeButtons(app).find((b) => b.getAttribute('aria-checked') === 'true');
  return btn?.querySelector('.status-bar-mode-label')?.textContent ?? null;
}

beforeEach(() => {
  store().reset();
  useAppStore.setState({ defaultMode: 'wysiwyg' });
  installFakeApi();
});

afterEach(() => {
  app?.unmount();
  app = null;
  store().reset();
});

describe('AC-PANEL-020 — 원고 패널은 3-모드를 그대로 제공한다', () => {
  it('상태바가 정확히 세 개의 모드를 제시한다', () => {
    app = mountApp();
    expect(modeButtons(app)).toHaveLength(3);
  });

  it('편집 표면의 `editModeField`가 그 패널의 모드를 들고 있다', () => {
    app = mountApp();
    const panelId = store().activePanelId!;
    act(() => {
      store().setPanelDisplayMode(panelId, 'typora');
    });
    const view = getPanelView(panelId)!;
    expect(currentEditMode(view.state)).toBe('typora');
  });
});

describe('AC-PANEL-021 — 모드는 패널별로 독립이다', () => {
  it('패널 A를 markdown으로 바꿔도 패널 B는 wysiwyg을 유지하고 라이브 데코레이션이 남는다', async () => {
    app = mountApp();
    const panelA = store().activePanelId!;
    act(() => {
      store().openInNewPanel('/w/b.md', '**굵게**\n다음 줄\n');
    });
    const panelB = store().activePanelId!;
    await flush();

    act(() => {
      store().setPanelDisplayMode(panelA, 'markdown');
    });
    await flush();

    const viewA = getPanelView(panelA)!;
    const viewB = getPanelView(panelB)!;
    expect(currentEditMode(viewA.state)).toBe('markdown');
    expect(currentEditMode(viewB.state), '한 패널의 변경이 다른 패널로 샜다').toBe('wysiwyg');

    // B의 라이브 데코레이션이 계속 적용된다 — 마커가 숨김 위젯으로 접혀 있다.
    expect(
      viewB.dom.querySelector('.cm-md-marker-hidden'),
      'B의 라이브 데코레이션이 함께 꺼졌다',
    ).toBeTruthy();
  });
});

describe('AC-PANEL-022 — 보조 패널에는 3-모드가 적용되지 않는다', () => {
  it('라이브 데코레이션 집합이 비고, `editModeField`는 등록되어 있다', async () => {
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/a.py', '# **굵게** 아님\nprint(1)\n', 'auxiliary');
    });
    const aux = store().activePanelId!;
    await flush();

    const view = getPanelView(aux)!;
    expect(
      view.dom.querySelector('.cm-md-marker-hidden'),
      '보조 패널에 마크다운 데코레이션이 적용됐다',
    ).toBeNull();
    // 필드 부재 시 `currentEditMode`의 `typora` 폴백이 흘러드는 것을 막기 위한
    // 의도적 배치다(`design.md` §5.2). 등록되어 있으므로 폴백이 아니라 실제 값이다.
    expect(view.state.field(editModeField, false), '`editModeField`가 등록되지 않았다').toBe(
      'markdown',
    );
  });

  it('그 패널에 모드 선택 수단이 제시되지 않는다', async () => {
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/a.py', 'print(1)\n', 'auxiliary');
    });
    await flush();

    // 패널 안에는 모드 컨트롤이 없다 — 모드 표면은 창 하나뿐이고 그것은
    // 활성 패널에 종속된다(REQ-PANEL-024).
    const container = app.host.querySelector('[data-panel-container]')!;
    expect(container.querySelector('[data-testid="status-edit-mode"]')).toBeNull();
    // 창 하나뿐인 그 표면은 활성 패널이 보조 패널이므로 비활성이다.
    expect(modeButtons(app).every((b) => b.disabled)).toBe(true);
  });
});

describe('AC-PANEL-023 — 패널별 모드 변경은 prefs에 쓰지 않는다', () => {
  it('상태바에서 모드를 바꿔도 `prefsSet` 호출이 0건이다', async () => {
    const prefsSet = vi.fn(async () => undefined);
    installFakeApi({ prefsSet });
    app = mountApp();
    await flush();
    prefsSet.mockClear();

    act(() => {
      modeButtons(app!)[2]!.click(); // Source(markdown)
    });

    expect(prefsSet, '패널 모드 변경이 전역 기본값을 덮어썼다').toHaveBeenCalledTimes(0);
    expect(useAppStore.getState().defaultMode).toBe('wysiwyg');
    expect(store().panels[0]!.displayMode).toBe('markdown');
  });

  it('`defaultMode`는 새 원고 패널의 초기값으로는 계속 쓰인다', async () => {
    installFakeApi({ prefsGet: async () => ({ editor: { defaultMode: 'typora' } }) });
    app = mountApp();
    await flush();

    // 부트 패널이 기본값으로 열렸다.
    expect(useAppStore.getState().defaultMode).toBe('typora');
    expect(store().panels[0]!.displayMode).toBe('typora');

    // 그 패널의 모드를 바꿔도 기본값은 그대로다.
    act(() => {
      store().setPanelDisplayMode(store().activePanelId!, 'markdown');
    });
    expect(useAppStore.getState().defaultMode).toBe('typora');

    // 새로 여는 패널은 여전히 기본값으로 열린다.
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n', 'markdown', useAppStore.getState().defaultMode);
    });
    expect(store().panels[1]!.displayMode, 'A의 변경이 B의 초기값을 규정했다').toBe('typora');
  });
});

describe('AC-PANEL-024 — 모드 컨트롤은 활성 패널에 종속된다', () => {
  it('활성 패널을 바꾸면 표시가 그 패널의 모드로 바뀐다', async () => {
    app = mountApp();
    const panelA = store().activePanelId!;
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
    });
    const panelB = store().activePanelId!;
    await flush();

    act(() => {
      store().setPanelDisplayMode(panelA, 'markdown');
      store().setPanelDisplayMode(panelB, 'wysiwyg');
      store().setActivePanel(panelA);
    });
    expect(checkedMode(app)).toBe('Source');

    act(() => {
      store().setActivePanel(panelB);
    });
    expect(checkedMode(app), '활성 패널을 바꿨는데 표시가 따라오지 않았다').toBe('Document');
  });

  it('활성 패널이 보조 패널이면 컨트롤이 비활성이다', async () => {
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/a.py', 'print(1)\n', 'auxiliary');
    });
    await flush();

    const group = app.host.querySelector('[data-testid="status-edit-mode"]')!;
    expect(group.getAttribute('aria-disabled')).toBe('true');
    expect(modeButtons(app).every((b) => b.disabled)).toBe(true);
    // 선택 표시도 남지 않는다 — 적용 대상이 없는 컨트롤을 활성으로 보이게 하지
    // 않는다.
    expect(checkedMode(app)).toBeNull();
  });

  it('비활성 상태에서 눌러도 아무 일도 일어나지 않는다', async () => {
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/a.py', 'print(1)\n', 'auxiliary');
    });
    const aux = store().activePanelId!;
    await flush();

    act(() => {
      modeButtons(app!)[0]!.click();
    });
    expect(store().panels.find((p) => p.panelId === aux)!.displayMode).toBe('wysiwyg');
    expect(currentEditMode(getPanelView(aux)!.state)).toBe('markdown');
  });
});
