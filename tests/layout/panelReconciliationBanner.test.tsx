import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react-dom/test-utils';
import { installFakeApi, mountApp, type MountedApp } from '../_helpers/appHarness';
import { useWorkspaceStore } from '../../src/store/workspaceStore';
import { useReconciliationStore } from '../../src/store/reconciliationStore';
import type { ConfirmedChange } from '@shared/reconciliation';

/**
 * SPEC-V03-WORKSPACE-002 M4-2 — **조정 배너는 그 문서를 표시하는 패널에 뜬다**
 * (AC-PANEL-053 / 053b / 053c / 053d ↔ REQ-PANEL-053).
 *
 * ## 창 전역 단일 배너가 왜 결함인가
 *
 * 오늘의 `App`은 배너 하나를 패널 컨테이너 **밖에** 두고 **활성 문서**에만
 * 결속한다. 패널이 둘이면 이 배너는 어느 문서의 알림인지 표현할 수 없고,
 * 비활성 패널의 문서가 외부에서 바뀌어도 사용자는 알지 못한 채 그 위에 저장한다
 * — SPEC-1 REQ-WS-028이 타협 불가라고 못박은 데이터 손실 경로의 거울상이다.
 *
 * ## 왜 "동시에"가 별도 AC인가 (053b)
 *
 * 하나만 보이고 나머지가 대기하는 구현도 "배너가 패널 안에 뜬다"는 문언은
 * 만족한다. 그러면 사용자는 대기 중인 나머지를 모른 채 저장한다. 그래서 개수를
 * 센다.
 *
 * ## 왜 포커스가 별도 AC인가 (053c)
 *
 * 배너가 포커스를 가져가면 한글 IME 조합이 그 자리에서 깨진다(REQ-WS-049).
 * 이 저장소가 v0.2.19~.28에 걸쳐 다섯 번 출하한 실패 계열이다. 그래서 DOM
 * 관측(포커스가 그대로다)과 소스 스캔(포커스를 옮길 **수단**이 없다) 둘을 함께
 * 단언한다 — 관측만 하면 "이번 경로에서는 안 옮겼다"에 그친다.
 */

const store = () => useWorkspaceStore.getState();
const recon = () => useReconciliationStore.getState();

const changeFor = (path: string, content: string): ConfirmedChange => ({
  path,
  content,
  mtimeMs: 1,
  size: content.length,
});

let app: MountedApp | null = null;

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function panels(app: MountedApp): HTMLElement[] {
  return [...app.host.querySelectorAll('[data-panel]')] as HTMLElement[];
}

/** 그 패널 영역 안의 조정 표면. */
function surfaceIn(el: HTMLElement): HTMLElement | null {
  return el.querySelector('[data-reconcile-surface]');
}

/** 미저장 편집을 만든다 — 조정 정책이 "깨끗한 버퍼"로 판단하지 않게 한다. */
function dirty(path: string): void {
  const doc = [...store().documents.values()].find((d) => d.path === path)!;
  store().editDocument(doc.id, `${doc.content}편집\n`);
}

beforeEach(() => {
  store().reset();
  recon().reset();
  installFakeApi({ memoSidecarRead: async () => null, filesIndex: async () => [] });
});

afterEach(() => {
  app?.unmount();
  app = null;
  store().reset();
  recon().reset();
});

describe('AC-PANEL-053 — 배너가 해당 문서의 패널에 표면화된다', () => {
  it('패널 A에만 배너가 뜨고 패널 B에는 뜨지 않는다', async () => {
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
    });
    await flush();

    act(() => {
      dirty('/w/a.md');
    });
    await flush();
    act(() => {
      recon().dispatchFor('/w/a.md', { type: 'external-change', change: changeFor('/w/a.md', '# disk\n') });
    });

    const [panelA, panelB] = panels(app);
    expect(surfaceIn(panelA!), '패널 A 영역 안에 배너가 없다').not.toBeNull();
    expect(surfaceIn(panelB!), '패널 B 영역에 남의 문서 배너가 떴다').toBeNull();
  });

  it('창 전역 위치(패널 컨테이너 밖)에 배너가 렌더되지 않는다', async () => {
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    await flush();
    act(() => {
      dirty('/w/a.md');
    });
    await flush();
    act(() => {
      recon().dispatchFor('/w/a.md', { type: 'external-change', change: changeFor('/w/a.md', '# disk\n') });
    });

    const all = [...app.host.querySelectorAll('[data-reconcile-surface]')];
    expect(all, '배너가 아예 뜨지 않았다 — 아래 단언이 공허해진다').toHaveLength(1);
    const container = app.host.querySelector('[data-panel-container]')!;
    for (const el of all) {
      expect(container.contains(el), '배너가 패널 컨테이너 밖에 있다').toBe(true);
      expect(el.closest('[data-panel]'), '배너가 어느 패널에도 속하지 않는다').not.toBeNull();
    }
  });
});

describe('AC-PANEL-053b — N개 패널이 동시에 배너를 표시한다', () => {
  it('세 패널이 각자 배너를 동시에 표시한다 (대기열이 아니다)', async () => {
    const paths = ['/w/a.md', '/w/b.md', '/w/c.md'];
    act(() => {
      store().openInActivePanel(paths[0]!, 'A\n');
    });
    app = mountApp();
    act(() => {
      store().openInNewPanel(paths[1]!, 'B\n');
      store().openInNewPanel(paths[2]!, 'C\n');
    });
    await flush();

    act(() => {
      for (const p of paths) dirty(p);
    });
    await flush();
    act(() => {
      for (const p of paths) {
        recon().dispatchFor(p, { type: 'external-change', change: changeFor(p, `# disk ${p}\n`) });
      }
    });

    expect(app.host.querySelectorAll('[data-reconcile-surface]'), '배너가 셋이 아니다').toHaveLength(3);
    // 그리고 셋이 **서로 다른** 패널에 하나씩이다 — 한 패널에 셋이 쌓인 것이 아니다.
    for (const el of panels(app)) {
      expect(el.querySelectorAll('[data-reconcile-surface]')).toHaveLength(1);
    }
  });
});

