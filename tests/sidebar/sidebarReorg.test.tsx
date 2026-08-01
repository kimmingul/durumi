import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { Sidebar } from '../../src/components/Sidebar';
import { RightSidebar } from '../../src/components/RightSidebar';
import { useSidebarStore } from '../../src/store/sidebarStore';
import { useRightSidebarStore } from '../../src/store/rightSidebarStore';
import { useBibliographyStore } from '../../src/store/bibliographyStore';

/**
 * v0.2.30 사이드바 재편 회귀 테스트.
 *
 * 왼쪽 = 내비게이션(파일/목차/검색), 오른쪽 = 작업(참고문헌/AI/메모/변경).
 * 이 파일은 이동한 두 탭이 왼쪽에서 사라지고 오른쪽에서 동작하는지,
 * 그리고 메모 탭 카운트 배지가 조건부로 렌더되는지를 고정한다.
 */

interface ApiMock {
  prefsGet: ReturnType<typeof vi.fn>;
  prefsSet: ReturnType<typeof vi.fn>;
  aiKeyStatus: ReturnType<typeof vi.fn>;
  bibliographyReadEntries: ReturnType<typeof vi.fn>;
  bibliographyFind: ReturnType<typeof vi.fn>;
  bibliographyComputePath: ReturnType<typeof vi.fn>;
  bibliographyEnsureFile: ReturnType<typeof vi.fn>;
  referenceStatus: ReturnType<typeof vi.fn>;
  referenceScan: ReturnType<typeof vi.fn>;
  memoSidecarLoad: ReturnType<typeof vi.fn>;
  memoSidecarSave: ReturnType<typeof vi.fn>;
}

function installApiMock(): ApiMock {
  const api: ApiMock = {
    prefsGet: vi.fn().mockResolvedValue({
      workspaceFolders: [],
      memoPanel: { width: 320, hideResolvedDefault: true, groupBy: 'line' },
    }),
    prefsSet: vi.fn().mockResolvedValue(undefined),
    aiKeyStatus: vi.fn().mockResolvedValue('none'),
    bibliographyReadEntries: vi.fn().mockResolvedValue({ ok: true, entries: [], warnings: [] }),
    bibliographyFind: vi.fn().mockResolvedValue(null),
    bibliographyComputePath: vi
      .fn()
      .mockResolvedValue({ ok: true, path: '/p/references.bib', exists: false }),
    bibliographyEnsureFile: vi
      .fn()
      .mockResolvedValue({ ok: true, path: '/p/references.bib', created: false }),
    referenceStatus: vi
      .fn()
      .mockResolvedValue({ exists: false, absPath: null, relPath: null, type: null }),
    referenceScan: vi.fn().mockResolvedValue({ ok: true, files: [] }),
    memoSidecarLoad: vi.fn().mockResolvedValue(null),
    memoSidecarSave: vi.fn().mockResolvedValue({ ok: true }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = api;
  return api;
}

/** rightSidebar.test.tsx 와 동일한 폴링 헬퍼(고정 지연 금지). */
async function waitFor(
  predicate: () => boolean,
  description: string,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`waitFor timed out after ${timeout}ms waiting for: ${description}`);
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, interval));
    });
  }
}

/** 부재(absence) 단언용 결정적 정착 단계. 폴링으로는 "여전히 없음"을 표현할 수 없다. */
async function settle(turns = 5): Promise<void> {
  await act(async () => {
    for (let i = 0; i < turns; i += 1) {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    }
  });
}

function mountLeft(content: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <Sidebar content={content} view={null} onOpenFile={() => {}} />,
    );
  });
  return {
    host,
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function mountRight(content: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <RightSidebar
        content={content}
        view={null}
        onInsertCitation={() => {}}
        onCitationRenamed={() => {}}
        onOpenAiPalette={() => {}}
        onSuggestCitations={() => {}}
        onInsertCitationFromDoi={() => {}}
        onOpenSettings={() => {}}
      />,
    );
  });
  return {
    host,
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

beforeEach(() => {
  useSidebarStore.setState({ visible: true, activeTab: 'files', width: 240 });
  useRightSidebarStore.setState({ visible: true, activeTab: 'references', width: 280 });
  useBibliographyStore.setState({
    filePath: '/p/references.bib',
    exists: true,
    entries: [],
    loading: false,
  });
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).api;
  useBibliographyStore.setState({
    filePath: null,
    exists: false,
    entries: [],
    loading: false,
  });
});

describe('Sidebar (left) after the navigation/work split', () => {
  it('renders exactly the three navigation tabs', async () => {
    installApiMock();
    const { host, cleanup } = mountLeft('plain text');
    await settle();
    expect(host.querySelectorAll('.cm-sidebar-tab').length).toBe(3);
    cleanup();
  });

  it('no longer renders the memo or changes tab buttons', async () => {
    installApiMock();
    // CriticMarkup 과 메모가 모두 들어있는 문서 — 예전이면 배지까지 떴을 내용.
    const { host, cleanup } = mountLeft('{++added++}\n%% @todo memo %%');
    await settle();
    expect(host.querySelector('[data-testid="sidebar-tab-changes"]')).toBeNull();
    expect(host.querySelector('[data-testid="sidebar-tab-changes-badge"]')).toBeNull();
    const labels = Array.from(host.querySelectorAll('.cm-sidebar-tab')).map(
      (b) => b.textContent ?? '',
    );
    expect(labels.some((l) => l.includes('Memo') || l.includes('메모'))).toBe(false);
    expect(labels.some((l) => l.includes('Change') || l.includes('변경'))).toBe(false);
    cleanup();
  });
});

