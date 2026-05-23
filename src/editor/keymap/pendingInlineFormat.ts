import {
  StateField,
  StateEffect,
  EditorState,
  EditorSelection,
  Transaction,
  type Extension,
} from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
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
 *   2. The next user-typed character (ASCII OR IME composition first
 *      event) is wrapped: `h` becomes `**h**` with caret positioned
 *      INSIDE the span (between `h` and the closing `**`), so further
 *      typing continues inside the bold span naturally.
 *   3. Pending state clears as soon as the wrap is applied, OR on
 *      caret movement (selection change without doc change), OR on
 *      mode switch.
 *   4. Selection + Bold still wraps the selection as before
 *      (`toggleWrap` path) — pending state is only set when selection
 *      is empty.
 *
 * For v0.2.29 hotfix scope, only ONE format can be pending at a time;
 * toggling a different format while one is pending replaces the
 * previous. Multi-format stacking (Cmd+B then Cmd+I → bold+italic
 * pending) is a v0.2.30 enhancement candidate.
 *
 * IME safety: the transactionFilter intercepts BOTH `input.type`
 * (ASCII keystrokes) and `input.compose` (IME composition events).
 * Wrapping happens on the FIRST event — for Korean IME, that's the
 * first composing syllable (`ㅎ`), which becomes `**ㅎ**`. The
 * atomic-range facets register around the well-formed StrongEmphasis
 * node; subsequent composition updates (`ㅎ → 하 → 한`) flow inside
 * the label naturally. Verified with CDP `Input.imeSetComposition`
 * in e2e/toolbar-ime-composition.spec.ts.
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
        // Same format toggled twice → clear; different → replace.
        pending = pending === effect.value ? null : effect.value;
      } else if (effect.is(clearPendingInlineFormat)) {
        hadExplicitEffect = true;
        pending = null;
      } else if (effect.is(setEditMode)) {
        // Mode switch clears pending (Document ↔ Live ↔ Source).
        pending = null;
      }
    }
    if (hadExplicitEffect) return pending;
    // Caret moved without doc change → clear (Word-style).
    if (tr.selection && !tr.docChanged) return null;
    return pending;
  },
});

function getPending(state: EditorState): InlineFormat | null {
  return state.field(pendingInlineFormatField, false) ?? null;
}

/**
 * Dispatcher used by toolbar/keymap/menu when the user invokes an
 * inline-format command with an EMPTY selection. Pure helper —
 * caller decides whether to use this path vs falling through to
 * `toggleWrap` (which handles non-empty selections).
 */
export function setPendingFormat(view: { dispatch: (spec: object) => void }, format: InlineFormat): void {
  view.dispatch({ effects: togglePendingInlineFormat.of(format) });
}

export function clearPendingFormat(view: { dispatch: (spec: object) => void }): void {
  view.dispatch({ effects: clearPendingInlineFormat.of(null) });
}

/**
 * Read the currently pending format. Used by the React toolbar to
 * highlight the active button.
 */
export function getPendingFormat(state: EditorState): InlineFormat | null {
  return getPending(state);
}

/**
 * TransactionFilter that wraps the first user-typed text after a
 * pending format toggle. Handles BOTH `input.type` (ASCII / paste)
 * AND `input.compose` (IME composition).
 *
 * Loop guard: our own re-emitted transactions carry the
 * `input.type.pending-format` / `input.compose.pending-format`
 * userEvent and are skipped.
 */
function pendingFormatFilter(): Extension {
  return EditorState.transactionFilter.of((tr) => {
    const pending = getPending(tr.startState);
    if (!pending) return tr;

    // Only intercept user text-input transactions.
    const isType = tr.isUserEvent('input.type');
    const isCompose = tr.isUserEvent('input.compose');
    if (!isType && !isCompose) return tr;

    // Loop guard.
    const ev = tr.annotation(Transaction.userEvent);
    if (ev === 'input.type.pending-format' || ev === 'input.compose.pending-format') {
      return tr;
    }

    if (tr.changes.empty) return tr;

    // Single-cursor only — multi-cursor + wrap gets tangled.
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
        // Pure deletion under a pending state shouldn't wrap — bail.
        bail = true;
        return;
      }
      const insertedText = inserted.sliceString(0);
      specs.push({ from: fromA, to: toA, insert: before + insertedText + after });
      // Caret lands between the inserted text and the closing marker so
      // further typing continues inside the new span.
      caretEnd = fromA + before.length + insertedText.length;
    });

    if (bail || specs.length === 0 || caretEnd === null) return tr;

    return {
      changes: specs,
      selection: EditorSelection.cursor(caretEnd),
      scrollIntoView: true,
      userEvent: isCompose ? 'input.compose.pending-format' : 'input.type.pending-format',
      effects: clearPendingInlineFormat.of(null),
    };
  });
}

export function pendingInlineFormatExtension(): Extension {
  return [pendingInlineFormatField, pendingFormatFilter()];
}

/**
 * High-level dispatcher used by toolbar / shortcut / menu IPC. Encapsulates
 * the Word-style decision:
 *
 *   - Selection is empty → set the format as pending (next-typed text
 *     wraps via the transactionFilter).
 *   - Selection is non-empty → call `toggleWrap` to wrap/unwrap the
 *     existing selection synchronously (legacy behaviour, unchanged).
 *
 * Returns true if the dispatch happened, false otherwise. Callers can
 * use the return as the boolean keymap-handler contract result.
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
