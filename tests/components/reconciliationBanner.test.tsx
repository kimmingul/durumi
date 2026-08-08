import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { ReconciliationSurface } from '../../src/components/ReconciliationSurface';
import { useReconciliationStore } from '../../src/store/reconciliationStore';
import { bannerNotifyPolicy, type ConfirmedChange } from '@shared/reconciliation';

/**
 * 배너·보류 표시의 배선 테스트. 전이 판정 자체는
 * `tests/shared/reconciliation.test.ts`가 덮는다 — 여기서는 상태가 실제
 * DOM으로 나오는지, 그리고 모달 금지(REQ-WS-049)가 지켜지는지만 본다.
 */

const CHANGE: ConfirmedChange = { path: '/w/a.md', content: '# disk\n', mtimeMs: 1, size: 7 };

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<ReconciliationSurface />);
  });
  return {
    host,
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

beforeEach(() => useReconciliationStore.getState().reset());
afterEach(() => useReconciliationStore.getState().reset());

describe('배너 렌더 — REQ-WS-027 / AC-WS-029', () => {
  it('미저장 편집 + 외부 변경이면 두 동작을 가진 배너가 뜬다', () => {
    const { host, cleanup } = mount();
    act(() => {
      useReconciliationStore.getState().dispatch({ type: 'dirty-changed', isDirty: true });
      useReconciliationStore.getState().dispatch({ type: 'external-change', change: CHANGE });
    });
    const banner = host.querySelector('[data-reconcile-surface="banner"]');
    expect(banner).not.toBeNull();
    const actions = [...host.querySelectorAll('button')].map((b) => b.dataset.action);
    expect(actions).toContain('view-diff');
    expect(actions).toContain('load-from-disk');
    expect(actions).toContain('dismiss');
    cleanup();
  });

  it('해제하면 배너가 사라지고 버퍼 적용 effect가 없다', () => {
    const { host, cleanup } = mount();
    const applied: string[] = [];
    useReconciliationStore.getState().setEffectHandler((e) => {
      if (e.kind === 'apply-to-buffer') applied.push(e.content);
    });
    act(() => {
      useReconciliationStore.getState().dispatch({ type: 'dirty-changed', isDirty: true });
      useReconciliationStore.getState().dispatch({ type: 'external-change', change: CHANGE });
    });
    const dismiss = host.querySelector<HTMLButtonElement>('button[data-action="dismiss"]')!;
    act(() => dismiss.click());
    expect(host.querySelector('[data-reconcile-surface]')).toBeNull();
    expect(applied).toEqual([]);
    cleanup();
  });

  it('디스크에서 불러오기를 누르면 적용 effect가 나간다', () => {
    const { host, cleanup } = mount();
    const applied: string[] = [];
    useReconciliationStore.getState().setEffectHandler((e) => {
      if (e.kind === 'apply-to-buffer') applied.push(e.content);
    });
    act(() => {
      useReconciliationStore.getState().dispatch({ type: 'dirty-changed', isDirty: true });
      useReconciliationStore.getState().dispatch({ type: 'external-change', change: CHANGE });
    });
    const load = host.querySelector<HTMLButtonElement>('button[data-action="load-from-disk"]')!;
    act(() => load.click());
    expect(applied).toEqual(['# disk\n']);
    cleanup();
  });

  it('idle이면 아무것도 렌더하지 않는다', () => {
    const { host, cleanup } = mount();
    expect(host.querySelector('[data-reconcile-surface]')).toBeNull();
    cleanup();
  });
});

describe('보류·사라짐 표시 — REQ-WS-023, 030 / AC-WS-023, AC-WS-031', () => {
  it('조합 중 보류는 동작 버튼 없는 status 표면으로 표시된다', () => {
    const { host, cleanup } = mount();
    act(() => {
      useReconciliationStore.getState().dispatch({ type: 'composition-start' });
      useReconciliationStore.getState().dispatch({ type: 'external-change', change: CHANGE });
    });
    const surface = host.querySelector('[data-reconcile-surface="status"]');
    expect(surface).not.toBeNull();
    expect(host.querySelectorAll('button')).toHaveLength(0);
    cleanup();
  });

  it('삭제되면 사라짐 표시가 뜨고 해제 버튼이 없다', () => {
    const { host, cleanup } = mount();
    act(() => {
      useReconciliationStore.getState().dispatch({ type: 'external-delete', path: '/w/a.md' });
    });
    expect(host.querySelector('[data-reconcile-status="missing"]')).not.toBeNull();
    expect(host.querySelector('button[data-action="dismiss"]')).toBeNull();
    cleanup();
  });

  it('디코드 실패는 원인을 담은 배너로 보고된다', () => {
    const { host, cleanup } = mount();
    act(() => {
      useReconciliationStore
        .getState()
        .dispatch({ type: 'decode-error', path: '/w/a.md', message: 'invalid utf-8' });
    });
    const surface = host.querySelector('[data-reconcile-status="decode-error"]');
    expect(surface).not.toBeNull();
    expect(surface!.textContent).toContain('invalid utf-8');
    cleanup();
  });
});

describe('모달 금지 — REQ-WS-049 / AC-WS-060', () => {
  /** 알림이 뜰 수 있는 모든 상태를 한 번씩 렌더해 DOM을 검사한다. */
  const scenarios: [string, () => void][] = [
    [
      'held-notify',
      () => {
        useReconciliationStore.getState().dispatch({ type: 'dirty-changed', isDirty: true });
        useReconciliationStore.getState().dispatch({ type: 'external-change', change: CHANGE });
      },
    ],
    [
      'held-composition',
      () => {
        useReconciliationStore.getState().dispatch({ type: 'composition-start' });
        useReconciliationStore.getState().dispatch({ type: 'external-change', change: CHANGE });
      },
    ],
    ['missing', () => useReconciliationStore.getState().dispatch({ type: 'external-delete', path: 'p' })],
    [
      'decode-error',
      () => useReconciliationStore.getState().dispatch({ type: 'decode-error', path: 'p', message: 'm' }),
    ],
    [
      'held-approval',
      () => {
        useReconciliationStore
          .getState()
          .setPolicy({ id: 'q', decide: () => ({ kind: 'defer', reason: 'r' }) });
        useReconciliationStore.getState().dispatch({ type: 'external-change', change: CHANGE });
      },
    ],
  ];

  for (const [name, arrange] of scenarios) {
    it(`${name}: 모달 역할 요소가 없고 포커스가 이동하지 않는다`, () => {
      const probe = document.createElement('input');
      document.body.appendChild(probe);
      probe.focus();
      const before = document.activeElement;

      const { host, cleanup } = mount();
      act(arrange);

      expect(host.querySelector('[data-reconcile-surface]'), name).not.toBeNull();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(document.querySelector('[role="alertdialog"]')).toBeNull();
      expect(document.querySelector('dialog')).toBeNull();
      expect(document.activeElement).toBe(before);

      cleanup();
      probe.remove();
    });
  }

  it('배너 알림 정책으로 깨끗한 버퍼에서도 모달이 생기지 않는다', () => {
    const { host, cleanup } = mount();
    act(() => {
      useReconciliationStore.getState().setPolicy(bannerNotifyPolicy);
      useReconciliationStore.getState().dispatch({ type: 'external-change', change: CHANGE });
    });
    expect(host.querySelector('[data-reconcile-surface="banner"]')).not.toBeNull();
    expect(document.querySelector('dialog')).toBeNull();
    cleanup();
  });

  it('조정 표면 소스에 모달·포커스 강탈 수단이 없다', () => {
    // 타입 수준의 표현 불가능성(NOTICE_PRESENTATIONS)과 짝을 이루는 두 번째
    // 방어선. 렌더러가 우회해서 모달을 만들면 여기서 잡힌다.
    const files = [
      join(process.cwd(), 'src', 'components', 'ReconciliationSurface.tsx'),
      join(process.cwd(), 'src', 'store', 'reconciliationStore.ts'),
      join(process.cwd(), 'shared', 'reconciliation.ts'),
    ];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/role=["']alertdialog["']/);
      expect(src, f).not.toMatch(/role=["']dialog["']/);
      expect(src, f).not.toMatch(/<dialog/);
      expect(src, f).not.toMatch(/showModal/);
      expect(src, f).not.toMatch(/\.focus\(/);
      expect(src, f).not.toMatch(/autoFocus/);
    }
  });
});
