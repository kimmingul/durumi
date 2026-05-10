import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  ghostTextExtension,
  _resetGhostSessionCounter,
  _peekGhostSessionCounter,
} from '../../src/editor/ai/ghostText';
import { useAiUsageStore } from '../../src/store/aiUsageStore';

// Minimal test bench: build a real EditorView with the extension wired
// against fakeable refs; manipulate caret + doc and let the idle timer
// fire; assert what the extension does.

const longParagraph =
  'A long enough paragraph that satisfies the minimum-character gate. The patient improved over the course of the trial.';

interface BenchOptions {
  ghostTextEnabled?: boolean;
  cap?: number;
  hasKey?: boolean;
  chatResult?: { ok: true; text: string; inputTokens: number; outputTokens: number } | { ok: false; code: string; message: string };
}

async function flush(ms = 50): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
  // Drain any microtasks queued by `await window.api.*` mocks resolving.
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function bench(opts: BenchOptions = {}) {
  const chat = vi.fn().mockResolvedValue(
    opts.chatResult ?? {
      ok: true,
      text: 'This continuation describes the next finding.',
      inputTokens: 120,
      outputTokens: 14,
    },
  );
  const refs = {
    prefs: vi.fn().mockResolvedValue({
      ai: {
        provider: 'anthropic',
        anthropicKey: 'enc:x',
        anthropicModel: 'claude-sonnet-4-6',
        openaiKey: '',
        openaiBaseUrl: 'https://api.openai.com',
        openaiModel: 'gpt-4o-mini',
        ghostTextEnabled: opts.ghostTextEnabled ?? true,
        ghostTextIdleMs: 0,
        ghostTextSessionCap: opts.cap ?? 100,
      },
    }),
    hasKey: vi.fn().mockResolvedValue(opts.hasKey ?? true),
    chat,
  };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const state = EditorState.create({
    doc: longParagraph,
    selection: EditorSelection.single(longParagraph.length),
    extensions: [ghostTextExtension({ refs, debounceMs: 5 })],
  });
  const view = new EditorView({ state, parent: host });
  // Mount the extension with a 5ms debounce so tests don't pay the 800ms
  // production wait. The branching logic inside maybeTrigger is what we
  // want to exercise; the timer threshold is decoupled.
  return {
    view,
    chat,
    refs,
    cleanup: () => { view.destroy(); host.remove(); },
  };
}

beforeEach(() => {
  _resetGhostSessionCounter();
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

describe('ghost-text extension', () => {
  it('does not fire when the toggle is off', async () => {
    const b = bench({ ghostTextEnabled: false });
    b.view.dispatch({ changes: { from: longParagraph.length, insert: ' ' } });
    await flush(60);
    expect(b.chat).not.toHaveBeenCalled();
    b.cleanup();
  });

  it('does not fire when no provider key is configured', async () => {
    const b = bench({ hasKey: false });
    b.view.dispatch({ changes: { from: longParagraph.length, insert: ' ' } });
    await flush(60);
    expect(b.chat).not.toHaveBeenCalled();
    b.cleanup();
  });

  it('fires once after idle and records token usage', async () => {
    const b = bench();
    const newLen = longParagraph.length + 6;
    b.view.dispatch({
      changes: { from: longParagraph.length, insert: ' more.' },
      selection: { anchor: newLen },
    });
    await flush(60);
    expect(b.chat).toHaveBeenCalledTimes(1);
    expect(useAiUsageStore.getState().bySource.ghostText.calls).toBe(1);
    b.cleanup();
  });

  it('respects the per-session cap', async () => {
    _resetGhostSessionCounter();
    // Run 3 separate trigger cycles with a cap of 1.
    const b = bench({ cap: 1 });
    for (let i = 0; i < 3; i++) {
      const tail = ` part ${i}.`;
      const docLen = b.view.state.doc.length;
      b.view.dispatch({
        changes: { from: docLen, insert: tail },
        selection: { anchor: docLen + tail.length },
      });
      await flush(60);
    }
    expect(b.chat).toHaveBeenCalledTimes(1);
    expect(_peekGhostSessionCounter()).toBe(1);
    b.cleanup();
  });

  it('skips the trigger when the model returns NO_COMPLETION', async () => {
    const b = bench({
      chatResult: { ok: true, text: 'NO_COMPLETION', inputTokens: 5, outputTokens: 1 },
    });
    const newLen = longParagraph.length + 2;
    b.view.dispatch({
      changes: { from: longParagraph.length, insert: ' x' },
      selection: { anchor: newLen },
    });
    await flush(60);
    // The decoration field should remain empty.
    const ghostHas = b.view.dom.querySelector('.cm-ai-ghost-text');
    expect(ghostHas).toBeNull();
    b.cleanup();
  });

  it('does not trigger when caret is mid-paragraph', async () => {
    const b = bench();
    // Move caret to position 5 (middle of paragraph, end-of-line check fails).
    b.view.dispatch({
      selection: EditorSelection.single(5),
    });
    await flush(60);
    expect(b.chat).not.toHaveBeenCalled();
    b.cleanup();
  });

  it('does not trigger for short paragraphs', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const refs = {
      prefs: vi.fn().mockResolvedValue({
        ai: {
          provider: 'anthropic',
          anthropicKey: 'enc:x',
          anthropicModel: 'claude-sonnet-4-6',
          openaiKey: '',
          openaiBaseUrl: 'https://api.openai.com',
          openaiModel: 'gpt-4o-mini',
          ghostTextEnabled: true,
          ghostTextIdleMs: 0,
          ghostTextSessionCap: 100,
        },
      }),
      hasKey: vi.fn().mockResolvedValue(true),
      chat: vi.fn(),
    };
    const view = new EditorView({
      state: EditorState.create({
        doc: 'Too short.',
        selection: EditorSelection.single(10),
        extensions: [ghostTextExtension({ refs, debounceMs: 5 })],
      }),
      parent: host,
    });
    view.dispatch({ changes: { from: 10, insert: ' add' } });
    await flush(60);
    expect(refs.chat).not.toHaveBeenCalled();
    view.destroy();
    host.remove();
  });
});
