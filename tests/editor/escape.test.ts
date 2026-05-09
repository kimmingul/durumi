import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { escapeDecoration } from '../../src/editor/decorations/escape';

function makeView(doc: string, cursor: number): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [
      markdown({ base: markdownLanguage, extensions: [GFM] }),
      escapeDecoration(),
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

describe('escapeDecoration', () => {
  it('hides the leading backslash on inactive lines', () => {
    const doc = '\\*literal\\*\nnext';
    // cursor on line 2 (inactive line 1 with the escapes)
    const view = makeView(doc, doc.length);
    const replaces = rangesAt(view).filter(
      (r) => (r.spec as { widget?: unknown }).widget !== undefined,
    );
    // Expect two Escape replacements: one at position 0 (leading `\`) and one
    // at position 9 (the second `\` before the closing `*`).
    expect(replaces.length).toBe(2);
    expect(replaces[0]).toMatchObject({ from: 0, to: 1 });
    expect(replaces[1]).toMatchObject({ from: 9, to: 10 });
    view.destroy();
  });

  it('shows the backslash on the active line', () => {
    const doc = '\\*literal\\*';
    const view = makeView(doc, 4); // caret on the only line
    const replaces = rangesAt(view).filter(
      (r) => (r.spec as { widget?: unknown }).widget !== undefined,
    );
    expect(replaces.length).toBe(0);
    view.destroy();
  });

  it('handles \\\\ (escaped backslash) — hides one of the two', () => {
    const doc = 'a\\\\b\nnext';
    const view = makeView(doc, doc.length);
    const replaces = rangesAt(view).filter(
      (r) => (r.spec as { widget?: unknown }).widget !== undefined,
    );
    // Lezer emits a single Escape node spanning the two backslashes; we hide
    // the leading one so the visible source becomes `a\b`.
    expect(replaces.length).toBe(1);
    expect(replaces[0]).toMatchObject({ from: 1, to: 2 });
    view.destroy();
  });
});
