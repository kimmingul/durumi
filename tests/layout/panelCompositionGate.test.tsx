import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { installFakeApi, mountApp, type MountedApp } from '../_helpers/appHarness';
import { useWorkspaceStore } from '../../src/store/workspaceStore';
import { useReconciliationStore } from '../../src/store/reconciliationStore';
import { attachReconciliationCompositionGate } from '../../src/editor/compositionGate';
import type { ConfirmedChange, ReconciliationEffect } from '@shared/reconciliation';

/**
 * SPEC-V03-WORKSPACE-002 M4-2 — **IME 게이트는 패널별로 독립이고, 같은 문서를
 * 보는 게이트끼리만 합류한다** (AC-PANEL-054 / 054b ↔ REQ-PANEL-054).
 *
 * ## 두 축이 다르다
 *
 * 조합은 **편집 표면**에서 일어나고 조정 판정은 **문서**에 대해 일어난다
 * (`design.md` §6.3). 그래서 게이트는 표면마다 하나씩 생기되 자기가 보고 있는
 * **문서**에 합류(OR)한다. 이 두 축을 하나로 접으면 두 방향의 결함이 생긴다:
 *
 *  - 표면 축으로 접으면(창 전역 플래그) 패널 A의 조합이 패널 B **문서**의
 *    조정을 보류시킨다 — 054가 배제하는 결함.
 *  - 문서 축을 무시하면 같은 문서를 보는 패널 B에 적용해 버려 조합 중인 패널 A의
 *    문서를 바꾼다 — 054b가 배제하는 결함.
 *
 * ## 공허한 통과를 막는 관문 (b70f25a의 교훈)
 *
 * "보류되지 않았다"만 보면 **조합이 애초에 열리지 않은** 구현도 통과한다. 조합
 * 수명은 환경 사건으로 조기 종료될 수 있으므로, 조합이 열려 있음을 전제로 하는
 * 모든 단언은 그 전제를 함께 검사해야 한다:
 *
 *   - `starts >= 1` — 조합이 실제로 표면에 도달했다
 *   - `ends === 0`  — 단언 시점에 **아직 열려 있다**
 *
 * 이 관문 없이는 REQ-PANEL-071 계열 결함과 환경 잡음이 같은 빨간불을 낸다.
 *
 * ## 054b가 왜 게이트 계층에서 고정되는가
 *
 * AC 문언은 "패널 A와 B가 **같은** 문서를 참조"를 전제하지만, v0.3은 dual-open을
 * 금지하므로(REQ-PANEL-011) 그 UI 상태는 패널 API로 도달할 수 없다 —
 * `openInNewPanel`이 기존 패널로 **이동**시킨다. 그래서 054b는 그 상태가
 * 기계적으로 만들어 내는 것, 즉 **같은 경로를 해소하는 게이트 둘**을 실제
 * `attachReconciliationCompositionGate`로 붙여 고정한다. 합류 판정이 사는 곳이
 * 정확히 거기다.
 */

const store = () => useWorkspaceStore.getState();
const recon = () => useReconciliationStore.getState();

const changeFor = (path: string, content: string): ConfirmedChange => ({
  path,
  content,
  mtimeMs: 1,
  size: content.length,
});

const applied = (effects: ReconciliationEffect[]): string[] =>
  effects.filter((e) => e.kind === 'apply-to-buffer').map((e) => e.content);

interface CompositionCounts {
  starts: number;
  ends: number;
}

/** 문서 전체에서 조합 경계를 센다 — e2e의 `startComposition` 카운터와 같은 형태. */
function countComposition(): { counts: CompositionCounts; stop: () => void } {
  const counts: CompositionCounts = { starts: 0, ends: 0 };
  const onStart = () => { counts.starts += 1; };
  const onEnd = () => { counts.ends += 1; };
  document.addEventListener('compositionstart', onStart, true);
  document.addEventListener('compositionend', onEnd, true);
  return {
    counts,
    stop: () => {
      document.removeEventListener('compositionstart', onStart, true);
      document.removeEventListener('compositionend', onEnd, true);
    },
  };
}

function fire(el: HTMLElement, type: 'compositionstart' | 'compositionend'): void {
  act(() => {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  });
}

