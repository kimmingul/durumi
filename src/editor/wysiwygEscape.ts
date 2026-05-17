import { EditorSelection, EditorState, Extension, Transaction } from '@codemirror/state';
import { currentEditMode } from './editMode';

/**
 * v0.1.12 — WYSIWYG-mode markdown escape filter.
 *
 * In WYSIWYG mode the editor should feel like MS Word: typing `#` produces
 * the character `#`, not a heading. Typing `*` produces `*`, not italics.
 * Formatting only comes from the toolbar / keyboard shortcuts.
 *
 * Implementation: a `transactionFilter` that intercepts user-typed single
 * characters when the editor is in WYSIWYG mode and rewrites them with a
 * backslash escape — `#` → `\#`, `*` → `\*`, etc. The markdown parser
 * then treats them as literal, so no heading / emphasis / blockquote
 * decoration fires. The companion `wysiwygMarkers.ts` plugin hides the
 * `\` from view so users still see clean text.
 *
 * Programmatic dispatches (toolbar Bold button, Style dropdown, macros,
 * insertCitationAtCaret, etc.) do NOT set `userEvent: 'input.type'` and
 * therefore bypass this filter — their raw `#`, `**`, `[@key]` insertions
 * remain unescaped and produce real formatting. That's the boundary
 * between "user typed it" (literal) and "the program inserted it"
 * (formatted).
 *
 * Citation autocomplete is intentionally not exempted: in WYSIWYG mode the
 * user uses the toolbar Citation button. The cite palette dispatches
 * programmatically, so `[@key]` lands unescaped.
 *
 * Typora / Markdown source modes are NOT affected — the filter no-ops
 * when `currentEditMode(state) !== 'wysiwyg'`.
 */

/**
 * Markdown special chars escaped on every user keystroke.
 *
 * v0.2.20 — `[` and `]` REMOVED from this set. Rationale:
 *
 * 1. v0.2.19 added inline-link interactivity (hover tooltip, click-to-open,
 *    "Edit" affordance). The implementation hangs off the lezer `Link`
 *    node + the `.cm-md-link` mark decoration, both of which only fire
 *    when the parser sees real `[text](url)` syntax. Escaping the
 *    brackets to `\[` / `\]` made the parser emit `Escape` nodes instead,
 *    so a user who TYPED `[click](https://example.com)` in Document mode
 *    never got a clickable link (only programmatic toolbar insertion did).
 *    User feedback: "문서모드에서 마우스 커서를 링크에 올려놓았을 때
 *    툴팁이 안 보여요" → root cause.
 *
 * 2. The literal-display promise of WYSIWYG mode is preserved for
 *    shortcut links `[Your Name]`: with brackets unescaped the lezer
 *    parser produces a `Link` node without a `URL` child, and both
 *    `linkDecoration` (since v0.2.20) and `linkInteract.findLinkAt`
 *    self-gate on `linkHasUrl` — no styling, no tooltip, brackets stay
 *    visible. Footnote refs `[^foo]` and citations `[@key]` follow the
 *    same shape (Link node without URL); the citation/footnote
 *    decorations apply their own marking on top, unchanged.
 *
 * 3. Side-benefit: user-typed images `![alt](src)` now also parse as
 *    real images in Document mode. Previously the trailing `[` was
 *    escaped and the construct stayed literal — the v0.2.19 test at
 *    `wysiwygEscape.test.ts:75` documented that gap explicitly.
 *
 * Headings / emphasis / blockquote / code / strikethrough escapes are
 * unchanged — those are typed-source formatting triggers users do NOT
 * want in WYSIWYG, and there is no interactivity hanging off them.
 */
const ALWAYS_ESCAPE: ReadonlySet<string> = new Set([
  '#', '>', '<', '*', '_', '`', '~',
]);

/** Chars escaped only when typed at the start of a line (after optional whitespace). */
const ESCAPE_AT_LINE_START: ReadonlySet<string> = new Set(['-', '+']);

const LINE_START_WHITESPACE_RE = /^\s*$/;
const DIGITS_AT_LINE_START_RE = /^\s*\d+$/;

/**
 * Pure function exposed for tests. Returns the replacement text for a
 * single typed character at `pos`, or the original char when no escape is
 * needed.
 */
