import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { AiTab } from '../../src/components/sidebar/AiTab';
import { useAiUsageStore } from '../../src/store/aiUsageStore';

interface ApiMock {
  prefsGet: ReturnType<typeof vi.fn>;
  aiHasKey: ReturnType<typeof vi.fn>;
}

function installApiMock(opts: { hasKey?: boolean } = {}): ApiMock {
  const api: ApiMock = {
    prefsGet: vi.fn().mockResolvedValue({
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
    aiHasKey: vi.fn().mockResolvedValue(opts.hasKey ?? true),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = api;
  return api;
}

function mount(props: Partial<React.ComponentProps<typeof AiTab>> = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onOpenPalette = vi.fn();
  const onSuggestCitations = vi.fn();
  const onInsertCitationFromDoi = vi.fn();
  const onOpenSettings = vi.fn();
  act(() => {
    root.render(
      <AiTab
        selectionText={props.selectionText ?? ''}
        onOpenPalette={props.onOpenPalette ?? onOpenPalette}
        onSuggestCitations={props.onSuggestCitations ?? onSuggestCitations}
        onInsertCitationFromDoi={props.onInsertCitationFromDoi ?? onInsertCitationFromDoi}
        onOpenSettings={props.onOpenSettings ?? onOpenSettings}
      />,
    );
  });
  return {
    host,
    onOpenPalette,
    onSuggestCitations,
    onInsertCitationFromDoi,
    onOpenSettings,
    cleanup: () => { act(() => root.unmount()); host.remove(); },
  };
}

async function flush(ms = 20): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

beforeEach(() => {
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
  });
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).api;
});

describe('AiTab', () => {
  it('renders the provider row when a key is configured', async () => {
    installApiMock();
    const { host, cleanup } = mount();
    await flush();
    expect(host.querySelector('[data-testid="ai-tab-provider"]')).not.toBeNull();
    cleanup();
  });

  it('shows the no-key warning when no provider is configured', async () => {
    installApiMock({ hasKey: false });
    const { host, cleanup } = mount();
    await flush();
    expect(host.querySelector('[data-testid="ai-tab-no-key"]')).not.toBeNull();
    cleanup();
  });

  it('disables selection commands when there is no selection', async () => {
    installApiMock();
    const { host, cleanup } = mount({ selectionText: '' });
    await flush();
    const cmdBtns = host.querySelectorAll('[data-testid^="ai-tab-cmd-"]');
    expect(cmdBtns.length).toBeGreaterThan(0);
    cmdBtns.forEach((btn) => {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
    cleanup();
  });

  it('enables selection commands when text is selected AND key is set', async () => {
    installApiMock();
    const { host, cleanup } = mount({ selectionText: 'some selected text here' });
    await flush();
    const polishBtn = host.querySelector('[data-testid="ai-tab-cmd-polishEnglish"]') as HTMLButtonElement;
    expect(polishBtn.disabled).toBe(false);
    cleanup();
  });

  it('calls onOpenPalette when a command button is clicked', async () => {
    installApiMock();
    const m = mount({ selectionText: 'sample selected text' });
    await flush();
    const polishBtn = m.host.querySelector('[data-testid="ai-tab-cmd-polishEnglish"]') as HTMLButtonElement;
    act(() => { polishBtn.click(); });
    expect(m.onOpenPalette).toHaveBeenCalled();
    m.cleanup();
  });

  it('calls onSuggestCitations when the citation suggest button fires', async () => {
    installApiMock();
    const m = mount();
    await flush();
    const btn = m.host.querySelector('[data-testid="ai-tab-suggest-citations"]') as HTMLButtonElement;
    act(() => { btn.click(); });
    expect(m.onSuggestCitations).toHaveBeenCalled();
    m.cleanup();
  });

  it('renders recent activity from the usage store', async () => {
    installApiMock();
    useAiUsageStore.setState({
      recent: [
        {
          ts: '2026-05-11T12:00:00.000Z',
          model: 'claude-sonnet-4-6',
          inputTokens: 100,
          outputTokens: 50,
          costUsd: 0.001,
          source: 'palette',
        },
      ],
      total: { inputTokens: 100, outputTokens: 50, costUsd: 0.001, calls: 1 },
      sessionCalls: 1,
    } as never);
    const { host, cleanup } = mount();
    await flush();
    expect(host.textContent).toContain('palette' satisfies string);
    cleanup();
  });
});
