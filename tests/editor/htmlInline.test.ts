import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import {
  htmlInlineDecoration,
  htmlInlineTheme,
} from '../../src/editor/decorations/htmlInline';
import {
  editModeStateExtension,
  setEditMode,
  type EditMode,
} from '../../src/editor/editMode';

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

  // ── Mode-only transaction regression guard — v0.2.12 ──
  // The htmlInline field is indirectly mode-aware (via `shouldHideMarker →
  // currentEditMode`). It must rebuild on a bare `setEditMode` effect even
  // when the transaction has no doc change and no selection change. Prior
  // to v0.2.12, `update()` short-circuited on `tr.docChanged || tr.selection`,
  // leaving the previous mode's decorations stale until the next keystroke.
  // The v0.2.8 codex follow-up agent missed this file because it only grep'd
  // for direct `isWysiwygMode` calls and overlooked the `shouldHideMarker`
  // indirect path.
  describe('mode-only transaction regression guard (v0.2.12)', () => {
    function makeViewWithMode(doc: string, cursor: number, mode: EditMode = 'typora'): EditorView {
      const state = EditorState.create({
        doc,
        selection: { anchor: cursor },
        extensions: [
          editModeStateExtension(),
          markdown({ base: markdownLanguage, extensions: [GFM] }),
          htmlInlineDecoration(),
          htmlInlineTheme,
        ],
      });
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const view = new EditorView({ state, parent });
      view.dispatch({
        effects: setEditMode.of(mode),
        selection: { anchor: cursor },
        userEvent: 'select',
      });
      return view;
    }

    it('Live mode caret-on-line: tag content has cm-md-html-mark class with markers visible', () => {
      const doc = '<mark>HTML mark</mark>\nnext';
      // Place caret on the mark line in Live (typora) mode.
      const v = makeViewWithMode(doc, 3, 'typora');
      const ranges = rangesAt(v);
      const marks = ranges.filter(
        (r) => (r.spec as { class?: string }).class === 'cm-md-html-mark',
      );
      const replaces = ranges.filter(
        (r) => (r.spec as { widget?: unknown }).widget !== undefined,
      );
      // The inner content should be marked with the highlight class.
      expect(marks.length).toBe(1);
      // No marker hiding because the caret is on the line in Live mode.
      expect(replaces.length).toBe(0);
      v.destroy();
    });

    it('rebuilds decorations on a bare setEditMode effect (no doc/selection change)', () => {
      const doc = '<mark>HTML mark</mark>\nnext';
      const v = makeViewWithMode(doc, 3, 'typora');
      // Baseline: caret on mark line in Live mode → markers visible.
      const baselineReplaces = rangesAt(v).filter(
        (r) => (r.spec as { widget?: unknown }).widget !== undefined,
      );
      expect(baselineReplaces.length).toBe(0);
      // Mode-only transaction: no `changes`, no `selection`.
      v.dispatch({ effects: setEditMode.of('wysiwyg') });
      // After the effect, Document mode must hide the open + close tag markers.
      const afterReplaces = rangesAt(v).filter(
        (r) => (r.spec as { widget?: unknown }).widget !== undefined,
      );
      expect(afterReplaces.length).toBe(2);
      v.destroy();
    });
  });
});
