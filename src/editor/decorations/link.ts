import { Decoration, WidgetType } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { decorationPlugin } from './framework';

class HiddenMarkerWidget extends WidgetType {
  toDOM() { const s = document.createElement('span'); s.className = 'cm-md-marker-hidden'; return s; }
  ignoreEvent() { return true; }
}

export function linkDecoration(): Extension {
  return decorationPlugin({
    nodes: ['Link'],
    visit(builder, { from, to, lineActive, doc }) {
      const slice = doc.slice(from, to);
      const openBracket = slice.indexOf('[');
      const closeBracket = slice.indexOf(']', openBracket + 1);
      const openParen = slice.indexOf('(', closeBracket);
      const closeParen = slice.lastIndexOf(')');
      if (openBracket < 0 || closeBracket < 0 || openParen < 0 || closeParen < 0) return;
      const textFrom = from + openBracket + 1;
      const textTo = from + closeBracket;
      if (!lineActive) {
        builder.add(from + openBracket, textFrom, Decoration.replace({ widget: new HiddenMarkerWidget() }));
      }
      builder.add(textFrom, textTo, Decoration.mark({ class: 'cm-md-link' }));
      if (!lineActive) {
        builder.add(textTo, from + closeParen + 1, Decoration.replace({ widget: new HiddenMarkerWidget() }));
      }
    },
  });
}