describe('RightSidebar after absorbing memo + changes', () => {
  it('renders all four tab buttons', async () => {
    installApiMock();
    const { host, cleanup } = mountRight('');
    await waitFor(
      () =>
        host.querySelector('[data-testid="right-sidebar-tab-references"]') !== null &&
        host.querySelector('[data-testid="right-sidebar-tab-ai"]') !== null &&
        host.querySelector('[data-testid="right-sidebar-tab-memo"]') !== null &&
        host.querySelector('[data-testid="right-sidebar-tab-changes"]') !== null,
      'all four right-sidebar tab buttons to render',
    );
    expect(host.querySelectorAll('.cm-right-sidebar-tab').length).toBe(4);
    cleanup();
  });

  it('clicking the memo tab button switches the store and shows the memo body', async () => {
    installApiMock();
    const { host, cleanup } = mountRight('%% @todo check this %%');
    await waitFor(
      () => host.querySelector('[data-testid="right-sidebar-tab-memo"]') !== null,
      'the memo tab button to render',
    );
    const memoBtn = host.querySelector(
      '[data-testid="right-sidebar-tab-memo"]',
    ) as HTMLButtonElement;
    act(() => { memoBtn.click(); });
    expect(useRightSidebarStore.getState().activeTab).toBe('memo');
    await waitFor(
      () => host.querySelector('[data-testid="memo-tab"]') !== null,
      'the memo tab body to render',
    );
    // MemoPanel 고유 컨트롤이 탭 안으로 흡수되었는지 확인한다.
    expect(host.querySelector('[data-testid="memo-panel-groupby"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="memo-panel-hide-resolved"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="references-tab"]')).toBeNull();
    cleanup();
  });

  it('renders one memo card per memo in the memo tab', async () => {
    installApiMock();
    useRightSidebarStore.setState({ visible: true, activeTab: 'memo' });
    const { host, cleanup } = mountRight('%% @todo one %%\nsecond %% @ai two %%');
    await waitFor(
      () => host.querySelectorAll('.cm-memo-card').length === 2,
      'two memo cards to render',
    );
    expect(host.querySelectorAll('.cm-memo-card').length).toBe(2);
    cleanup();
  });

  it('clicking the changes tab button switches the store and shows the changes body', async () => {
    installApiMock();
    const { host, cleanup } = mountRight('{++inserted++}');
    await waitFor(
      () => host.querySelector('[data-testid="right-sidebar-tab-changes"]') !== null,
      'the changes tab button to render',
    );
    const changesBtn = host.querySelector(
      '[data-testid="right-sidebar-tab-changes"]',
    ) as HTMLButtonElement;
    act(() => { changesBtn.click(); });
    expect(useRightSidebarStore.getState().activeTab).toBe('changes');
    await waitFor(
      () => host.querySelector('[data-testid="cm-row-insert"]') !== null,
      'the changes tab body to render',
    );
    expect(host.querySelector('[data-testid="cm-row-insert"]')).not.toBeNull();
    cleanup();
  });

  it('switches back to references from a moved tab', async () => {
    installApiMock();
    useRightSidebarStore.setState({ visible: true, activeTab: 'changes' });
    const { host, cleanup } = mountRight('{++inserted++}');
    await waitFor(
      () => host.querySelector('[data-testid="right-sidebar-tab-references"]') !== null,
      'the references tab button to render',
    );
    const refBtn = host.querySelector(
      '[data-testid="right-sidebar-tab-references"]',
    ) as HTMLButtonElement;
    act(() => { refBtn.click(); });
    expect(useRightSidebarStore.getState().activeTab).toBe('references');
    cleanup();
  });
});

describe('RightSidebar tab count badges', () => {
  it('shows the memo count badge when the document has memos', async () => {
    installApiMock();
    const { host, cleanup } = mountRight('%% @todo one %%\nsecond %% @ai two %%');
    await waitFor(
      () => host.querySelector('[data-testid="right-sidebar-tab-memo-badge"]') !== null,
      'the memo count badge to render',
    );
    expect(
      host.querySelector('[data-testid="right-sidebar-tab-memo-badge"]')?.textContent,
    ).toBe('2');
    cleanup();
  });

  it('hides the memo count badge when the document has no memos', async () => {
    installApiMock();
    const { host, cleanup } = mountRight('just prose, no memos here');
    await waitFor(
      () => host.querySelector('[data-testid="right-sidebar-tab-memo"]') !== null,
      'the memo tab button to render',
    );
    await settle();
    expect(host.querySelector('[data-testid="right-sidebar-tab-memo-badge"]')).toBeNull();
    cleanup();
  });

  it('shows the changes count badge when the document has tracked changes', async () => {
    installApiMock();
    const { host, cleanup } = mountRight('{++added++} and {--removed--}');
    await waitFor(
      () => host.querySelector('[data-testid="right-sidebar-tab-changes-badge"]') !== null,
      'the changes count badge to render',
    );
    expect(
      host.querySelector('[data-testid="right-sidebar-tab-changes-badge"]')?.textContent,
    ).toBe('2');
    cleanup();
  });

  it('hides the changes count badge on a document with no tracked changes', async () => {
    installApiMock();
    const { host, cleanup } = mountRight('just prose');
    await waitFor(
      () => host.querySelector('[data-testid="right-sidebar-tab-changes"]') !== null,
      'the changes tab button to render',
    );
    await settle();
    expect(host.querySelector('[data-testid="right-sidebar-tab-changes-badge"]')).toBeNull();
    cleanup();
  });
});
