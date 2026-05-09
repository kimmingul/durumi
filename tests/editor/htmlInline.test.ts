import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import {
  htmlInlineDecoration,
  htmlInlineTheme,
} from '../../src/editor/decorations/htmlInline';

function makeView(doc: string, cursor: number): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [
      markdown({ base: markdownLanguage, extensions: [GFM] }),
      htmlInlineDecoration(),
      htmlInlineTheme,
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

describe('htmlInlineDecoration', () => {
  it('renders <sub>…</sub> and hides the tags on inactive lines', () => {
    const doc = 'H<sub>2</sub>O\nnext';
    const view = makeView(doc, doc.length);
    const ranges = rangesAt(view);
    const replaces = ranges.filter(
      (r) => (r.spec as { widget?: unknown }).widget !== undefined,
    );
    const marks = ranges.filter(
      (r) => (r.spec as { class?: string }).class === 'cm-md-html-sub',
    );
    expect(replaces.length).toBe(2); // open tag + close tag both hidden
    expect(marks.length).toBe(1);
    // Mark spans the inner content `2` between the tags.
    const open = doc.indexOf('<sub>');
    const close = doc.indexOf('</sub>');
    expect(marks[0]).toMatchObject({ from: open + 5, to: close });
    view.destroy();
  });

  it('renders <sup>…</sup>', () => {
    const doc = 'E = mc<sup>2</sup>\nnext';
    const view = makeView(doc, doc.length);
    const marks = rangesAt(view).filter(
      (r) => (r.spec as { class?: string }).class === 'cm-md-html-sup',
    );
    expect(marks.length).toBe(1);
    view.destroy();
  });

  it('shows raw tags when the caret is on the line', () => {
    const doc = 'H<sub>2</sub>O';
    const view = makeView(doc, 3); // caret inside line
    const ranges = rangesAt(view);
    const replaces = ranges.filter(
      (r) => (r.spec as { widget?: unknown }).widget !== undefined,
    );
    expect(replaces.length).toBe(0);
    view.destroy();
  });

  it('handles <mark>, <kbd>, <u>', () => {
    const doc = '<mark>hi</mark> press <kbd>Ctrl</kbd> <u>under</u>\nnext';
    const view = makeView(doc, doc.length);
    const classes = rangesAt(view)
      .map((r) => (r.spec as { class?: string }).class)
      .filter(Boolean);
    expect(classes).toContain('cm-md-html-mark');
    expect(classes).toContain('cm-md-html-kbd');
    expect(classes).toContain('cm-md-html-u');
    view.destroy();
  });

  it('ignores unknown / unstyled tags (e.g. <div>)', () => {
    const doc = '<div>hi</div>\nnext';
    const view = makeView(doc, doc.length);
    const replaces = rangesAt(view).filter(
      (r) => (r.spec as { widget?: unknown }).widget !== undefined,
    );
    expect(replaces.length).toBe(0);
    view.destroy();
  });

  it('ignores an unbalanced tag (no decoration applied)', () => {
    const doc = 'H<sub>2 with no close\nnext';
    const view = makeView(doc, doc.length);
    const ranges = rangesAt(view);
    const replaces = ranges.filter(
      (r) => (r.spec as { widget?: unknown }).widget !== undefined,
    );
    expect(replaces.length).toBe(0);
    view.destroy();
  });
});
