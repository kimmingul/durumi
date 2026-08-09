import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MenuCommand } from '@shared/ipc-contract';
import { installFakeApi, mountApp, type MountedApp } from '../_helpers/appHarness';
import { useWorkspaceStore } from '../../src/store/workspaceStore';

/**
 * SPEC-V03-WORKSPACE-002 M2 — 패널 분할·닫기의 **진입점**.
 *
 * ## 이 파일이 존재하는 이유
 *
 * M2는 분할·닫기 기능을 만들고 2,256개 테스트를 통과시켰지만 **사용자가 부를
 * 방법이 없었다.** 메뉴 항목도, 단축키도, 버튼도 없었다. 모든 AC가 스토어
 * 액션을 직접 호출했기 때문에 초록불 전체가 도달 불가능한 기능을 덮고 있었다.
 *
 * 그래서 이 파일은 **커맨드 경로를 통과해서** 판정한다 — 메뉴 커맨드를 발신하고
 * 패널 수가 바뀌는지 본다. 스토어를 직접 부르지 않는 것이 요점이다.
 */

const store = () => useWorkspaceStore.getState();

/** main이 보내는 메뉴 커맨드를 흉내낸다 — 렌더러의 구독자에게 그대로 전달한다. */
let menuSubscribers: Array<(cmd: MenuCommand) => void>;
const sendMenuCommand = (cmd: MenuCommand): void => {
  act(() => {
    for (const cb of menuSubscribers) cb(cmd);
  });
};

let app: MountedApp | null = null;
let confirmDiscard: ReturnType<typeof vi.fn>;

beforeEach(() => {
  store().reset();
  menuSubscribers = [];
  confirmDiscard = vi.fn(async () => 'discard' as const);
  installFakeApi({
    onMenuCommand: (cb: (cmd: MenuCommand) => void) => {
      menuSubscribers.push(cb);
      return () => {
        menuSubscribers = menuSubscribers.filter((s) => s !== cb);
      };
    },
    confirmDiscard,
  });
});

afterEach(() => {
  app?.unmount();
  app = null;
  store().reset();
});

const panelCount = (): number => store().panels.length;
const editorCount = (): number => app!.host.querySelectorAll('.cm-host').length;

// ---------------------------------------------------------------------------

describe('패널 분할 — 메뉴 커맨드로 도달 가능하다', () => {
  it('splitPanel 커맨드가 패널을 하나 늘리고 편집 표면도 하나 는다', () => {
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    expect(panelCount()).toBe(1);
    expect(editorCount()).toBe(1);

    sendMenuCommand('splitPanel');

    expect(panelCount(), '메뉴 커맨드로 분할되지 않았다').toBe(2);
    expect(editorCount(), '패널은 늘었는데 편집 표면이 렌더되지 않았다').toBe(2);
  });

  it('분할은 **빈 패널**을 연다 — 같은 파일을 두 패널에 띄우지 않는다', () => {
    // v0.3은 dual-open을 금지한다(REQ-PANEL-011). 활성 문서를 그대로 새 패널에
    // 열면 경로 동일성 판정에 걸려 아무 일도 일어나지 않으므로, 분할은 "두 번째
    // 파일을 열 자리를 만드는 것"으로 정의된다. 같은 파일을 나란히 보는 것은
    // v0.4의 문서↔뷰 동기화 프로토콜이 들어와야 가능하다.
    act(() => {
      store().openInActivePanel('/w/a.md', 'A 내용\n');
    });
    app = mountApp();

    sendMenuCommand('splitPanel');

    expect(panelCount()).toBe(2);
    const paths = store().panels.map((p) => store().documents.get(p.documentId)?.path ?? null);
    expect(paths, '분할이 같은 경로를 복제했다').toEqual(['/w/a.md', null]);
    // 원래 문서는 그대로 하나다 — 중복 문서 항목이 생기지 않았다.
    expect([...store().documents.values()].filter((d) => d.path === '/w/a.md')).toHaveLength(1);
  });

  it('새 패널이 활성이 되어 다음에 여는 파일이 그리로 간다', () => {
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    const first = store().panels[0]!.panelId;

    sendMenuCommand('splitPanel');
    expect(store().activePanelId).not.toBe(first);

    act(() => {
      store().openInActivePanel('/w/b.md', 'B\n');
    });
    const paths = store().panels.map((p) => store().documents.get(p.documentId)?.path ?? null);
    expect(paths).toEqual(['/w/a.md', '/w/b.md']);
  });
});

