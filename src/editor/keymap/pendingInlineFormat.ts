import {
  StateField,
  StateEffect,
  EditorState,
  EditorSelection,
  Transaction,
  type Extension,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { setEditMode } from '../editMode';
import { toggleWrap } from './toggleWrap';

/**
 * v0.2.29 — Word-style pending inline format ("type-ahead format").
 *
 * Background: v0.2.28's toolbar Bold with empty selection inserted
 * `****` which CommonMark parsed as a ThematicBreak (HorizontalRule).
 * The `<hr>` block widget then disrupted caret placement and IME
 * composition, producing broken Korean source like `**ㅏㄴ글볼드**ㅎ`.
 *
 * v0.2.29 replaces that with Word/Docs/Pages/Notion-style "pending
 * format" UX:
 *   1. Empty selection + toolbar Bold (or Cmd+B) sets the format as
 *      "pending" — no doc change, toolbar button visually highlights.
 *   2. The next user-typed character is wrapped:
 *      - ASCII (`input.type`): the transactionFilter rewrites the
 *        first typed-char transaction to wrap as `${before}h${after}`,
 *        caret positioned INSIDE the new span so further typing
 *        continues inside.
 *      - IME composition: the wrap is DEFERRED to `compositionend`
 *        (via a DOM event handler). Rewriting during composition
 *        would desync CodeMirror's compose-range tracking — that was
 *        the v0.2.28 bug AND a regression in an earlier v0.2.29
 *        attempt that rewrote on `input.compose`. The wrap happens
 *        ONCE after the IME finalizes, around the full composed text.
 *   3. Pending state clears as soon as the wrap is applied (ASCII)
 *      or `compositionend` finishes (IME), OR on caret movement
 *      (selection change without doc change), OR on mode switch.
 *   4. Selection + Bold still wraps the selection as before
 *      (`toggleWrap` path) — pending state is only set when selection
 *      is empty.
 *
 * For v0.2.29 hotfix scope, only ONE format can be pending at a time;
 * toggling a different format while one is pending replaces the
 * previous. Multi-format stacking (Cmd+B then Cmd+I → bold+italic
 * pending) is a v0.2.30 enhancement candidate.
 */

export type InlineFormat = 'bold' | 'italic' | 'strike' | 'code' | 'sub' | 'sup';

interface FormatMarkers {
  before: string;
  after: string;
}

const FORMAT_MARKERS: Record<InlineFormat, FormatMarkers> = {
  bold: { before: '**', after: '**' },
  italic: { before: '*', after: '*' },
  strike: { before: '~~', after: '~~' },
  code: { before: '`', after: '`' },
  sub: { before: '<sub>', after: '</sub>' },
  sup: { before: '<sup>', after: '</sup>' },
};

/**
 * Toggle one format in/out of the pending slot. Toggling a different
 * format while another is pending REPLACES the previous one (single
 * pending slot in v0.2.29).
 */
export const togglePendingInlineFormat = StateEffect.define<InlineFormat>();

/** Force-clear the pending format (e.g., on Esc, applied-wrap, etc.). */
export const clearPendingInlineFormat = StateEffect.define<null>();

/**
 * The currently pending format, or `null` if none. Read this from the
 * toolbar React component to drive the "pressed" visual indicator.
 */
export const pendingInlineFormatField = StateField.define<InlineFormat | null>({
  create() {
    return null;
  },
  update(value, tr) {
    let pending = value;
    let hadExplicitEffect = false;
    for (const effect of tr.effects) {
      if (effect.is(togglePendingInlineFormat)) {
        hadExplicitEffect = true;
        pending = pending === effect.value ? null : effect.value;
      } else if (effect.is(clearPendingInlineFormat)) {
        hadExplicitEffect = true;
        pending = null;
      } else if (effect.is(setEditMode)) {
        pending = null;
      }
    }
    if (hadExplicitEffect) return pending;
    // Caret moved without doc change → clear (Word-style).
    // During IME composition transactions are docChanged && selectionSet,
    // so this branch does NOT fire mid-composition.
    if (tr.selection && !tr.docChanged) return null;
    return pending;
  },
});

function getPending(state: EditorState): InlineFormat | null {
  return state.field(pendingInlineFormatField, false) ?? null;
}

/**
 * Read the currently pending format. Used by the React toolbar to
 * highlight the active button.
 */
export function getPendingFormat(state: EditorState): InlineFormat | null {
  return getPending(state);
}

/**
 * TransactionFilter that wraps the first ASCII / paste input after a
 * pending format toggle. Only matches `input.type`, NOT `input.compose`
 * — IME composition is handled by the `compositionend` DOM listener
 * (see `composeWrapPlugin` below) to avoid mid-composition doc
 * rewrites that would desync CodeMirror's compose-range tracking.
 */
function pendingFormatFilter(): Extension {
  return EditorState.transactionFilter.of((tr) => {
    const pending = getPending(tr.startState);
    if (!pending) return tr;

    if (!tr.isUserEvent('input.type')) return tr;

    // Loop guard.
    const ev = tr.annotation(Transaction.userEvent);
    if (ev === 'input.type.pending-format') return tr;

    if (tr.changes.empty) return tr;

    // Single-cursor only.
    if (tr.startState.selection.ranges.length !== 1) return tr;

    const { before, after } = FORMAT_MARKERS[pending];

    interface RewriteSpec {
      from: number;
      to: number;
      insert: string;
    }
    const specs: RewriteSpec[] = [];
    let bail = false;
    let caretEnd: number | null = null;

    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      if (bail) return;
      if (inserted.length === 0) {
        bail = true;
        return;
      }
      const insertedText = inserted.sliceString(0);
      specs.push({ from: fromA, to: toA, insert: before + insertedText + after });
      caretEnd = fromA + before.length + insertedText.length;
    });

    if (bail || specs.length === 0 || caretEnd === null) return tr;

    return {
      changes: specs,
      selection: EditorSelection.cursor(caretEnd),
      scrollIntoView: true,
      userEvent: 'input.type.pending-format',
      effects: clearPendingInlineFormat.of(null),
    };
  });
}

