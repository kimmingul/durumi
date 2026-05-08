import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { strikethroughDecoration } from '../../src/editor/decorations/strikethrough';

function makeView(doc: string, cursor: number): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [
      markdown({ base: markdownLanguage, extensions: [GFM] }),
      strikethroughDecoration(),
    ],
  });
  const view = new EditorView({ state });
  view.dispatch({ selection: { anchor: cursor }, userEvent: 'select' });
  return view;
}

function rangesAt(view: EditorView): Array<{ from: number; to: number; spec: unknown }> {
  const out: Array<{ from: number; to: number; spec: unknown }> = [];
  const fields = view.state.facet(EditorView.decorations);
  for (const f of fields) {
    const set = typeof f === 'function' ? f(view) : f;
    set.between(0, view.state.doc.length, (from, to, deco) => {
      out.push({ from, to, spec: deco.spec });
    });
  }
  return out;
}

describe('strikethrough decoration', () => {
  it('hides markers and marks body when line is inactive', () => {
    const doc = '~~hi~~\nnext line';
    const view = makeView(doc, doc.length); // cursor on line 2
    const ranges = rangesAt(view);
    const replaces = ranges.filter((r) => (r.spec as { widget?: unknown }).widget !== undefined);
    const marks = ranges.filter((r) => (r.spec as { class?: string }).class === 'cm-strike');
    expect(replaces.length).toBe(2);
    expect(replaces[0]).toMatchObject({ from: 0, to: 2 });
    expect(replaces[1]).toMatchObject({ from: 4, to: 6 });
    expect(marks.length).toBe(1);
    expect(marks[0]).toMatchObject({ from: 0, to: 6 });
    view.destroy();
  });

  it('shows markers when line is active', () => {
    const doc = '~~hi~~';
    const view = makeView(doc, 3);
    const ranges = rangesAt(view);
    const replaces = ranges.filter((r) => (r.spec as { widget?: unknown }).widget !== undefined);
    expect(replaces.length).toBe(0);
    view.destroy();
  });
});

import { markdownKeymap } from '../../src/editor/keymap';
import { runScopeHandlers } from '@codemirror/view';

describe('strikethrough keybinding', () => {
  it('Mod-Shift-x wraps selection in ~~ ~~', () => {
    const doc = 'hello world';
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: 6, head: 11 }, // "world"
        extensions: [markdownKeymap()],
      }),
    });
    // JSDOM has no real platform; CodeMirror normalizes Mod -> Ctrl when not mac.
    const ev = new KeyboardEvent('keydown', { key: 'x', shiftKey: true, ctrlKey: true });
    runScopeHandlers(view, ev, 'editor');
    expect(view.state.doc.toString()).toBe('hello ~~world~~');
    view.destroy();
  });
});
