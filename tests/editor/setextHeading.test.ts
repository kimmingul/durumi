import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import {
  headingDecoration,
  setextHeadingTheme,
} from '../../src/editor/decorations/heading';
import {
  editModeStateExtension,
  setEditMode,
  type EditMode,
} from '../../src/editor/editMode';
import { horizontalRuleDecoration } from '../../src/editor/decorations/horizontalRule';

function makeView(doc: string, cursor: number, mode: EditMode = 'wysiwyg'): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [
      editModeStateExtension(),
      markdown({ base: markdownLanguage, extensions: [GFM] }),
      headingDecoration(),
      setextHeadingTheme,
      horizontalRuleDecoration(),
    ],
  });
  const view = new EditorView({ state, parent });
  view.dispatch({
    effects: setEditMode.of(mode),
    selection: { anchor: cursor },
    userEvent: 'select',
  });
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

  // ── v0.2.15 — Setext underline hide (smoke v2 follow-up) ──
  // The v0.2.14 sign-off matrix flagged Setext underlines as ALWAYS visible
  // in Document mode. v0.2.15 collapses them via a `cm-md-setext-underline-
  // hidden` line decoration + a `cm-md-marker-hidden` inline-replace over
  // the `=========` / `---------` run, mode-aware via `shouldHideMarker`.

  it('hides the `===` underline line in Document mode (caret off heading)', () => {
    const doc = 'Setext H1\n=========\n\nbody';
    // Caret on "body" (far from heading).
    const cursor = doc.length;
    const view = makeView(doc, cursor, 'wysiwyg');
    const ranges = rangesAt(view);
    const lineDecos = ranges.filter(
      (r) => (r.spec as { class?: string }).class === 'cm-md-setext-underline-hidden',
    );
    expect(lineDecos.length).toBe(1);
    // And the `=========` chars themselves are replace-hidden.
    const replaceHide = ranges.filter((r) => {
      const w = (r.spec as { widget?: { constructor?: { name?: string } } }).widget;
      return w !== undefined && r.from === 10 && r.to === 19;
    });
    expect(replaceHide.length).toBe(1);
    view.destroy();
  });

  it('hides the `---` underline line in Document mode (caret off heading)', () => {
    const doc = 'Setext H2\n---------\n\nbody';
    const view = makeView(doc, doc.length, 'wysiwyg');
    const lineDecos = rangesAt(view).filter(
      (r) => (r.spec as { class?: string }).class === 'cm-md-setext-underline-hidden',
    );
    expect(lineDecos.length).toBe(1);
    view.destroy();
  });

  it('hides the `===` underline in Live mode when caret is off the heading', () => {
    const doc = 'Setext H1\n=========\n\nbody';
    const view = makeView(doc, doc.length, 'typora');
    const lineDecos = rangesAt(view).filter(
      (r) => (r.spec as { class?: string }).class === 'cm-md-setext-underline-hidden',
    );
    expect(lineDecos.length).toBe(1);
    view.destroy();
  });

  it('SHOWS the `===` underline in Live mode when caret is on the heading text line', () => {
    const doc = 'Setext H1\n=========\n\nbody';
    // Caret inside "Setext H1" (line 1, position 3).
    const view = makeView(doc, 3, 'typora');
    const lineDecos = rangesAt(view).filter(
      (r) => (r.spec as { class?: string }).class === 'cm-md-setext-underline-hidden',
    );
    expect(lineDecos.length).toBe(0);
    view.destroy();
  });

  it('SHOWS the `===` underline in Live mode when caret is on the underline line itself', () => {
    const doc = 'Setext H1\n=========\n\nbody';
    // Caret on the underline line (position 12 = middle of `=========`).
    const view = makeView(doc, 12, 'typora');
    const lineDecos = rangesAt(view).filter(
      (r) => (r.spec as { class?: string }).class === 'cm-md-setext-underline-hidden',
    );
    expect(lineDecos.length).toBe(0);
    view.destroy();
  });

  // ── HR safety regression ──
  // A `---` standing alone after a blank line is parsed by lezer-markdown as
  // `HorizontalRule`, NOT `SetextHeading2`. Heading.ts never sees the HR
  // node, so the Setext hide path doesn't fire and the HR continues to
  // render via `horizontalRuleDecoration`.
  it('does NOT hide a true HR `---` line (parser disambiguates Setext from HR)', () => {
    const doc = 'para\n\n---\n\nmore';
    const view = makeView(doc, doc.length, 'wysiwyg');
    const lineDecos = rangesAt(view).filter(
      (r) => (r.spec as { class?: string }).class === 'cm-md-setext-underline-hidden',
    );
    expect(lineDecos.length).toBe(0);
    // The HR plugin still produces its widget replace over `---`.
    const hrReplaces = rangesAt(view).filter(
      (r) => r.from === 6 && r.to === 9 && (r.spec as { widget?: unknown }).widget !== undefined,
    );
    expect(hrReplaces.length).toBe(1);
    view.destroy();
  });

  // ── Mode-only transaction regression guard (v0.2.8 listener pattern) ──
  // The decorationPlugin framework defaults to rebuilding on docChanged /
  // viewportChanged / selectionSet only. Setext hide depends on edit mode,
  // so a bare `setEditMode.of('wysiwyg')` (no doc change, no selection
  // change) must still rebuild — wired via `rebuildOn: [setEditMode]`.
  it('rebuilds Setext hide on a bare setEditMode effect (no doc/selection change)', () => {
    const doc = 'Setext H1\n=========\n\nbody';
    // Start in Live mode with caret on the heading text — underline visible.
    const view = makeView(doc, 3, 'typora');
    let lineDecos = rangesAt(view).filter(
      (r) => (r.spec as { class?: string }).class === 'cm-md-setext-underline-hidden',
    );
    expect(lineDecos.length).toBe(0);
    // Mode-only transaction: no `changes`, no `selection`.
    view.dispatch({ effects: setEditMode.of('wysiwyg') });
    lineDecos = rangesAt(view).filter(
      (r) => (r.spec as { class?: string }).class === 'cm-md-setext-underline-hidden',
    );
    // Document mode always hides — even with caret still on heading.
    expect(lineDecos.length).toBe(1);
    view.destroy();
  });
});
