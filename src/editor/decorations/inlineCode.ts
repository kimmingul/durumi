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

export function inlineCodeDecoration(): Extension {
  return decorationPlugin({
    nodes: ['InlineCode'],
    visit(builder, { from, to, lineActive, doc }) {
      const lead = doc.slice(from).match(/^`+/)?.[0]?.length ?? 0;
      const trail = doc.slice(0, to).match(/`+$/)?.[0]?.length ?? 0;
      const shouldHide = !lineActive && lead > 0 && trail > 0;
      if (shouldHide) {
        builder.add(from, from + lead, Decoration.replace({ widget: new HiddenMarkerWidget() }));
      }
      builder.add(from, to, Decoration.mark({ class: 'cm-md-inline-code' }));
      if (shouldHide) {
        builder.add(to - trail, to, Decoration.replace({ widget: new HiddenMarkerWidget() }));
      }
    },
  });
}
