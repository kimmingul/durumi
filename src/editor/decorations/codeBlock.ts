import { Decoration } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { decorationPlugin } from './framework';

export function codeBlockDecoration(): Extension {
  return decorationPlugin({
    nodes: ['FencedCode', 'CodeBlock'],
    visit(builder, { from, to, view }) {
      const startLine = view.state.doc.lineAt(from).number;
      const endLine = view.state.doc.lineAt(to).number;
      for (let n = startLine; n <= endLine; n++) {
        const line = view.state.doc.line(n);
        builder.add(line.from, line.from, Decoration.line({ class: 'cm-md-code-block' }));
      }
    },
  });
}
