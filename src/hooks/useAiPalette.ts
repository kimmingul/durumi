import { useCallback, useState } from 'react';
import type { RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { currentParagraph } from '../editor/paragraphContext';

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
    const [hasA, hasO] = await Promise.all([
      window.api.aiHasKey('anthropic'),
      window.api.aiHasKey('openai-compatible'),
    ]);
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
