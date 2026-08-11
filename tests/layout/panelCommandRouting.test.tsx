import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import type { MenuCommand } from '@shared/ipc-contract';
import { installFakeApi, mountApp, type MountedApp } from '../_helpers/appHarness';
import { documentOf, useWorkspaceStore } from '../../src/store/workspaceStore';
import { useSidebarStore } from '../../src/store/sidebarStore';
import { useAppStore } from '../../src/store/appStore';
import { getPanelView } from '../../src/store/panelViews';

/**
 * 뷰 의존 커맨드의 라우팅 (AC-PANEL-031·032·032b·033).
 *
 * ## 이 파일이 지키는 성질
 *
 * 커맨드는 **활성 패널에만** 작용한다. 활성이 아닌 패널의 문서가 바뀌면 사용자는
 * 보이지 않는 곳에서 원고가 변한 것을 모른 채 저장한다 — REQ-PANEL-032가
 * "마지막 마크다운 패널로 보낸다"는 대안을 이름으로 기각한 이유가 그것이다.
 *
 * 그래서 모든 검사는 **다른 패널의 문서가 바이트 단위로 동일한가**를 함께
 * 단언한다. 활성 패널이 바뀌었는지만 보면 이 결함을 놓친다.
 */

const store = () => useWorkspaceStore.getState();

let app: MountedApp | null = null;
let emit: ((cmd: MenuCommand) => void | Promise<void>) | null = null;

function installMenuChannel(overrides: Record<string, unknown> = {}): void {
  installFakeApi({
    onMenuCommand: (cb: (cmd: MenuCommand) => void | Promise<void>) => {
      emit = cb;
      return () => { emit = null; };
    },
    // 하네스의 프록시 기본값(`{ ok: false }`)은 이 두 채널에서 형태가 맞지
    // 않는다 — 사이드카는 `null`(없음), 파일 색인은 배열이어야 한다. 셸 전역
    // 커맨드를 실제로 눌러 보는 검사이므로 그 표면들이 마운트된 채여야 한다.
    memoSidecarRead: async () => null,
    filesIndex: async () => [],
    ...overrides,
  });
}

async function send(cmd: MenuCommand): Promise<void> {
  if (!emit) throw new Error('메뉴 채널이 등록되지 않았다');
  await act(async () => {
    await emit!(cmd);
  });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const contentOf = (panelId: string): string =>
  documentOf(store(), panelId)?.content ?? '<없음>';

beforeEach(() => {
  store().reset();
  useAppStore.setState({ defaultMode: 'wysiwyg' });
  useSidebarStore.setState({ visible: true });
  installMenuChannel();
});

afterEach(() => {
  app?.unmount();
  app = null;
  emit = null;
  store().reset();
});

/** 원고 패널 둘 — A는 비활성, B가 활성. */
async function twoManuscriptPanels(): Promise<{ panelA: string; panelB: string }> {
  app = mountApp();
  const panelA = store().activePanelId!;
  act(() => {
    store().openInActivePanel('/w/a.md', 'A 원고\n');
    store().openInNewPanel('/w/b.md', '안녕 세계\n');
  });
  const panelB = store().activePanelId!;
  await flush();
  // B에 선택을 준다 — 인라인 서식은 빈 선택에서 무동작이다.
  act(() => {
    getPanelView(panelB)!.dispatch({ selection: { anchor: 0, head: 2 } });
  });
  return { panelA, panelB };
}

describe('AC-PANEL-031 — 뷰 의존 커맨드가 활성 패널에만 작용한다', () => {
  const cases: Array<[string, MenuCommand]> = [
    ['bold', 'bold'],
    ['insertTable', 'insertTable'],
    ['toggleTask', 'toggleTask'],
    ['heading level 2', { type: 'heading', level: 2 } as MenuCommand],
  ];

  for (const [label, cmd] of cases) {
    it(`\`${label}\`는 활성 패널 B만 바꾼다`, async () => {
      const { panelA, panelB } = await twoManuscriptPanels();
      const beforeA = contentOf(panelA);
      const beforeB = contentOf(panelB);

      await send(cmd);

      expect(contentOf(panelA), '활성이 아닌 패널의 문서가 바뀌었다').toBe(beforeA);
      expect(contentOf(panelB), '활성 패널에 작용하지 않았다').not.toBe(beforeB);
    });
  }
});

describe('AC-PANEL-032 — 보조 패널 활성 시 마크다운 전용 커맨드는 아무 일도 하지 않는다', () => {
  const cases: Array<[string, MenuCommand]> = [
    ['bold', 'bold'],
    ['italic', 'italic'],
    ['insertTable', 'insertTable'],
    ['heading level 1', { type: 'heading', level: 1 } as MenuCommand],
  ];

  for (const [label, cmd] of cases) {
    it(`\`${label}\`는 어느 패널의 문서도 바꾸지 않는다`, async () => {
      app = mountApp();
      const manuscript = store().activePanelId!;
      act(() => {
        store().openInActivePanel('/w/a.md', 'A 원고\n');
        store().openInNewPanel('/w/a.py', 'print(1)\n', 'auxiliary');
      });
      const aux = store().activePanelId!;
      await flush();
      act(() => {
        getPanelView(aux)!.dispatch({ selection: { anchor: 0, head: 5 } });
      });

      const beforeManuscript = contentOf(manuscript);
      const beforeAux = contentOf(aux);

      await send(cmd);

      // 특히 원고 패널의 문서가 변하지 않는다 — 보이지 않는 문서를 조용히
      // 바꾸는 것이 이 AC가 막는 결함이다.
      expect(contentOf(manuscript), '보이지 않는 원고가 바뀌었다').toBe(beforeManuscript);
      expect(contentOf(aux), '보조 패널의 문서에 마크다운 서식이 적용됐다').toBe(beforeAux);
    });
  }
});

describe('AC-PANEL-032b — 마크다운 전용 컨트롤이 비활성으로 제시된다', () => {
  it('보조 패널이 활성이면 활성 상태의 마크다운 전용 컨트롤이 없고 경고도 없다', async () => {
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/a.py', 'print(1)\n', 'auxiliary');
    });
    const aux = store().activePanelId!;
    await flush();

    // 그 패널의 툴바 — 마크다운 전용 버튼이 활성으로 제시되지 않는다.
    // 부재는 비활성보다 강한 형태다: 보조 패널의 실효 모드가 `markdown`이므로
    // 툴바가 렌더되지 않는다(REQ-PANEL-022의 "선택 수단을 제시하지 않는다").
    const panelBoxes = app.host.querySelectorAll('[data-panel-container] > div');
    const auxBox = panelBoxes[panelBoxes.length - 1]!;
    const enabled = [...auxBox.querySelectorAll('button')].filter(
      (b) => !(b as HTMLButtonElement).disabled,
    );
    expect(enabled, '보조 패널에 활성 마크다운 컨트롤이 제시됐다').toHaveLength(0);

    // 창 하나뿐인 모드 컨트롤은 **비활성으로 제시된다**.
    const modeButtons = [
      ...app.host.querySelectorAll('[data-testid="status-edit-mode"] button'),
    ] as HTMLButtonElement[];
    expect(modeButtons.every((b) => b.disabled)).toBe(true);

    // 커맨드를 보내도 오류 토스트·경고가 뜨지 않는다 — 정상 상황이다.
    await send('bold');
    await send({ type: 'heading', level: 1 } as MenuCommand);
    await flush();
    expect(document.querySelectorAll('[data-testid="cm-toast"]')).toHaveLength(0);
    void aux;
  });
});

