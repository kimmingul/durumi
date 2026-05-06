import { Decoration, WidgetType } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { decorationPlugin } from './framework';

class ImageWidget extends WidgetType {
  constructor(private alt: string, private src: string) { super(); }
  eq(other: ImageWidget) { return other.alt === this.alt && other.src === this.src; }
  toDOM() {
    const img = document.createElement('img');
    img.className = 'cm-md-image';
    img.alt = this.alt;
    img.src = this.src;
    img.loading = 'lazy';
    return img;
  }
  ignoreEvent() { return false; }
}

const IMG_PATTERN = /^!\[([^\]]*)\]\(([^)]+)\)/;

export function imageDecoration(): Extension {
  return decorationPlugin({
    nodes: ['Image'],
    visit(builder, { from, to, lineActive, doc }) {
      if (lineActive) return;
      const slice = doc.slice(from, to);
      const match = slice.match(IMG_PATTERN);
      if (!match) return;
      const alt = match[1] ?? '';
      const src = match[2] ?? '';
      builder.add(from, to, Decoration.replace({ widget: new ImageWidget(alt, src), block: false }));
    },
  });
}
