import { Decoration, WidgetType } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { decorationPlugin } from './framework';

const HEADING_NODES = [
  'ATXHeading1', 'ATXHeading2', 'ATXHeading3',
  'ATXHeading4', 'ATXHeading5', 'ATXHeading6',
];
const LEVEL: Record<string, number> = {
  ATXHeading1: 1, ATXHeading2: 2, ATXHeading3: 3,
  ATXHeading4: 4, ATXHeading5: 5, ATXHeading6: 6,
};

class HiddenMarkerWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-md-marker-hidden';
    return span;
  }
  ignoreEvent() { return true; }
}

export function headingDecoration(): Extension {
  return decorationPlugin({
    nodes: HEADING_NODES,
    visit(builder, { from, to, nodeName, lineActive, doc }) {
      const level = LEVEL[nodeName] ?? 1;
      const markerLen = level + 1;
      const head = doc.slice(from, from + markerLen);
      const shouldHide = !lineActive && /^#+ $/.test(head);
      if (shouldHide) {
        builder.add(
          from,
          from + markerLen,
          Decoration.replace({ widget: new HiddenMarkerWidget() }),
        );
      }
      builder.add(from, to, Decoration.mark({ class: `cm-md-h${level}` }));
    },
  });
}