describe('패널 닫기 — 메뉴 커맨드로 도달 가능하다', () => {
  it('closePanel 커맨드가 활성 패널을 닫는다', async () => {
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    sendMenuCommand('splitPanel');
    expect(panelCount()).toBe(2);

    sendMenuCommand('closePanel');
    await act(async () => {});

    expect(panelCount(), '메뉴 커맨드로 닫히지 않았다').toBe(1);
    expect(editorCount()).toBe(1);
  });

  it('마지막 패널에서는 무동작이다 (REQ-PANEL-004)', async () => {
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    const only = store().panels[0]!.panelId;

    sendMenuCommand('closePanel');
    await act(async () => {});

    expect(panelCount(), '마지막 패널이 닫혔다').toBe(1);
    expect(store().panels[0]!.panelId).toBe(only);
    expect(editorCount()).toBe(1);
  });

  it('미저장 편집이 있으면 폐기 확인을 거치고, 취소하면 닫히지 않는다', async () => {
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    sendMenuCommand('splitPanel');

    // 새로 생긴 빈 패널에 파일을 열고 편집한다.
    act(() => {
      store().openInActivePanel('/w/b.md', 'B\n');
    });
    const activeDocId = store().panels[1]!.documentId;
    act(() => {
      store().editDocument(activeDocId, 'B 미저장\n');
    });

    confirmDiscard.mockResolvedValue('cancel');
    sendMenuCommand('closePanel');
    await act(async () => {});

    expect(confirmDiscard, '폐기 확인을 거치지 않았다').toHaveBeenCalledTimes(1);
    expect(panelCount(), '취소했는데 닫혔다').toBe(2);
    expect(store().documents.get(activeDocId)!.content).toBe('B 미저장\n');
  });

  it('깨끗한 패널은 확인 없이 닫힌다', async () => {
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    sendMenuCommand('splitPanel');

    sendMenuCommand('closePanel');
    await act(async () => {});

    expect(confirmDiscard).not.toHaveBeenCalled();
    expect(panelCount()).toBe(1);
  });
});

describe('메뉴 표면 — 항목과 단축키가 실제로 존재한다', () => {
  const menuSrc = readFileSync(join(process.cwd(), 'electron', 'menu.ts'), 'utf8');

  it('보기 메뉴에 분할·닫기 항목이 있다', () => {
    expect(menuSrc).toContain("send('splitPanel')");
    expect(menuSrc).toContain("send('closePanel')");
    expect(menuSrc).toContain('menu.view.splitPanel');
    expect(menuSrc).toContain('menu.view.closePanel');
  });

  it('단축키가 기존 accelerator와 충돌하지 않는다', () => {
    // 소스의 `'...\\\\'` 는 문자열 리터럴 이스케이프다 — 실제 accelerator로 되돌린다.
    const accelerators = [...menuSrc.matchAll(/accelerator: *'([^']*)'/g)].map((m) =>
      m[1]!.replace(/\\\\/g, '\\'),
    );
    expect(accelerators).toContain('CommandOrControl+Alt+\\');
    expect(accelerators).toContain('CommandOrControl+Alt+W');
    // 중복이 없다 — 같은 조합을 두 항목이 쓰면 하나가 조용히 죽는다.
    expect(new Set(accelerators).size, `중복 accelerator: ${accelerators.join(', ')}`).toBe(
      accelerators.length,
    );
  });

  it('두 로케일 모두 라벨을 갖는다', () => {
    const labels = readFileSync(join(process.cwd(), 'shared', 'menuLabels.ts'), 'utf8');
    expect([...labels.matchAll(/'menu\.view\.splitPanel'/g)]).toHaveLength(2);
    expect([...labels.matchAll(/'menu\.view\.closePanel'/g)]).toHaveLength(2);
  });
});
