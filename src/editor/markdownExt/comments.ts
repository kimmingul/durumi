import type { MarkdownConfig, BlockContext, Line } from '@lezer/markdown';
import { tags as t } from '@lezer/highlight';

const PERCENT = 37;   // '%'
const NEWLINE = 10;

function isAlnum(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||  // 0-9
    (code >= 65 && code <= 90) ||  // A-Z
    (code >= 97 && code <= 122)    // a-z
  );
}

const TAG_RE = /^@([A-Za-z][A-Za-z0-9_-]*):?(?:\s|$)/;

/**
 * Parser for Durumi's `%%` memo syntax. Two forms:
 *   - inline `%% text %%` on a single line (any inner content with at least
 *     one non-whitespace character; the space padding around the body is
 *     conventional and tolerated).
 *   - block `%%` on its own line, content on subsequent lines, `%%` on its
 *     own line to close.
 *
 * Mirrors `inlineExtras.ts` (Highlight `==…==`) for inline character-code
 * matching and `footnote.ts` for block parsing. The same gating rules —
 * non-empty trimmed body, word-boundary before the opener — are mirrored
 * in `shared/comments.ts` so the editor live preview agrees with the
 * export pipeline.
 *
 * Word-boundary rule: the char immediately before `%%` (when it exists)
 * must NOT be alphanumeric. This is what keeps `100%% complete %%note%%`
 * from accidentally matching `%% complete %%note%%` — we want the leading
 * `100%%` to disqualify the pair.
 */
export const CommentsExtension: MarkdownConfig = {
  defineNodes: [
    { name: 'Comment', style: t.lineComment },
    { name: 'CommentBlock', block: true, style: t.lineComment },
    { name: 'CommentMark', style: t.processingInstruction },
    { name: 'CommentTag', style: t.attributeName },
    { name: 'CommentBody', style: t.lineComment },
  ],
  parseInline: [
    {
      name: 'Comment',
      parse(cx, next, pos) {
        if (next !== PERCENT) return -1;
        if (cx.char(pos + 1) !== PERCENT) return -1;
        // Reject `%%%` triple — ambiguous.
        if (cx.char(pos + 2) === PERCENT) return -1;
        // Word-boundary: prev char must not be alphanumeric.
        if (pos > 0 && isAlnum(cx.char(pos - 1))) return -1;

        let end = pos + 2;
        while (end < cx.end - 1) {
          const ch = cx.char(end);
          if (ch === NEWLINE) return -1;
          if (
            ch === PERCENT &&
            cx.char(end + 1) === PERCENT &&
            cx.char(end + 2) !== PERCENT &&
            cx.char(end - 1) !== PERCENT
          ) {
            const innerStart = pos + 2;
            const innerEnd = end;
            // v0.2.14: empty / whitespace-only body is now accepted as a
            // degenerate (but still well-formed) memo. The decoration layer
            // collapses it to a chat-icon widget in Document mode so the
            // raw `%% %%` doesn't bleed into the rendered prose. The shared
            // parser (`shared/comments.ts`) still rejects empty bodies so
            // export/promotion pipelines aren't affected — this concession
            // is editor-render-only.
            if (innerEnd < innerStart) {
              end++;
              continue;
            }
            const inner = innerEnd > innerStart ? cx.slice(innerStart, innerEnd) : '';
            const trimmed = inner.replace(/^\s+/, '');
            const leadingWs = inner.length - trimmed.length;
            const tagMatch = trimmed.match(TAG_RE);
            const children = [cx.elt('CommentMark', pos, pos + 2)];
            if (tagMatch) {
              const tagFrom = innerStart + leadingWs;
              const tagTo = tagFrom + tagMatch[0].length;
              children.push(cx.elt('CommentTag', tagFrom, tagTo));
              if (tagTo < innerEnd) {
                children.push(cx.elt('CommentBody', tagTo, innerEnd));
              }
            } else if (innerEnd > innerStart) {
              children.push(cx.elt('CommentBody', innerStart, innerEnd));
            }
            children.push(cx.elt('CommentMark', end, end + 2));
            return cx.addElement(cx.elt('Comment', pos, end + 2, children));
          }
          end++;
        }
        return -1;
      },
      before: 'Emphasis',
    },
  ],
  parseBlock: [
    {
      name: 'CommentBlock',
      parse(cx: BlockContext, line: Line) {
        if (line.text.trim() !== '%%') return false;
        const startPos = cx.lineStart;
        const startChildren = [
          cx.elt('CommentMark', startPos + line.pos, startPos + line.text.length),
        ];
        // Walk forward until we find a `%%`-only closer, or EOF.
        const innerLines: Array<{ from: number; to: number; text: string }> = [];
        let endPos = startPos + line.text.length;
        while (cx.nextLine()) {
          const cur = line.text;
          if (cur.trim() === '%%') {
            const closerStart = cx.lineStart;
            const closerEnd = closerStart + cur.length;
            const children = [...startChildren];
            if (innerLines.length > 0) {
              const innerStart = innerLines[0].from;
              const innerEnd = innerLines[innerLines.length - 1].to;
              const innerText = innerLines.map((l) => l.text).join('\n');
              const trimmed = innerText.replace(/^\s+/, '');
              const leadingWs = innerText.length - trimmed.length;
              const tagMatch = trimmed.match(TAG_RE);
              if (tagMatch) {
                const tagFrom = innerStart + leadingWs;
                const tagTo = tagFrom + tagMatch[0].length;
                children.push(cx.elt('CommentTag', tagFrom, tagTo));
                if (tagTo < innerEnd) {
                  children.push(cx.elt('CommentBody', tagTo, innerEnd));
                }
              } else {
                children.push(cx.elt('CommentBody', innerStart, innerEnd));
              }
            }
            children.push(cx.elt('CommentMark', closerStart, closerEnd));
            cx.addElement(cx.elt('CommentBlock', startPos, closerEnd, children));
            cx.nextLine();
            return true;
          }
          if (cur.length > 0) {
            innerLines.push({
              from: cx.lineStart,
              to: cx.lineStart + cur.length,
              text: cur,
            });
          }
          endPos = cx.lineStart + cur.length;
        }
        // No closer — emit a degenerate node so highlighting is consistent.
        cx.addElement(cx.elt('CommentBlock', startPos, endPos, startChildren));
        return true;
      },
      // No `before:` — `Paragraph` is the catch-all fallback built-in and
      // isn't a named parser. Custom block parsers without `before:` run
      // before the Paragraph fallback.
    },
  ],
};
