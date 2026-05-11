import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { RightSidebar } from '../../src/components/RightSidebar';
import { useRightSidebarStore } from '../../src/store/rightSidebarStore';
import { useBibliographyStore } from '../../src/store/bibliographyStore';
import { useAiUsageStore } from '../../src/store/aiUsageStore';

// jsdom resize drag is intentionally NOT exercised here — it's flaky and the
// arithmetic that matters (clamping in setWidth) is covered by the store test.

interface ApiMock {
  prefsGet: ReturnType<typeof vi.fn>;
  prefsSet: ReturnType<typeof vi.fn>;
  aiHasKey: ReturnType<typeof vi.fn>;
  bibliographySearchCrossref: ReturnType<typeof vi.fn>;
  bibliographySearchPubmed: ReturnType<typeof vi.fn>;
  bibliographySearchKoreamed: ReturnType<typeof vi.fn>;
  bibliographyAppendEntry: ReturnType<typeof vi.fn>;
  bibliographyResolveDoi: ReturnType<typeof vi.fn>;
  bibliographyEnsureFile: ReturnType<typeof vi.fn>;
  bibliographyReadEntries: ReturnType<typeof vi.fn>;
  bibliographyFind: ReturnType<typeof vi.fn>;
  referenceStatus: ReturnType<typeof vi.fn>;
  referenceScan: ReturnType<typeof vi.fn>;
  referenceExtractDoi: ReturnType<typeof vi.fn>;
  referenceOpen: ReturnType<typeof vi.fn>;
}

function installApiMock(): ApiMock {
  const api: ApiMock = {
    prefsGet: vi.fn().mockResolvedValue({
      workspaceFolders: [],
      ai: {
        provider: 'anthropic',
        anthropicKey: 'enc:x',
        anthropicModel: 'claude-sonnet-4-6',
        openaiKey: '',
        openaiBaseUrl: 'https://api.openai.com',
        openaiModel: 'gpt-4o-mini',
        ghostTextEnabled: false,
      },
    }),
    prefsSet: vi.fn().mockResolvedValue(undefined),
    aiHasKey: vi.fn().mockResolvedValue(true),
    bibliographySearchCrossref: vi.fn().mockResolvedValue({ ok: true, hits: [] }),
    bibliographySearchPubmed: vi.fn().mockResolvedValue({ ok: true, hits: [] }),
    bibliographySearchKoreamed: vi.fn().mockResolvedValue({ ok: true, hits: [] }),
    bibliographyAppendEntry: vi
      .fn()
      .mockResolvedValue({ ok: true, key: 'mocked', path: '/p/references.bib' }),
    bibliographyResolveDoi: vi.fn(),
    bibliographyEnsureFile: vi
      .fn()
      .mockResolvedValue({ ok: true, path: '/p/references.bib', created: false }),
    bibliographyReadEntries: vi
      .fn()
      .mockResolvedValue({ ok: true, entries: [], warnings: [] }),
    bibliographyFind: vi.fn().mockResolvedValue(null),
    referenceStatus: vi
      .fn()
      .mockResolvedValue({ exists: false, absPath: null, relPath: null, type: null }),
    referenceScan: vi.fn().mockResolvedValue({ ok: true, files: [] }),
    referenceExtractDoi: vi.fn().mockResolvedValue({ doi: null, source: 'none' }),
    referenceOpen: vi.fn().mockResolvedValue({ ok: true }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = api;
  return api;
}

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const handlers = {
    onInsertCitation: vi.fn(),
    onCitationRenamed: vi.fn(),
    onOpenAiPalette: vi.fn(),
    onSuggestCitations: vi.fn(),
    onInsertCitationFromDoi: vi.fn(),
    onOpenSettings: vi.fn(),
  };
  act(() => {
    root.render(
      <RightSidebar
        content=""
        view={null}
        onInsertCitation={handlers.onInsertCitation}
        onCitationRenamed={handlers.onCitationRenamed}
        onOpenAiPalette={handlers.onOpenAiPalette}
        onSuggestCitations={handlers.onSuggestCitations}
        onInsertCitationFromDoi={handlers.onInsertCitationFromDoi}
        onOpenSettings={handlers.onOpenSettings}
      />,
    );
  });
  return {
    host,
    handlers,
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

async function flush(ms = 30): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

beforeEach(() => {
  // Pristine store state for every test.
  useRightSidebarStore.setState({
    visible: false,
    activeTab: 'references',
    width: 280,
  });
  useBibliographyStore.setState({
    filePath: '/p/references.bib',
    exists: true,
    entries: [],
    loading: false,
  });
  useAiUsageStore.setState({
    recent: [],
    byModel: {},
    bySource: {
      palette: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 },
      citeSuggest: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 },
      ghostText: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 },
      verify: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 },
      other: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 },
    },
    total: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 },
    sessionCalls: 0,
  } as never);
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

