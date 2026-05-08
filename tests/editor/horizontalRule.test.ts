import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { horizontalRuleDecoration } from '../../src/editor/decorations/horizontalRule';

function setup(doc: string, cursor: number) {
  const view = new EditorView({
    state: EditorState.create({
      doc, selection: { anchor: cursor },
      extensions: [markdown(), horizontalRuleDecoration()],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
  view.dispatch({ selection: { anchor: cursor }, userEvent: 'select' });
  return view;
}

describe('horizontalRule decoration', () => {
  it('renders an hr widget when cursor off-line', () => {
    const v = setup('above\n\n---\n\nbelow', 15);
    expect(v.dom.querySelector('hr.cm-md-hr')).not.toBeNull();
    v.destroy();
  });
  it('shows source when cursor on line', () => {
    const v = setup('above\n\n---\n\nbelow', 8);
    expect(v.dom.querySelector('hr.cm-md-hr')).toBeNull();
    v.destroy();
  });
});
