import { useCallback, useState } from 'react';
import type { RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { currentParagraph } from '../editor/paragraphContext';
import { showToast } from '../store/toastStore';
import { t } from '../i18n/t';

export interface AiPaletteState {
  open: boolean;
  selection: string;
  paragraph: string;
  /** Editor offsets so accept can replace the right range. */
  from: number;
  to: number;
  hasKey: boolean;
}

export interface AiPalette {
  state: AiPaletteState;
  /**
   * Captures the current selection + paragraph + AI key availability and
   * opens the palette. No-ops when the editor isn't mounted.
   */
  open: () => Promise<void>;
  close: () => void;
  /**
   * Replaces the captured selection range with `rewritten` and moves the
   * caret to the end of the new text.
   */
  accept: (rewritten: string) => void;
}

/**
 * Owns the AI Command Palette state machine: open/close + the captured
 * selection / paragraph / range needed to apply the rewrite. The hook
 * doesn't render the palette itself — App.tsx still mounts the
 * `<AiCommandPalette>` component — but it exposes the state and the three
 * imperative actions the dialog needs.
 */
export function useAiPalette(editorViewRef: RefObject<EditorView | null>): AiPalette {
  const [state, setState] = useState<AiPaletteState>({
    open: false,
    selection: '',
    paragraph: '',
    from: 0,
    to: 0,
    hasKey: false,
  });

  const open = useCallback(async () => {
    const v = editorViewRef.current;
    if (!v) return;
    const sel = v.state.selection.main;
    const selection = v.state.sliceDoc(sel.from, sel.to);
    const para = currentParagraph(v.state);
    // v0.2.16 — wrap the bridge calls in try/catch so a missing or throwing
    // preload method (the exact failure mode that hid the palette in v0.2.15
    // when `aiHasKey` was unexposed) surfaces as a visible toast + a console
    // error instead of an unhandled rejection that prevents the overlay from
    // ever mounting. The palette still opens — gated as if no key were
    // configured — so the user sees the "configure key" empty state and can
    // act on the toast.
    let hasA = false;
    let hasO = false;
    try {
      [hasA, hasO] = await Promise.all([
        window.api.aiHasKey('anthropic'),
        window.api.aiHasKey('openai-compatible'),
      ]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[useAiPalette] aiHasKey bridge failed:', err);
      showToast({ message: t('ai.palette.bridgeUnavailable'), ttlMs: 8000 });
    }
    setState({
      open: true,
      selection,
      paragraph: para?.text ?? selection,
      from: sel.from,
      to: sel.to,
      hasKey: hasA || hasO,
    });
  }, [editorViewRef]);

  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  const accept = useCallback(
    (rewritten: string) => {
      const v = editorViewRef.current;
      if (!v) return;
      v.dispatch({
        changes: { from: state.from, to: state.to, insert: rewritten },
        selection: { anchor: state.from + rewritten.length },
      });
      v.focus();
    },
    [editorViewRef, state.from, state.to],
  );

  return { state, open, close, accept };
}
