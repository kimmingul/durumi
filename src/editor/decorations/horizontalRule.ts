import { Decoration, WidgetType } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { decorationPlugin } from './framework';
import { shouldHideMarker } from './activeLine';

class HrWidget extends WidgetType {
  toDOM() { const hr = document.createElement('hr'); hr.className = 'cm-md-hr'; return hr; }
  ignoreEvent() { return true; }
}

export function horizontalRuleDecoration(): Extension {
  return decorationPlugin({
    nodes: ['HorizontalRule'],
    visit(builder, { from, to, lineActive, view }) {
      // HR lines are punctuation-only (`---`, `***`, `___`) — no Korean /
      // Japanese / Chinese composition target, so it's safe to keep the
      // widget rendered on the active line in WYSIWYG mode. Typora keeps
      // the legacy "show source on active line" behaviour.
      if (!shouldHideMarker(view.state, lineActive)) return;
      builder.add(from, to, Decoration.replace({ widget: new HrWidget() }));
    },
  });
}