let app: MountedApp | null = null;

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function surfaces(app: MountedApp): HTMLElement[] {
  return [...app.host.querySelectorAll('[data-panel] .cm-content')] as HTMLElement[];
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

describe('AC-PANEL-054 — IME 게이트가 패널별로 독립이다', () => {
  it('패널 A의 조합이 패널 B 문서의 조정을 보류시키지 않는다', async () => {
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
    });
    await flush();

    const [surfaceA] = surfaces(app);
    expect(surfaceA, '패널 A의 편집 표면이 없다').toBeDefined();

    const observer = countComposition();
    try {
      fire(surfaceA!, 'compositionstart');

      // 관문: 조합이 실제로 열렸고 아직 열려 있다. 아래 단언의 전제다.
      expect(observer.counts.starts, '조합이 열리지 않았다 — 아래 단언이 공허해진다').toBeGreaterThanOrEqual(1);
      expect(observer.counts.ends, '조합이 열리자마자 닫혔다').toBe(0);

      // b.md는 미저장 편집이 없다 — 정책은 자동 반영을 낸다.
      const effects = recon().dispatchFor('/w/b.md', {
        type: 'external-change',
        change: changeFor('/w/b.md', '# disk b\n'),
      });

      expect(applied(effects), 'b.md가 자동 반영되지 않았다 — 남의 조합에 보류되었다').toEqual([
        '# disk b\n',
      ]);
      expect(recon().stateFor('/w/b.md')?.status, 'b.md가 보류 상태다').not.toBe('held-composition');
      expect(observer.counts.ends, '패널 A의 조합이 끊겼다').toBe(0);
    } finally {
      observer.stop();
    }
  });

  it('같은 조건에서 a.md는 보류된다 — 게이트가 살아 있음의 대조', async () => {
    // 위 단언이 "게이트가 아무 일도 안 한다"로도 통과하지 않게 하는 짝이다.
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
    });
    await flush();

    const [surfaceA] = surfaces(app);
    const observer = countComposition();
    try {
      fire(surfaceA!, 'compositionstart');
      expect(observer.counts.starts).toBeGreaterThanOrEqual(1);
      expect(observer.counts.ends).toBe(0);

      const effects = recon().dispatchFor('/w/a.md', {
        type: 'external-change',
        change: changeFor('/w/a.md', '# disk a\n'),
      });

      expect(applied(effects), '조합 중인 문서에 버퍼 적용이 일어났다').toEqual([]);
      expect(recon().stateFor('/w/a.md')?.status).toBe('held-composition');
      expect(observer.counts.ends, '조합이 끊겼다').toBe(0);
    } finally {
      observer.stop();
    }
  });
});

describe('AC-PANEL-054b — 같은 문서를 보는 게이트 중 하나라도 조합 중이면 보류된다', () => {
  /** 같은 경로를 해소하는 편집 표면 둘 — dual-open이 기계적으로 만드는 상태. */
  function twoGatesOnSamePath(path: string) {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    const gateA = attachReconciliationCompositionGate(a, () => path);
    const gateB = attachReconciliationCompositionGate(b, () => path);
    return {
      a,
      b,
      cleanup: () => {
        gateA.detach();
        gateB.detach();
        a.remove();
        b.remove();
      },
    };
  }

  it('한쪽만 조합 중이어도 보류되고, 그쪽이 끝나야 라우팅된다', async () => {
    recon().openDocument('/w/a.md');
    const { a, cleanup } = twoGatesOnSamePath('/w/a.md');
    const observer = countComposition();
    try {
      fire(a, 'compositionstart');
      expect(observer.counts.starts, '조합이 열리지 않았다').toBeGreaterThanOrEqual(1);
      expect(observer.counts.ends, '조합이 열리자마자 닫혔다').toBe(0);

      const effects = recon().dispatchFor('/w/a.md', {
        type: 'external-change',
        change: changeFor('/w/a.md', '# disk a\n'),
      });
      expect(applied(effects), '조합 중인 문서에 버퍼 적용이 일어났다').toEqual([]);
      expect(recon().stateFor('/w/a.md')?.status).toBe('held-composition');
      expect(observer.counts.ends, '단언 시점에 조합이 이미 닫혀 있었다').toBe(0);

      // 조합을 끝내면 그때 정책 라우터로 간다. 게이트는 확정 `input`을 기다려
      // 드레인을 매크로태스크로 미루므로 타이머를 흘려보낸다.
      fire(a, 'compositionend');
      await flush();
      expect(observer.counts.ends, '조합 종료가 관측되지 않았다').toBeGreaterThanOrEqual(1);
      expect(recon().stateFor('/w/a.md')?.status, '조합 종료가 라우팅으로 이어지지 않았다').not.toBe(
        'held-composition',
      );
    } finally {
      observer.stop();
      cleanup();
    }
  });

  it('다른 표면의 조합 종료가 진행 중인 조합의 보류를 풀지 않는다', async () => {
    recon().openDocument('/w/a.md');
    const { a, b, cleanup } = twoGatesOnSamePath('/w/a.md');
    const observer = countComposition();
    try {
      fire(a, 'compositionstart');
      fire(b, 'compositionstart');
      expect(observer.counts.starts, '조합이 둘 다 열리지 않았다').toBeGreaterThanOrEqual(2);
      expect(observer.counts.ends).toBe(0);

      recon().dispatchFor('/w/a.md', {
        type: 'external-change',
        change: changeFor('/w/a.md', '# disk a\n'),
      });
      expect(recon().stateFor('/w/a.md')?.status).toBe('held-composition');

      // b만 끝낸다 — a는 아직 조합 중이므로 보류가 유지되어야 한다.
      fire(b, 'compositionend');
      await flush();
      expect(
        recon().stateFor('/w/a.md')?.status,
        '남의 조합 종료가 진행 중인 조합의 보류를 풀었다 (REQ-PANEL-071)',
      ).toBe('held-composition');

      // a까지 끝나야 풀린다.
      fire(a, 'compositionend');
      await flush();
      expect(recon().stateFor('/w/a.md')?.status).not.toBe('held-composition');
    } finally {
      observer.stop();
      cleanup();
    }
  });
});