describe('RightSidebar', () => {
  it('renders nothing when the store reports visible=false', async () => {
    installApiMock();
    const { host, cleanup } = mount();
    await flush();
    // Component returns null — nothing should be in the host.
    expect(host.querySelector('[data-testid="right-sidebar-tab-references"]')).toBeNull();
    expect(host.querySelector('[data-testid="right-sidebar-tab-ai"]')).toBeNull();
    expect(host.querySelector('.cm-right-sidebar')).toBeNull();
    cleanup();
  });

  it('renders both tab buttons when visible=true', async () => {
    installApiMock();
    useRightSidebarStore.setState({ visible: true, activeTab: 'references' });
    const { host, cleanup } = mount();
    await flush();
    const refBtn = host.querySelector('[data-testid="right-sidebar-tab-references"]');
    const aiBtn = host.querySelector('[data-testid="right-sidebar-tab-ai"]');
    expect(refBtn).not.toBeNull();
    expect(aiBtn).not.toBeNull();
    cleanup();
  });

  it('shows the References body when activeTab=references', async () => {
    installApiMock();
    useRightSidebarStore.setState({ visible: true, activeTab: 'references' });
    const { host, cleanup } = mount();
    await flush();
    // The references tab body uses data-testid="references-tab" on its root.
    expect(host.querySelector('[data-testid="references-tab"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="ai-tab"]')).toBeNull();
    cleanup();
  });

  it('shows the AI body when activeTab=ai', async () => {
    installApiMock();
    useRightSidebarStore.setState({ visible: true, activeTab: 'ai' });
    const { host, cleanup } = mount();
    await flush();
    expect(host.querySelector('[data-testid="ai-tab"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="references-tab"]')).toBeNull();
    cleanup();
  });

  it('clicking the AI tab button switches the store to activeTab=ai', async () => {
    installApiMock();
    useRightSidebarStore.setState({ visible: true, activeTab: 'references' });
    const { host, cleanup } = mount();
    await flush();
    expect(useRightSidebarStore.getState().activeTab).toBe('references');
    const aiBtn = host.querySelector('[data-testid="right-sidebar-tab-ai"]') as HTMLButtonElement;
    expect(aiBtn).not.toBeNull();
    act(() => { aiBtn.click(); });
    expect(useRightSidebarStore.getState().activeTab).toBe('ai');
    await flush();
    // And after the re-render, the AI body is visible.
    expect(host.querySelector('[data-testid="ai-tab"]')).not.toBeNull();
    cleanup();
  });

  it('clicking the References tab button switches the store back', async () => {
    installApiMock();
    useRightSidebarStore.setState({ visible: true, activeTab: 'ai' });
    const { host, cleanup } = mount();
    await flush();
    expect(useRightSidebarStore.getState().activeTab).toBe('ai');
    const refBtn = host.querySelector('[data-testid="right-sidebar-tab-references"]') as HTMLButtonElement;
    act(() => { refBtn.click(); });
    expect(useRightSidebarStore.getState().activeTab).toBe('references');
    cleanup();
  });
});
