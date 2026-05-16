import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRef } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useAiPalette, type AiPalette } from '../../src/hooks/useAiPalette';
import { useToastStore } from '../../src/store/toastStore';

// v0.2.16 — these tests close the silent-failure mode that hid the AI
// palette in v0.2.15. The hook calls `window.api.aiHasKey(...)`; if that
// bridge method is missing or throws, the palette must still open with
// `hasKey: false` (so the empty-state copy renders) AND a user-visible
// toast must surface. Previously the Promise.all rejection was swallowed
// silently and the overlay never mounted.

interface CapturedHook {
  current: AiPalette | null;
}

function HookProbe(props: { capture: CapturedHook; view: EditorView }) {
  const viewRef = useRef<EditorView | null>(props.view);
  const palette = useAiPalette(viewRef);
  props.capture.current = palette;
  return null;
}

function buildView(doc = 'hello world'): EditorView {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.single(0, doc.length),
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const view = new EditorView({ state, parent: host });
  return view;
}

function mountHook(view: EditorView): { capture: CapturedHook; cleanup: () => void; reactRoot: Root } {
  const capture: CapturedHook = { current: null };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<HookProbe capture={capture} view={view} />);
  });
  return {
    capture,
    reactRoot: root,
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
      view.destroy();
    },
  };
}

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  useToastStore.setState({ toasts: [] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).api;
});

describe('useAiPalette', () => {
  it('opens with hasKey=true when at least one provider has a key', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = {
      aiHasKey: vi
        .fn()
        .mockImplementation((p: string) => Promise.resolve(p === 'anthropic')),
    };
    const view = buildView();
    const { capture, cleanup } = mountHook(view);
    await act(async () => {
      await capture.current!.open();
    });
    expect(capture.current!.state.open).toBe(true);
    expect(capture.current!.state.hasKey).toBe(true);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    cleanup();
  });

  it('opens with hasKey=false when neither provider has a key (no toast)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = {
      aiHasKey: vi.fn().mockResolvedValue(false),
    };
    const view = buildView();
    const { capture, cleanup } = mountHook(view);
    await act(async () => {
      await capture.current!.open();
    });
    // Without a key the palette still opens — the AiCommandPalette
    // component itself shows the `ai-palette-no-key` empty state.
    // No toast: this is the expected first-run path, not an error.
    expect(capture.current!.state.open).toBe(true);
    expect(capture.current!.state.hasKey).toBe(false);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    cleanup();
  });

  it('still opens the palette + surfaces a toast when aiHasKey is missing from the bridge', async () => {
    // The exact v0.2.15 regression: preload didn't expose aiHasKey at all,
    // so calling it threw `TypeError: window.api.aiHasKey is not a function`
    // and the Promise.all rejection silently prevented the overlay from
    // mounting. Post-fix: we catch, log, toast, and still open.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = {}; // aiHasKey deliberately missing
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = buildView();
    const { capture, cleanup } = mountHook(view);
    await act(async () => {
      await capture.current!.open();
    });
    expect(capture.current!.state.open).toBe(true);
    expect(capture.current!.state.hasKey).toBe(false);
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.message).toMatch(/unavailable/i);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
    cleanup();
  });

  it('still opens the palette + surfaces a toast when aiHasKey throws', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = {
      aiHasKey: vi.fn().mockRejectedValue(new Error('IPC channel closed')),
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = buildView();
    const { capture, cleanup } = mountHook(view);
    await act(async () => {
      await capture.current!.open();
    });
    expect(capture.current!.state.open).toBe(true);
    expect(capture.current!.state.hasKey).toBe(false);
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.message).toMatch(/unavailable/i);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
    cleanup();
  });
});
