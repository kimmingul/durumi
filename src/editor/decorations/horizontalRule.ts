import { Decoration, WidgetType } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { decorationPlugin } from './framework';

class HrWidget extends WidgetType {
  toDOM() { const hr = document.createElement('hr'); hr.className = 'cm-md-hr'; return hr; }
  ignoreEvent() { return true; }
}

export function horizontalRuleDecoration(): Extension {
  return decorationPlugin({
    nodes: ['HorizontalRule'],
    visit(builder, { from, to, lineActive }) {
      if (lineActive) return;
      builder.add(from, to, Decoration.replace({ widget: new HrWidget() }));
    },
  });
}
