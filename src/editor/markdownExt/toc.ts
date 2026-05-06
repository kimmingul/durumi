import type { MarkdownConfig } from '@lezer/markdown';
import { tags as t } from '@lezer/highlight';

const TOC_RE = /^\s*\[toc\]\s*$/i;

/**
 * Recognises a `[toc]` directive on its own line. Typora treats this as a
 * placeholder rendered as a live, auto-updating table-of-contents block.
 *
 * Lezer would otherwise parse `[toc]` as a link reference / paragraph, which
 * would prevent us from replacing it with a TOC widget in the live preview.
 */
export const TocExtension: MarkdownConfig = {
  defineNodes: [{ name: 'TocDirective', block: true, style: t.atom }],
  parseBlock: [
    {
      name: 'TocDirective',
      before: 'LinkReference',
      parse(cx, line) {
        if (!TOC_RE.test(line.text)) return false;
        const start = cx.lineStart;
        const end = start + line.text.length;
        cx.nextLine();
        cx.addElement(cx.elt('TocDirective', start, end));
        return true;
      },
    },
  ],
};
