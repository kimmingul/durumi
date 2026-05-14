import { Decoration, WidgetType } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { SyntaxNodeRef } from '@lezer/common';
import { decorationPlugin } from './framework';
import { shouldHideMarker } from './activeLine';
import { currentDocPath, setDocPath } from '../docPath';
import { resolveImageSrc } from '../../utils/resolveImageSrc';

/**
 * Renders Markdown image syntax `![alt](src)` and `![alt](src "title")` as an
 * actual `<img>` element in live preview. We pull `alt` (the text between the
 * first `[` and `]`) and `src` (the `URL` child) directly from the lezer
 * `Image` node's children, so the parser handles edge cases the previous
 * regex-on-raw-text approach got wrong: titles are no longer absorbed into the
 * URL, escaped brackets in alt text don't break extraction, and parens inside
 * URLs (rare but valid) are tolerated because the parser already balanced
 * them.
 */
class ImageWidget extends WidgetType {
  constructor(
    private alt: string,
    private src: string,
    /** Pre-resolved URL (durumi-asset:// for workspace paths). */
    private resolved: string,
  ) { super(); }
  eq(other: ImageWidget) {
    return other.alt === this.alt && other.src === this.src && other.resolved === this.resolved;
  }
  toDOM() {
    const img = document.createElement('img');
    img.className = 'cm-md-image';
    img.alt = this.alt;
    img.dataset.mdSrc = this.src;
    img.dataset.resolvedSrc = this.resolved;
    img.src = this.resolved;
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      // Surface load failures in DevTools so a smoke-tester can diagnose
      // CSP / protocol / path-guard issues without source-mode debugging.
      // eslint-disable-next-line no-console
      console.error(
        '[durumi] image load failed',
        { src: this.src, resolved: this.resolved },
      );
    });
    return img;
  }
  ignoreEvent() { return false; }
}

interface ImageParts {
  alt: string;
  src: string;
}

function partsFromImage(node: SyntaxNodeRef, doc: string): ImageParts | null {
  // Image children, in order:
  //   LinkMark `![`, [inline content for alt], LinkMark `]`,
  //   LinkMark `(`, URL, optional LinkTitle, LinkMark `)`
  let openBracket: number | null = null;
  let closeBracket: number | null = null;
  let url: { from: number; to: number } | null = null;
  let cur = node.node.firstChild;
  while (cur) {
    if (cur.name === 'LinkMark') {
      const ch = doc[cur.from];
      if (openBracket === null && ch === '!') openBracket = cur.from;
      else if (closeBracket === null && ch === ']') closeBracket = cur.from;
    } else if (cur.name === 'URL' && url === null) {
      url = { from: cur.from, to: cur.to };
    }
    cur = cur.nextSibling;
  }
  if (openBracket === null || closeBracket === null || !url) return null;
  // alt is the doc slice strictly between `![` and `]`.
  const alt = doc.slice(openBracket + 2, closeBracket);
  const src = doc.slice(url.from, url.to);
  return { alt, src };
}

export function imageDecoration(): Extension {
  return decorationPlugin({
    nodes: ['Image'],
    // Re-resolve image URLs when the document file changes (open / save-as).
    // Without this the cached durumi-asset:// URLs still point at the old
    // doc's directory.
    rebuildOn: [setDocPath],
    visit(builder, { from, to, lineActive, doc, node, view }) {
      if (!shouldHideMarker(view.state, lineActive)) return;
      const parts = partsFromImage(node, doc);
      if (!parts) return;
      const resolved = resolveImageSrc(parts.src, currentDocPath(view.state));
      builder.add(
        from,
        to,
        Decoration.replace({ widget: new ImageWidget(parts.alt, parts.src, resolved), block: false }),
      );
    },
  });
}