/**
 * IME composition wrap path. CodeMirror does not let us safely rewrite
 * `input.compose` transactions without breaking the IME's tracking of
 * the composing range. Instead we listen for the DOM-level
 * `compositionstart` and `compositionend` events:
 *
 *   - On compositionstart with a pending format set, snapshot
 *     `{ pending, startPos }`. The pending state STAYS set (the
 *     transactionFilter no-ops on `input.compose`).
 *   - As composition flows, `input.compose` transactions insert /
 *     replace the composing text inside the doc; pending state is
 *     preserved because every such transaction has both
 *     `docChanged` and `selection`.
 *   - On compositionend, if the snapshot was non-null, wrap the
 *     just-composed text (from startPos to current caret) in the
 *     pending format's markers and clear pending.
 *
 * Module-level state suffices for Durumi (single editor view).
 * Multi-view support is a v0.2.30+ refinement.
 */
let composingSnapshot: { pending: InlineFormat; startPos: number } | null = null;

const composeWrapHandlers = EditorView.domEventHandlers({
  compositionstart(_event, view) {
    const pending = getPending(view.state);
    if (!pending) {
      composingSnapshot = null;
      return;
    }
    composingSnapshot = { pending, startPos: view.state.selection.main.head };
  },
  compositionend(_event, view) {
    if (!composingSnapshot) return;
    const { pending, startPos } = composingSnapshot;
    composingSnapshot = null;
    const endPos = view.state.selection.main.head;
    if (endPos <= startPos) return; // nothing composed (or caret stayed put)
    const composedText = view.state.sliceDoc(startPos, endPos);
    if (composedText.length === 0) return;
    const { before, after } = FORMAT_MARKERS[pending];
    view.dispatch({
      changes: { from: startPos, to: endPos, insert: before + composedText + after },
      selection: EditorSelection.cursor(startPos + before.length + composedText.length),
      effects: clearPendingInlineFormat.of(null),
      userEvent: 'input.compose.pending-format-wrap',
    });
  },
});

export function pendingInlineFormatExtension(): Extension {
  return [pendingInlineFormatField, pendingFormatFilter(), composeWrapHandlers];
}

/**
 * High-level dispatcher used by toolbar / shortcut / menu IPC. Encapsulates
 * the Word-style decision:
 *
 *   - Selection is empty → set the format as pending (next-typed text
 *     wraps via the transactionFilter for ASCII or compositionend for IME).
 *   - Selection is non-empty → call `toggleWrap` to wrap/unwrap the
 *     existing selection synchronously (legacy behaviour, unchanged).
 *
 * Returns true if the dispatch happened.
 */
export function applyInlineFormat(view: EditorView, format: InlineFormat): boolean {
  const sel = view.state.selection.main;
  if (sel.empty) {
    view.dispatch({ effects: togglePendingInlineFormat.of(format) });
    return true;
  }
  const { before, after } = FORMAT_MARKERS[format];
  return toggleWrap(view, before, after);
}

/**
 * Test helper — reset the module-level composing snapshot between
 * unit tests. Production code never needs this.
 */
export function __resetComposingSnapshotForTest(): void {
  composingSnapshot = null;
}
