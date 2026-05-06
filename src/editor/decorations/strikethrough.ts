import { Decoration, WidgetType } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { decorationPlugin } from './framework';

class HiddenStrikeMarker extends WidgetType {
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-md-marker-hidden';
    return s;
  }
  ignoreEvent() {
    return true;
  }
}

export function strikethroughDecoration(): Extension {
  return decorationPlugin({
    nodes: ['Strikethrough'],
    visit(builder, { from, to, lineActive }) {
      if (!lineActive) {
        builder.add(from, from + 2, Decoration.replace({ widget: new HiddenStrikeMarker() }));
      }
      builder.add(from, to, Decoration.mark({ class: 'cm-strike' }));
      if (!lineActive) {
        builder.add(to - 2, to, Decoration.replace({ widget: new HiddenStrikeMarker() }));
      }
    },
  });
}