describe('AC-PANEL-053c — 배너 등장이 포커스와 활성 패널을 바꾸지 않는다', () => {
  it('activeElement와 활성 패널이 그대로다', async () => {
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
    });
    await flush();

    // 패널 B가 활성이고, 포커스는 패널 밖의 탐침에 있다.
    const activeBefore = store().activePanelId;
    expect(activeBefore).toBe(store().panels[1]!.panelId);
    const probe = document.createElement('input');
    document.body.appendChild(probe);
    probe.focus();
    expect(document.activeElement).toBe(probe);

    act(() => {
      dirty('/w/a.md');
    });
    await flush();
    act(() => {
      recon().dispatchFor('/w/a.md', { type: 'external-change', change: changeFor('/w/a.md', '# disk\n') });
    });

    expect(surfaceIn(panels(app)[0]!), '배너가 뜨지 않아 단언이 공허하다').not.toBeNull();
    expect(document.activeElement, '배너 등장이 포커스를 옮겼다').toBe(probe);
    expect(store().activePanelId, '배너 등장이 활성 패널을 바꿨다').toBe(activeBefore);
    probe.remove();
  });

  it('배너를 품는 소스에 자동 포커스 속성도 프로그램적 포커스 호출도 없다', () => {
    // DOM 관측만으로는 "이번 경로에서는 안 옮겼다"에 그친다. 옮길 **수단**이
    // 없음을 소스에서 함께 고정한다.
    const files = [
      join(process.cwd(), 'src', 'components', 'ReconciliationSurface.tsx'),
      join(process.cwd(), 'src', 'components', 'PanelContainer.tsx'),
    ];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/autoFocus/);
      expect(src, f).not.toMatch(/\.focus\(/);
    }
  });
});

describe('AC-PANEL-053d — 배너 동작이 자기 문서에만 작용한다', () => {
  it('패널 A의 "디스크에서 불러오기"가 b.md를 건드리지 않는다', async () => {
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
    });
    await flush();
    act(() => {
      dirty('/w/a.md');
      dirty('/w/b.md');
    });
    await flush();
    act(() => {
      recon().dispatchFor('/w/a.md', { type: 'external-change', change: changeFor('/w/a.md', '# disk a\n') });
      recon().dispatchFor('/w/b.md', { type: 'external-change', change: changeFor('/w/b.md', '# disk b\n') });
    });

    // 두 패널 모두 배너 상태다 — 그래야 "자기 것만"이 판정 가능하다.
    const [panelA, panelB] = panels(app);
    expect(surfaceIn(panelA!)).not.toBeNull();
    expect(surfaceIn(panelB!)).not.toBeNull();

    // 실행자를 관측용으로 갈아 끼운다. 등록은 경로별이므로 서로 섞이지 않는다.
    const applied: string[] = [];
    recon().setEffectHandlerFor('/w/a.md', (e) => {
      if (e.kind === 'apply-to-buffer') applied.push(`a:${e.content}`);
    });
    recon().setEffectHandlerFor('/w/b.md', (e) => {
      if (e.kind === 'apply-to-buffer') applied.push(`b:${e.content}`);
    });

    const load = panelA!.querySelector<HTMLButtonElement>('button[data-action="load-from-disk"]')!;
    expect(load, '패널 A 배너에 불러오기 동작이 없다').not.toBeNull();
    act(() => load.click());

    expect(applied, 'a.md 밖의 문서에 버퍼 적용이 일어났다').toEqual(['a:# disk a\n']);
    expect(surfaceIn(panelA!), 'a.md의 배너가 남았다').toBeNull();
    expect(surfaceIn(panelB!), 'b.md의 배너가 함께 사라졌다').not.toBeNull();
  });

  it('"해제"와 "차이 보기"도 자기 문서에만 작용한다', async () => {
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
    });
    await flush();
    act(() => {
      dirty('/w/a.md');
      dirty('/w/b.md');
    });
    await flush();
    act(() => {
      recon().dispatchFor('/w/a.md', { type: 'external-change', change: changeFor('/w/a.md', '# disk a\n') });
      recon().dispatchFor('/w/b.md', { type: 'external-change', change: changeFor('/w/b.md', '# disk b\n') });
    });

    const [panelA, panelB] = panels(app);

    // 차이 보기: 상태를 소비하지 않으므로 양쪽 배너가 그대로여야 한다.
    const diff = panelA!.querySelector<HTMLButtonElement>('button[data-action="view-diff"]')!;
    act(() => diff.click());
    expect(surfaceIn(panelB!), '차이 보기가 b.md의 배너를 건드렸다').not.toBeNull();

    // 해제: a.md의 배너만 사라진다.
    const dismiss = panelA!.querySelector<HTMLButtonElement>('button[data-action="dismiss"]')!;
    act(() => dismiss.click());
    expect(surfaceIn(panelA!), 'a.md의 배너가 해제되지 않았다').toBeNull();
    expect(surfaceIn(panelB!), '해제가 b.md의 배너까지 걷었다').not.toBeNull();
    expect(recon().stateFor('/w/b.md')?.status, 'b.md의 조정 상태가 바뀌었다').toBe('held-notify');
  });
});
