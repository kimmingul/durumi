import { useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { parseComments } from '@shared/comments';
import { useMemoPanelStore } from '../store/memoPanelStore';

/**
 * When the caret lands on a line that contains a memo, set the panel's
 * `focusedFrom` to that memo so the corresponding card scrolls + pulses.
 *
 * We poll the view's selection through a CodeMirror update listener — this
 * mirrors the editor's natural change cadence (one event per transaction)
 * and avoids running a setInterval. The listener is registered as a separate
 * extension via a `dispatch` after the view is ready (we can't add it after
 * `EditorState.create` from outside `MarkdownEditor.tsx`, but we can
 * subscribe via `view.dom`'s `selectionchange`-equivalent).
 *
 * Implementation: subscribe to the document's `selectionchange` event AND
 * wrap the existing `dispatch` via a tiny update-listener installed at view
 * level (we use a `StateEffect`-free approach by listening to the DOM).
 */
export function useMemoCaretFocus(view: EditorView | null, content: string): void {
  const setFocusedFrom = useMemoPanelStore((s) => s.setFocusedFrom);
  const lastLineRef = useRef<number | null>(null);

  useEffect(() => {
    if (!view) return;
    const compute = () => {
      const head = view.state.selection.main.head;
      if (head < 0 || head > view.state.doc.length) return;
      const line = view.state.doc.lineAt(head).number;
      if (lastLineRef.current === line) return;
      lastLineRef.current = line;
      const memos = parseComments(content);
      const hit = memos.find((m) => {
        if (!m.block) return m.line === line;
        // Block memo spans multiple lines — match if the caret line falls
        // within the block range.
        const fromLine = view.state.doc.lineAt(m.from).number;
        const toLine = view.state.doc.lineAt(Math.min(m.to, view.state.doc.length)).number;
        return line >= fromLine && line <= toLine;
      });
      if (hit) setFocusedFrom(hit.from);
    };

    // Hook into view updates via a dispatched extension is intrusive; instead
    // listen for `selectionchange` on the document, plus run on every blur/
    // focus and a click.
    const onChange = () => {
      // The DOM event fires before CodeMirror has applied the new selection
      // to its state — schedule on the next microtask.
      queueMicrotask(compute);
    };
    document.addEventListener('selectionchange', onChange);
    view.dom.addEventListener('keyup', onChange);
    view.dom.addEventListener('mouseup', onChange);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      view.dom.removeEventListener('keyup', onChange);
      view.dom.removeEventListener('mouseup', onChange);
    };
  }, [view, content, setFocusedFrom]);
}
