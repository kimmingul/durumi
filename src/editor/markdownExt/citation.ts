import type { MarkdownConfig } from '@lezer/markdown';
import { tags as t } from '@lezer/highlight';

const OPEN_BRACKET = 91; // '['
const CLOSE_BRACKET = 93; // ']'
const AT = 64; // '@'
const HYPHEN = 45; // '-'

/**
 * Parses Pandoc-style citations:
 *
 *   [@smith2023]
 *   [-@smith2023]            author-suppressing form
 *   [@a; @b; @c]             grouped
 *   [@key, p. 33]            with locator suffix
 *
 * Each `@key` becomes a `CitationKey` node; the surrounding brackets and any
 * locator/separator text fall under the parent `Citation` node so live
 * decorations can replace the entire span without losing the inner key
 * children.
 *
 * Footnote references (`[^id]`) are parsed by FootnoteExtension and run
 * before this one.
 */
export const CitationExtension: MarkdownConfig = {
  defineNodes: [
    { name: 'Citation', style: t.link },
    { name: 'CitationMark', style: t.processingInstruction },
    { name: 'CitationKey', style: t.labelName },
  ],
  parseInline: [
    {
      name: 'Citation',
      // Run before Footnote/Link so `[@…]` wins. FootnoteExtension only fires
      // on `[^…]`, so the precedence is purely defensive.
      before: 'Link',
      parse(cx, next, pos) {
        if (next !== OPEN_BRACKET) return -1;
        // Reject `[^…` immediately so footnotes still work.
        if (cx.char(pos + 1) === 94) return -1;
        // The opening bracket must be followed by `@` or `-@`.
        let scan = pos + 1;
        if (cx.char(scan) === HYPHEN) scan++;
        if (cx.char(scan) !== AT) return -1;

        // Find the closing bracket on the same logical line.
        let end = pos + 1;
        while (end < cx.end) {
          const ch = cx.char(end);
          if (ch === 10) return -1; // newline
          if (ch === CLOSE_BRACKET) break;
          end++;
        }
        if (end >= cx.end || cx.char(end) !== CLOSE_BRACKET) return -1;

        const inner = cx.slice(pos + 1, end);
        const children: Array<ReturnType<typeof cx.elt>> = [
          cx.elt('CitationMark', pos, pos + 1),
        ];
        let keyCount = 0;
        let local = 0;
        const innerStart = pos + 1;
        while (local < inner.length) {
          const ch = inner.charCodeAt(local);
          if (ch === AT || (ch === HYPHEN && inner.charCodeAt(local + 1) === AT)) {
            if (ch === HYPHEN) local++;
            local++; // skip `@`
            const keyStart = innerStart + local;
            while (local < inner.length && isCitationKeyChar(inner.charCodeAt(local))) {
              local++;
            }
            const keyEnd = innerStart + local;
            if (keyEnd > keyStart) {
              children.push(cx.elt('CitationKey', keyStart, keyEnd));
              keyCount++;
            }
          } else {
            local++;
          }
        }
        children.push(cx.elt('CitationMark', end, end + 1));
        if (keyCount === 0) return -1;
        return cx.addElement(cx.elt('Citation', pos, end + 1, children));
      },
    },
  ],
};

function isCitationKeyChar(code: number): boolean {
  // Allowed: letters, digits, _ . - + : /
  return (
    (code >= 0x30 && code <= 0x39) || // 0-9
    (code >= 0x41 && code <= 0x5a) || // A-Z
    (code >= 0x61 && code <= 0x7a) || // a-z
    code === 0x5f || // _
    code === 0x2e || // .
    code === 0x2d || // -
    code === 0x2b || // +
    code === 0x3a || // :
    code === 0x2f    // /
  );
}
