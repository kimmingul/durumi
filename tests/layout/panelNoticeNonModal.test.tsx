import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react-dom/test-utils';
import { installFakeApi, mountApp, type MountedApp } from '../_helpers/appHarness';
import { useWorkspaceStore } from '../../src/store/workspaceStore';
import { useReconciliationStore } from '../../src/store/reconciliationStore';
import type { ConfirmedChange } from '@shared/reconciliation';

/**
 * SPEC-V03-WORKSPACE-002 M4-2 — **패널 관련 알림은 모달을 쓰지 않는다**
 * (AC-PANEL-058 ↔ REQ-PANEL-058, REQ-WS-049 승계).
 *
 * ## 왜 모달이 금지인가
 *
 * 모달은 포커스를 강탈한다. 조합 중 포커스를 빼앗기면 한글 IME가 그 자리에서
 * 깨진다 — 이 저장소가 v0.2.19~.28에 걸쳐 다섯 번 출하한 실패 계열이다.
 * 그리고 모달은 창 전역이므로 **어느 패널의 알림인지 표현할 수 없다**:
 * 배너를 패널 안으로 옮긴 것(REQ-PANEL-053)과 같은 논거다.
 *
 * ## 예외 하나
 *
 * 미저장 편집 폐기 확인(`window.api.confirmDiscard`)은 이 SPEC이 도입한 것이
 * 아니므로 대상 밖이다. 그것은 main의 네이티브 대화상자라 렌더러 DOM에
 * `role="dialog"`를 만들지도 않는다.
 *
 * ## 다섯 상태 중 넷만 재현 가능하다 — 그리고 그 사실을 감추지 않는다
 *
 * AC 문언은 분할·닫기 실패·**복원 실패**·조정 알림·감시 등록 실패 다섯을 든다.
 * 그중 복원 실패는 **패널 배치 persist의 실패 경로**(AC-PANEL-006b)이고, 그
 * 표면은 `plan.md` §C **M8**의 산출물이라 M4-2 시점에 존재하지 않는다. 없는
 * 표면에 "모달이 없다"를 단언하면 공허하게 참이다.
 *
 * 그래서 여기서는 (a) 재현 가능한 네 상태를 DOM으로 검사하고, (b) M8이 복원
 * 실패 알림을 만들 때 **반드시 거쳐야 할 알림 기구**의 소스를 스캔한다. 새 알림
 * 표면을 다른 파일에 만들면 스캔 목록이 갱신되어야 하고, 그것이 M8에서 이 AC를
 * 재검증하게 만드는 장치다. 복원 실패 상태의 최종 판정은 M8 소속이다.
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

/** 창 전체에서 모달 수단을 찾는다. 하나라도 있으면 실패다. */
function assertNoModal(label: string): void {
  expect(document.querySelector('[role="dialog"]'), `${label}: role=dialog가 떴다`).toBeNull();
  expect(
    document.querySelector('[role="alertdialog"]'),
    `${label}: role=alertdialog가 떴다`,
  ).toBeNull();
  expect(document.querySelector('dialog'), `${label}: <dialog>가 떴다`).toBeNull();
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

describe('AC-PANEL-058 — 재현 가능한 패널 상태가 모달을 쓰지 않는다', () => {
  it('분할: 패널이 늘어도 모달이 없고 포커스가 그대로다', async () => {
    app = mountApp();
    await flush();
    const probe = document.createElement('input');
    document.body.appendChild(probe);
    probe.focus();

    act(() => {
      store().openInNewPanel(null, '', 'markdown');
    });
    await flush();

    expect(app.host.querySelectorAll('[data-panel]'), '분할이 일어나지 않았다').toHaveLength(2);
    assertNoModal('분할');
    expect(document.activeElement, '분할이 포커스를 옮겼다').toBe(probe);
    probe.remove();
  });

  it('닫기 실패: 마지막 패널 닫기 거부가 모달도 오류 대화상자도 만들지 않는다', async () => {
    app = mountApp();
    await flush();
    const probe = document.createElement('input');
    document.body.appendChild(probe);
    probe.focus();

    const only = store().panels[0]!.panelId;
    let closed = true;
    act(() => {
      closed = store().closePanel(only);
    });
    await flush();

    expect(closed, '마지막 패널이 닫혔다 — 거부 상태가 재현되지 않았다').toBe(false);
    expect(app.host.querySelectorAll('[data-panel]')).toHaveLength(1);
    assertNoModal('닫기 실패');
    expect(document.activeElement, '닫기 거부가 포커스를 옮겼다').toBe(probe);
    probe.remove();
  });

  it('조정 알림: 배너가 뜬 상태에 모달이 없고 포커스가 그대로다', async () => {
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    await flush();
    const doc = [...store().documents.values()].find((d) => d.path === '/w/a.md')!;
    act(() => {
      store().editDocument(doc.id, 'A\n편집\n');
    });
    await flush();

    const probe = document.createElement('input');
    document.body.appendChild(probe);
    probe.focus();

    act(() => {
      recon().dispatchFor('/w/a.md', {
        type: 'external-change',
        change: changeFor('/w/a.md', '# disk\n'),
      });
    });

    expect(
      app.host.querySelector('[data-panel] [data-reconcile-surface]'),
      '배너가 뜨지 않았다 — 단언이 공허하다',
    ).not.toBeNull();
    assertNoModal('조정 알림');
    expect(document.activeElement, '배너 등장이 포커스를 옮겼다').toBe(probe);
    probe.remove();
  });

  it('감시 등록 실패: 등록이 거부되어도 모달이 없고 편집이 계속된다', async () => {
    let attempted = 0;
    installFakeApi({
      memoSidecarRead: async () => null,
      filesIndex: async () => [],
      watchOpenFile: async () => {
        attempted += 1;
        throw new Error('신뢰 밖 경로');
      },
    });
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    await flush();

    expect(attempted, '감시 등록이 시도되지 않았다 — 실패 상태가 재현되지 않았다').toBeGreaterThanOrEqual(1);
    assertNoModal('감시 등록 실패');
    // 조정 없이 편집만 계속된다 — 실패가 편집 표면을 앗아가지 않는다.
    expect(app.host.querySelector('[data-panel] .cm-content')).not.toBeNull();
  });
});

describe('AC-PANEL-058 — 알림 기구에 모달 수단이 없다 (소스 스캔)', () => {
  /**
   * 스캔 대상이 두 층인 이유 — 초판이 한 층으로 뭉쳤다가 정정했다.
   *
   * AC 문언의 포커스 조항은 "**조정·패널 알림 소스**에 자동 포커스 속성과
   * 프로그램적 포커스 호출이 없다"이다. 즉 포커스 금지는 **알림을 그리는
   * 표면**에 걸리는 것이지 모든 패널 관련 파일에 걸리는 것이 아니다.
   *
   * 실제로 물렸다: `useMenuCommandRouter.ts`는 `findNext`/`findPrev` 같은
   * **사용자가 부른 캐럿 명령**에서 `view.focus()`를 호출한다(`:307-308`,
   * `:331`). 그것은 알림이 포커스를 빼앗는 것이 아니라 사용자가 요청한 캐럿
   * 이동이고, 금지하면 기능이 사라진다. 초판 스캔이 그 파일에 포커스 금지를
   * 걸어 빨간불이 났고, **코드가 아니라 스캔 대상이 틀렸던 것**이다.
   *
   * 그래서 모달 금지(층 1+2 공통)와 포커스 금지(층 1 전용)를 갈랐다. 모달은
   * 어느 쪽에서 만들어도 결함이므로 두 층 모두에 건다.
   */

  /** 층 1 — 알림을 **그리는** 표면. 모달도 포커스 강탈도 금지. */
  const NOTICE_RENDER_SURFACES = [
    join('src', 'components', 'ReconciliationSurface.tsx'),
    join('src', 'components', 'PanelContainer.tsx'),
    join('src', 'components', 'Toast.tsx'),
  ];

  /**
   * 층 2 — 패널 상태 전이와 감시 배선. 알림을 그리지는 않지만 모달을 띄울 수는
   * 있다. M8의 복원 실패 알림이 새 파일에 산다면 이 목록이 갱신되어야 하고,
   * 그것이 M8에서 이 AC를 재검증하게 하는 장치다.
   */
  const PANEL_STATE_PATHS = [
    join('src', 'hooks', 'useMenuCommandRouter.ts'),
    join('src', 'hooks', 'useExternalChangeWiring.ts'),
  ];

  const expectNoModalMeans = (rel: string): string => {
    const src = readFileSync(join(process.cwd(), rel), 'utf8');
    expect(src, rel).not.toMatch(/role=["']dialog["']/);
    expect(src, rel).not.toMatch(/role=["']alertdialog["']/);
    expect(src, rel).not.toMatch(/<dialog/);
    expect(src, rel).not.toMatch(/showModal/);
    return src;
  };

  for (const rel of NOTICE_RENDER_SURFACES) {
    it(`${rel}: 모달 생성 수단도 포커스 강탈 수단도 없다`, () => {
      const src = expectNoModalMeans(rel);
      expect(src, rel).not.toMatch(/autoFocus/);
      expect(src, rel).not.toMatch(/\.focus\(/);
    });
  }

  for (const rel of PANEL_STATE_PATHS) {
    it(`${rel}: 모달 생성 수단이 없다`, () => {
      expectNoModalMeans(rel);
    });
  }
});
