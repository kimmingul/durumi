import type { MarkdownConfig } from '@lezer/markdown';
import { tags as t } from '@lezer/highlight';

const EQUAL = 61;     // '='
const TILDE = 126;    // '~'
const CARET = 94;     // '^'
const SPACE = 32;
const TAB = 9;
const NEWLINE = 10;

function isWhitespace(code: number): boolean {
  return code === SPACE || code === TAB || code === NEWLINE;
}

/**
 * Recognises Typora's inline highlight (`==text==`), subscript (`~text~`),
 * and superscript (`^text^`) syntaxes. Each is parsed into its own node so
 * decorations and downstream tooling can target them independently.
 *
 * Subscript uses a single `~` to avoid conflict with GFM strikethrough
 * (`~~text~~`), which is parsed by `@lezer/markdown`'s GFM extension first.
 * For `^`, the single-`^` form is conventional Pandoc/MultiMarkdown.
 *
 * Inner content cannot contain whitespace or the same delimiter again,
 * matching the documented behaviour of these MultiMarkdown-derived syntaxes.
 */
export const InlineExtrasExtension: MarkdownConfig = {
  defineNodes: [
    { name: 'Highlight', style: t.emphasis },
    { name: 'HighlightMark', style: t.processingInstruction },
    { name: 'Subscript', style: t.special(t.string) },
    { name: 'SubscriptMark', style: t.processingInstruction },
    { name: 'Superscript', style: t.special(t.string) },
    { name: 'SuperscriptMark', style: t.processingInstruction },
  ],
  parseInline: [
    {
      name: 'Highlight',
      parse(cx, next, pos) {
        if (next !== EQUAL) return -1;
        if (cx.char(pos + 1) !== EQUAL) return -1;
        // Find closing `==` on the same logical line.
        let end = pos + 2;
        while (end < cx.end - 1) {
          const ch = cx.char(end);
          if (ch === NEWLINE) return -1;
          if (ch === EQUAL && cx.char(end + 1) === EQUAL) {
            const inner = cx.slice(pos + 2, end);
            if (inner.length === 0) return -1;
            const open = cx.elt('HighlightMark', pos, pos + 2);
            const close = cx.elt('HighlightMark', end, end + 2);
            return cx.addElement(cx.elt('Highlight', pos, end + 2, [open, close]));
          }
          end++;
        }
        return -1;
      },
      before: 'Emphasis',
    },
    {
      name: 'Subscript',
      parse(cx, next, pos) {
        if (next !== TILDE) return -1;
        // `~~` belongs to GFM strikethrough; bail out and let it run.
        if (cx.char(pos + 1) === TILDE) return -1;
        // The character right after `~` must be non-whitespace; closing `~`
        // must precede non-whitespace too.
        const after = cx.char(pos + 1);
        if (isWhitespace(after) || after < 0) return -1;
        let end = pos + 1;
        while (end < cx.end) {
          const ch = cx.char(end);
          if (ch === NEWLINE) return -1;
          if (isWhitespace(ch)) return -1;
          if (ch === TILDE) {
            const inner = cx.slice(pos + 1, end);
            if (inner.length === 0) return -1;
            const open = cx.elt('SubscriptMark', pos, pos + 1);
            const close = cx.elt('SubscriptMark', end, end + 1);
            return cx.addElement(cx.elt('Subscript', pos, end + 1, [open, close]));
          }
          end++;
        }
        return -1;
      },
      // Run before the strikethrough parser so single-tilde wins when it can.
      before: 'Strikethrough',
    },
    {
      name: 'Superscript',
      parse(cx, next, pos) {
        if (next !== CARET) return -1;
        const after = cx.char(pos + 1);
        if (isWhitespace(after) || after < 0) return -1;
        let end = pos + 1;
        while (end < cx.end) {
          const ch = cx.char(end);
          if (ch === NEWLINE) return -1;
          if (isWhitespace(ch)) return -1;
          if (ch === CARET) {
            const inner = cx.slice(pos + 1, end);
            if (inner.length === 0) return -1;
            const open = cx.elt('SuperscriptMark', pos, pos + 1);
            const close = cx.elt('SuperscriptMark', end, end + 1);
            return cx.addElement(cx.elt('Superscript', pos, end + 1, [open, close]));
          }
          end++;
        }
        return -1;
      },
    },
  ],
};
