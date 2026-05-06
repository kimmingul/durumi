import { Decoration } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { decorationPlugin } from './framework';

export function listDecoration(): Extension {
  return decorationPlugin({
    nodes: ['ListItem'],
    visit(builder, { from, view }) {
      const line = view.state.doc.lineAt(from);
      const slice = view.state.sliceDoc(line.from, Math.min(line.from + 8, line.to));
      if (/^[-*+]\s\[[ xX]\]\s/.test(slice)) return; // task list item — defer to taskList.ts
      builder.add(line.from, line.from, Decoration.line({ class: 'cm-md-list-item' }));
    },
  });
}
