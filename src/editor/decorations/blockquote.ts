import { Decoration } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { decorationPlugin } from './framework';

export function blockquoteDecoration(): Extension {
  return decorationPlugin({
    nodes: ['Blockquote'],
    visit(builder, { from, to, view }) {
      const start = view.state.doc.lineAt(from).number;
      const end = view.state.doc.lineAt(to).number;
      for (let n = start; n <= end; n++) {
        const line = view.state.doc.line(n);
        builder.add(line.from, line.from, Decoration.line({ class: 'cm-md-blockquote' }));
      }
    },
  });
}