export function escapeMarkdownChar(
  ch: string,
  state: EditorState,
  pos: number,
): string {
  if (ch.length !== 1) return ch;
  if (ALWAYS_ESCAPE.has(ch)) return '\\' + ch;
  if (ESCAPE_AT_LINE_START.has(ch)) {
    const line = state.doc.lineAt(pos);
    const before = state.doc.sliceString(line.from, pos);
    if (LINE_START_WHITESPACE_RE.test(before)) return '\\' + ch;
    return ch;
  }
  if (ch === '.') {
    const line = state.doc.lineAt(pos);
    const before = state.doc.sliceString(line.from, pos);
    if (DIGITS_AT_LINE_START_RE.test(before)) return '\\' + ch;
    return ch;
  }
  return ch;
}

export function wysiwygEscapeFilter(): Extension {
  return EditorState.transactionFilter.of((tr) => {
    const mode = currentEditMode(tr.startState);
    if (mode !== 'wysiwyg') {
      if (DIAG && !tr.changes.empty) {
        // eslint-disable-next-line no-console
        console.warn('[wysiwygEscape] skip — mode is', mode);
      }
      return tr;
    }
    // Match the broad `input.type` family (descendant-aware) so we catch
    // every text-input path CodeMirror surfaces — straight typing,
    // accented-input dead keys, etc. We then skip:
    //  - our own re-emitted `input.type.wysiwyg-escape` (loop guard)
    //  - autoPair's `input.type.pair` (it already produced a programmatic
    //    multi-char wrap; further escape would corrupt it)
    //  - IME composition (uses `input.compose`, NOT `input.type`)
    if (!tr.isUserEvent('input.type')) {
      if (DIAG && !tr.changes.empty) {
        // eslint-disable-next-line no-console
        console.warn(
          '[wysiwygEscape] skip — not input.type, userEvent =',
          tr.annotation(Transaction.userEvent),
          '| changes:',
          dumpChanges(tr),
        );
      }
      return tr;
    }
    const ev = tr.annotation(Transaction.userEvent);
    if (ev === 'input.type.wysiwyg-escape' || ev === 'input.type.pair') return tr;
    if (tr.changes.empty) return tr;
    // Multi-cursor + escape gets tangled with position arithmetic; in that
    // edge case we bail to the unmodified transaction.
    if (tr.startState.selection.ranges.length !== 1) return tr;

    let mutated = false;
    const specs: { from: number; to: number; insert: string }[] = [];
    let bail = false;

    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      if (bail) return;
      if (inserted.length !== 1) {
        // Multi-char insertions (paste, drop, macro expansion) — leave alone.
        if (DIAG) {
          // eslint-disable-next-line no-console
          console.warn(
            '[wysiwygEscape] skip multi-char insert:',
            JSON.stringify(inserted.sliceString(0)),
          );
        }
        bail = true;
        return;
      }
      const ch = inserted.sliceString(0);
      if (ch.length !== 1) {
        bail = true;
        return;
      }
      const out = escapeMarkdownChar(ch, tr.startState, fromA);
      if (DIAG) {
        // eslint-disable-next-line no-console
        console.warn('[wysiwygEscape] in =', JSON.stringify(ch), '→ out =', JSON.stringify(out));
      }
      if (out !== ch) mutated = true;
      specs.push({ from: fromA, to: toA, insert: out });
    });

    if (bail || !mutated || specs.length === 0) return tr;

    const last = specs[specs.length - 1];
    if (!last) return tr;
    const caret = last.from + last.insert.length;
    return {
      changes: specs,
      selection: EditorSelection.cursor(caret),
      scrollIntoView: true,
      userEvent: 'input.type.wysiwyg-escape',
    };
  });
}

// Diagnostic toggle. Flip to `true` only when diagnosing why an escape
// didn't fire — every filtered transaction will emit a `console.warn`
// trace. Leaving `false` in production keeps the console clean; the
// runtime cost is one boolean check per transaction.
const DIAG = false;

function dumpChanges(tr: import('@codemirror/state').Transaction): string {
  const parts: string[] = [];
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    parts.push(`{${fromA}->${toA} insert=${JSON.stringify(inserted.sliceString(0))}}`);
  });
  return parts.join(' ');
}