describe('AC-PANEL-033 — 전역 커맨드는 패널 구성과 무관하게 동작한다', () => {
  async function threePanels(): Promise<string> {
    app = mountApp();
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
      store().openInNewPanel('/w/b.md', 'B\n');
      store().openInNewPanel('/w/c.md', 'C\n');
    });
    await flush();
    return store().activePanelId!;
  }

  it('`toggleTheme`이 테마를 뒤집는다', async () => {
    await threePanels();
    const before = useAppStore.getState().theme;
    await send('toggleTheme');
    expect(useAppStore.getState().theme).not.toBe(before);
  });

  it('`toggleSidebar`가 사이드바를 토글한다', async () => {
    await threePanels();
    const before = useSidebarStore.getState().visible;
    await send('toggleSidebar');
    expect(useSidebarStore.getState().visible).toBe(!before);
  });

  it('`quickOpen`이 Quick Open을 연다', async () => {
    await threePanels();
    expect(app!.host.querySelector('[role="dialog"]'), '이미 열려 있다').toBeNull();
    await send('quickOpen');
    await flush();
    expect(app!.host.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('`openSettings`가 설정 대화상자를 연다', async () => {
    // 설정 패널은 부분 prefs에 취약하다(배열 필드를 무조건 읽는다). 이 검사의
    // 관심은 커맨드 라우팅이지 그 취약성이 아니므로 최소 형태만 채운다.
    installMenuChannel({
      prefsGet: async () => ({
        spellCheckLanguages: [],
        spellCheckCustomWords: [],
        workspaceFolders: [],
        recentFolders: [],
      }),
    });
    await threePanels();
    await send('openSettings');
    // 설정 패널은 lazy 청크 중 가장 무겁다 — 모듈 그래프가 풀릴 때까지 더 돈다.
    for (let i = 0; i < 20; i += 1) await flush();
    expect(app!.host.querySelector('[data-testid="settings-dialog"]')).toBeTruthy();
  });

  it('`refreshProjectTree`가 활성 패널의 문서 경로로 새로고침한다', async () => {
    const projectRefresh = vi.fn(async () => ({ ok: true }));
    installMenuChannel({ projectRefresh });
    const active = await threePanels();
    await send('refreshProjectTree');
    expect(projectRefresh).toHaveBeenCalledWith(contentPath(active));
  });

  it('문서 대상 커맨드(`save`)는 활성 패널의 문서를 대상으로 한다', async () => {
    const fileSave = vi.fn(async (_path: string, _text: string) => ({ ok: true as const }));
    installMenuChannel({ fileSave });
    const active = await threePanels();
    await send('save');
    expect(fileSave).toHaveBeenCalledTimes(1);
    expect(fileSave.mock.calls[0]![0], '활성 패널이 아닌 문서를 저장했다').toBe(contentPath(active));
  });
});

function contentPath(panelId: string): string {
  const path = documentOf(store(), panelId)?.path;
  if (!path) throw new Error('활성 문서에 경로가 없다');
  return path;
}
