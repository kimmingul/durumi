import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { headingDecoration } from '../../src/editor/decorations/heading';

function makeView(doc: string, cursor: number): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [
      markdown({ base: markdownLanguage, extensions: [GFM] }),
      headingDecoration(),
    ],
  });
  const view = new EditorView({ state });
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

describe('headingDecoration — Setext form', () => {
  it('applies cm-md-h1 to a `===` heading', () => {
    const doc = 'Title\n=====\n\nbody';
    const view = makeView(doc, doc.length);
    const marks = rangesAt(view).filter(
      (r) => (r.spec as { class?: string }).class === 'cm-md-h1',
    );
    expect(marks.length).toBeGreaterThan(0);
    view.destroy();
  });

  it('applies cm-md-h2 to a `---` heading', () => {
    const doc = 'Sub\n---\n\nbody';
    const view = makeView(doc, doc.length);
    const marks = rangesAt(view).filter(
      (r) => (r.spec as { class?: string }).class === 'cm-md-h2',
    );
    expect(marks.length).toBeGreaterThan(0);
    view.destroy();
  });

  it('does not hide the underline marker on inactive lines', () => {
    const doc = 'Title\n=====\n\nbody';
    const view = makeView(doc, doc.length);
    const replaces = rangesAt(view).filter(
      (r) => (r.spec as { widget?: unknown }).widget !== undefined,
    );
    // Setext markers stay visible — they live on a separate line and the
    // user usually wants to see them.
    expect(replaces.length).toBe(0);
    view.destroy();
  });
});
