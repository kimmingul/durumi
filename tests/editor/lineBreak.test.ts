import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { lineBreakDecoration } from '../../src/editor/decorations/lineBreak';

function makeView(doc: string, cursor: number): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [
      markdown({ base: markdownLanguage, extensions: [GFM] }),
      lineBreakDecoration(),
    ],
  });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state, parent });
  view.dispatch({ selection: { anchor: cursor }, userEvent: 'select' });
  return view;
}

interface Range { from: number; to: number; spec: unknown }

function rangesAt(view: EditorView): Range[] {
  const out: Range[] = [];
  const fields = view.state.facet(EditorView.decorations);
  for (const f of fields) {
    const set = typeof f === 'function' ? f(view) : f;
    set.between(0, view.state.doc.length, (from, to, deco) => {
      out.push({ from, to, spec: deco.spec });
    });
  }
  return out;
}

describe('lineBreakDecoration', () => {
  it('shows a widget for two-trailing-spaces hard break on inactive lines', () => {
    // The `  \n` produces a HardBreak; cursor is on line 2 so line 1 is inactive.
    const doc = 'first  \nsecond';
    const view = makeView(doc, doc.length);
    const replaces = rangesAt(view).filter(
      (r) => (r.spec as { widget?: unknown }).widget !== undefined,
    );
    expect(replaces.length).toBe(1);
    view.destroy();
  });

  it('shows a widget for trailing-backslash hard break', () => {
    const doc = 'first\\\nsecond';
    const view = makeView(doc, doc.length);
    const replaces = rangesAt(view).filter(
      (r) => (r.spec as { widget?: unknown }).widget !== undefined,
    );
    expect(replaces.length).toBe(1);
    view.destroy();
  });
});
