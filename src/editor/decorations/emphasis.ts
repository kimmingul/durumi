import { Decoration, WidgetType } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { decorationPlugin } from './framework';

class HiddenMarkerWidget extends WidgetType {
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-md-marker-hidden';
    return s;
  }
  ignoreEvent() { return true; }
}

export function emphasisDecoration(): Extension {
  return decorationPlugin({
    nodes: ['StrongEmphasis', 'Emphasis'],
    visit(builder, { from, to, nodeName, lineActive, doc }) {
      const isBold = nodeName === 'StrongEmphasis';
      const className = isBold ? 'cm-md-bold' : 'cm-md-italic';
      const markerLen = isBold ? 2 : 1;
      const head = doc.slice(from, from + markerLen);
      const tail = doc.slice(to - markerLen, to);
      const okHead = isBold ? (head === '**' || head === '__') : (head === '*' || head === '_');
      const okTail = isBold ? (tail === '**' || tail === '__') : (tail === '*' || tail === '_');
      const shouldHide = !lineActive && okHead && okTail;
      if (shouldHide) {
        builder.add(from, from + markerLen, Decoration.replace({ widget: new HiddenMarkerWidget() }));
      }
      builder.add(from, to, Decoration.mark({ class: className }));
      if (shouldHide) {
        builder.add(to - markerLen, to, Decoration.replace({ widget: new HiddenMarkerWidget() }));
      }
    },
  });
}
