import { EditorSelection, EditorState, Extension } from '@codemirror/state';
import { currentEditMode } from '../editMode';

const PAIRS_FULL: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '<': '>',
  '"': '"',
  "'": "'",
  '`': '`',
  '*': '*',
  '_': '_',
};

// Wrap-only chars: when the user selects text and types one of these, wrap
// it. Pressing the key with no selection inserts a single character (no
// auto-close). Mirrors Typora's documented behaviour for `~`, `=`, `^`, `$`.
const WRAP_ONLY: Record<string, string> = {
  '~': '~',
  '=': '=',
  '^': '^',
  '$': '$',
};

const ALL_KEYS = new Set([...Object.keys(PAIRS_FULL), ...Object.keys(WRAP_ONLY)]);

/**
 * v0.1.12 — in WYSIWYG mode, the WYSIWYG escape filter escapes user-typed
 * markdown markers character-by-character. We must NOT let autoPair
 * pre-empt those keys (otherwise `*` would auto-wrap as `**|**` and the
 * escape filter would see no plain insertion to handle). Generic
 * non-markdown pairs (`(`, `{`, `<`, `"`, `'`) keep working.
 *
 * v0.2.20 — `[` removed from this set. The escape filter no longer
 * touches brackets (so typed `[text](url)` can parse as a real inline
 * Link and the v0.2.19 hover tooltip + click + right-click menu fire).
 * With escape out of the picture, autoPair can pair `[` → `[]` in
 * WYSIWYG mode just like in Typora — which is the friendlier UX for
 * typed links: bracket opens with auto-close, type label, Right-arrow
 * past the `]`, then `(` opens the URL pair the same way. The
 * autoPair-induced caret juggling that existed before in Typora mode
 * is now identical in WYSIWYG mode (i.e. no regression in either).
 */
const MARKDOWN_PAIR_KEYS: ReadonlySet<string> = new Set([
  '*', '_', '`', '~', '=', '^', '$',
]);

/**
 * Wraps selected text in markdown pairs, and inserts closing pairs for
 * conventional pairs (brackets, quotes, asterisks, underscores, backticks).
 *
 * Implemented via a transaction filter so it composes cleanly with history,
 * IME, paste, and other CodeMirror inputs.
 */
export function autoPair(): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.isUserEvent('input.type') && !tr.isUserEvent('input')) return tr;
    if (tr.changes.empty) return tr;
    const wysiwyg = currentEditMode(tr.startState) === 'wysiwyg';

    interface Insertion {
      from: number;
      to: number;
      ch: string;
    }
    const insertions: Insertion[] = [];
    let bail = false;
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      if (bail) return;
      if (inserted.length !== 1) {
        bail = true;
        return;
      }
      const text = inserted.sliceString(0);
      if (text.length !== 1) {
        bail = true;
        return;
      }
      if (!ALL_KEYS.has(text)) {
        bail = true;
        return;
      }
      // In WYSIWYG mode, let markdown markers flow through to the escape
      // filter unmodified so they get backslash-escaped instead of paired.
      if (wysiwyg && MARKDOWN_PAIR_KEYS.has(text)) {
        bail = true;
        return;
      }
      insertions.push({ from: fromA, to: toA, ch: text });
    });
    if (bail || insertions.length === 0) return tr;
    // Multi-cursor + auto-pair quickly turns into position-arithmetic salad;
    // fall back to the unmodified transaction in that case (rare in practice).
    if (insertions.length !== 1) return tr;
    if (tr.startState.selection.ranges.length !== 1) return tr;

    const newChanges: { from: number; to: number; insert: string }[] = [];
    const newSelections: { anchor: number; head: number }[] = [];
    for (let i = 0; i < insertions.length; i++) {
      const ins = insertions[i];
      const sel = tr.startState.selection.ranges[i];
      if (!ins || !sel) return tr;
      const ch = ins.ch;
      const closing = PAIRS_FULL[ch] ?? WRAP_ONLY[ch];
      const isFullPair = ch in PAIRS_FULL;
      const isWrapping = sel.from !== sel.to && ins.from === sel.from && ins.to === sel.to;
      if (isWrapping) {
        const inner = tr.startState.doc.sliceString(sel.from, sel.to);
        newChanges.push({ from: sel.from, to: sel.to, insert: ch + inner + closing });
        newSelections.push({
          anchor: sel.from + 1,
          head: sel.from + 1 + inner.length,
        });
      } else if (isFullPair && sel.empty) {
        // Insert pair, leave caret between.
        newChanges.push({ from: ins.from, to: ins.to, insert: ch + closing });
        newSelections.push({ anchor: ins.from + 1, head: ins.from + 1 });
      } else {
        // Wrap-only key with empty selection, or selection that's not the
        // exact change range: fall back to the original transaction.
        return tr;
      }
    }

    const ranges = newSelections.map((r) => EditorSelection.range(r.anchor, r.head));
    return {
      changes: newChanges,
      selection: EditorSelection.create(ranges),
      scrollIntoView: true,
      userEvent: 'input.type.pair',
    };
  });
}
