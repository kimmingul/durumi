import { Decoration, WidgetType } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { decorationPlugin } from './framework';

/**
 * lezer-markdown emits an `Escape` node for `\X` sequences (the two characters
 * `\*`, `\_`, `\\`, etc.). Without a decoration the leading backslash stays
 * visible in the rendered view, so a user typing `\*literal\*` sees the slashes
 * even when they are off the line. We hide the leading `\` while the line is
 * inactive, mirroring Typora.
 */
class HiddenWidget extends WidgetType {
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-md-marker-hidden';
    return s;
  }
  ignoreEvent() { return true; }
}

export function escapeDecoration(): Extension {
  return decorationPlugin({
    nodes: ['Escape'],
    visit(builder, { from, to, lineActive }) {
      if (lineActive) return;
      if (to - from < 2) return;
      builder.add(from, from + 1, Decoration.replace({ widget: new HiddenWidget() }));
    },
  });
}
