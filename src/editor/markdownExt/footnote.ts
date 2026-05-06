import type { MarkdownConfig } from '@lezer/markdown';
import { tags as t } from '@lezer/highlight';

const CARET = 94; // '^'
const OPEN_BRACKET = 91; // '['
const CLOSE_BRACKET = 93; // ']'
const COLON = 58; // ':'

/**
 * Lezer extension that recognises MultiMarkdown / Pandoc footnotes:
 *
 *   This is text with a reference[^id].
 *
 *   [^id]: …definition body, possibly across lines until a blank line.
 *
 * Two nodes are emitted:
 *   - `FootnoteRef`         the inline `[^id]` token.
 *   - `FootnoteDef`         the block-level `[^id]: body` definition.
 *   - `FootnoteMark`        the `[^` / `]` punctuation around the id (so
 *                           decorations can hide it like other markdown marks).
 *   - `FootnoteLabel`       the bare id text.
 *
 * The export pipeline uses `markdown-it-footnote` to produce the
 * standard HTML; this extension exists so the live editor can style
 * references and definitions correctly without lezer interpreting them
 * as plain link references.
 */
export const FootnoteExtension: MarkdownConfig = {
  defineNodes: [
    { name: 'FootnoteRef', style: t.link },
    { name: 'FootnoteDef', block: true, style: t.meta },
    { name: 'FootnoteMark', style: t.processingInstruction },
    { name: 'FootnoteLabel', style: t.labelName },
  ],
  parseInline: [
    {
      name: 'FootnoteRef',
      // Run before the default Link parser so `[^id]` is not mis-parsed as a
      // link reference label.
      before: 'Link',
      parse(cx, next, pos) {
        if (next !== OPEN_BRACKET) return -1;
        if (cx.char(pos + 1) !== CARET) return -1;
        // Scan label until ']'. Disallow whitespace and nested brackets.
        let end = pos + 2;
        while (end < cx.end) {
          const ch = cx.char(end);
          if (ch === CLOSE_BRACKET) break;
          if (ch === OPEN_BRACKET || ch === 32 || ch === 9 || ch === 10) return -1;
          end++;
        }
        if (end >= cx.end || cx.char(end) !== CLOSE_BRACKET) return -1;
        if (end === pos + 2) return -1; // empty label
        const labelStart = pos + 2;
        const labelEnd = end;
        const closeEnd = end + 1;
        const children = [
          cx.elt('FootnoteMark', pos, labelStart),
          cx.elt('FootnoteLabel', labelStart, labelEnd),
          cx.elt('FootnoteMark', labelEnd, closeEnd),
        ];
        return cx.addElement(cx.elt('FootnoteRef', pos, closeEnd, children));
      },
    },
  ],
  parseBlock: [
    {
      name: 'FootnoteDef',
      // Before LinkReference so `[^id]:` is not consumed as a reference def.
      before: 'LinkReference',
      parse(cx, line) {
        const text = line.text;
        // Must start at column 0 (no nested indentation handling for v1).
        if (line.pos !== 0) return false;
        if (text.charCodeAt(0) !== OPEN_BRACKET) return false;
        if (text.charCodeAt(1) !== CARET) return false;
        // Find the closing `]:` on the same line.
        let i = 2;
        while (i < text.length && text.charCodeAt(i) !== CLOSE_BRACKET) {
          const ch = text.charCodeAt(i);
          if (ch === OPEN_BRACKET || ch === 32 || ch === 9) return false;
          i++;
        }
        if (i >= text.length) return false;
        if (text.charCodeAt(i + 1) !== COLON) return false;
        const labelStart = cx.lineStart + 2;
        const labelEnd = cx.lineStart + i;
        const colonEnd = labelEnd + 2;
        const start = cx.lineStart;
        const children = [
          cx.elt('FootnoteMark', start, labelStart),
          cx.elt('FootnoteLabel', labelStart, labelEnd),
          cx.elt('FootnoteMark', labelEnd, colonEnd),
        ];
        let endPos = cx.lineStart + text.length;
        // Continuation: subsequent indented or non-blank lines belong to the
        // definition, terminated by a blank line or a top-level construct.
        while (cx.nextLine()) {
          const t2 = line.text;
          if (t2.length === 0) break; // blank line ends the definition
          // If the next line starts a new footnote definition, stop.
          if (t2.charCodeAt(0) === OPEN_BRACKET && t2.charCodeAt(1) === CARET) break;
          endPos = cx.lineStart + t2.length;
        }
        cx.addElement(cx.elt('FootnoteDef', start, endPos, children));
        return true;
      },
    },
  ],
};
