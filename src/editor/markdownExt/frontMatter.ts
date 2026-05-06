import type { MarkdownConfig } from '@lezer/markdown';
import { tags as t } from '@lezer/highlight';

/**
 * Lezer-markdown extension that recognises a YAML front-matter block at the
 * start of the document. Without this, lezer would interpret the closing
 * `---` line as a setext H2 marker, turning the YAML keys above it into a
 * stray heading in the live preview.
 *
 * Defines three nodes:
 *   - FrontMatter        the whole `---\n…\n---\n` region
 *   - FrontMatterMark    the opening and closing `---`
 *   - FrontMatterContent (reserved; currently the YAML body is left bare so
 *                         decorations / spell-check skipping can target the
 *                         FrontMatter range directly)
 */
export const FrontMatterExtension: MarkdownConfig = {
  defineNodes: [
    { name: 'FrontMatter', block: true, style: t.meta },
    { name: 'FrontMatterMark', style: t.processingInstruction },
    { name: 'FrontMatterContent', style: t.meta },
  ],
  parseBlock: [
    {
      name: 'FrontMatter',
      // Run before HorizontalRule so the opening `---` doesn't become an HR,
      // and before SetextHeading so the closing `---` doesn't promote the
      // preceding YAML key into a heading.
      before: 'HorizontalRule',
      parse(cx, line) {
        if (cx.lineStart !== 0) return false;
        if (line.text !== '---') return false;
        const start = cx.lineStart;
        const children = [cx.elt('FrontMatterMark', start, start + 3)];
        let endPos = start + 3;
        // The `line` parameter is the same Line object lezer mutates on each
        // nextLine() call, so reading line.text after nextLine() gives the
        // freshly advanced line's text (matches the FencedCode / Blockquote
        // implementations in @lezer/markdown).
        while (cx.nextLine()) {
          const text = line.text;
          const lineStart = cx.lineStart;
          if (text === '---' || text === '...') {
            const closeLen = text.length;
            children.push(cx.elt('FrontMatterMark', lineStart, lineStart + closeLen));
            endPos = lineStart + closeLen;
            cx.nextLine();
            cx.addElement(cx.elt('FrontMatter', start, endPos, children));
            return true;
          }
          endPos = lineStart + text.length;
        }
        // Unterminated block (still typing): emit what we have to keep the
        // YAML keys from being parsed as paragraphs / setext below.
        cx.addElement(cx.elt('FrontMatter', start, endPos, children));
        return true;
      },
    },
  ],
};
