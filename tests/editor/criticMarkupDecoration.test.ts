import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { InlineExtrasExtension } from '../../src/editor/markdownExt/inlineExtras';
import { CriticMarkupExtension } from '../../src/editor/markdownExt/criticMarkup';
import {
  criticMarkupDecoration,
  criticMarkupTheme,
} from '../../src/editor/decorations/criticMarkup';
import {
  editModeStateExtension,
  setEditMode,
  type EditMode,
} from '../../src/editor/editMode';

function setup(doc: string, cursor: number, mode: EditMode = 'typora') {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        editModeStateExtension(),
        markdown({
          base: markdownLanguage,
          extensions: [GFM, InlineExtrasExtension, CriticMarkupExtension],
        }),
        criticMarkupDecoration(),
        criticMarkupTheme,
      ],
    }),
    parent,
  });
  view.dispatch({
    effects: setEditMode.of(mode),
    selection: { anchor: cursor },
    userEvent: 'select',
  });
  return view;
}

describe('criticMarkupDecoration', () => {
  it('renders insertion as cm-cm-insert when caret is off the line', () => {
    const doc = 'hello {++ added ++} world\nnext';
    const v = setup(doc, doc.length);
    expect(v.dom.querySelector('.cm-cm-insert')).toBeTruthy();
    // Open marker should not appear in the rendered text (replaced by widget).
    expect(v.dom.textContent ?? '').not.toContain('{++');
    v.destroy();
  });

  it('renders deletion as cm-cm-delete when off-line', () => {
    const doc = 'hi {-- gone --} bye\nnext';
    const v = setup(doc, doc.length);
    expect(v.dom.querySelector('.cm-cm-delete')).toBeTruthy();
    expect(v.dom.textContent ?? '').not.toContain('{--');
    v.destroy();
  });

  it('renders substitution with old strikethrough, arrow, new underline', () => {
    const doc = 'edit {~~old~>new~~} done\nnext';
    const v = setup(doc, doc.length);
    expect(v.dom.querySelector('.cm-cm-sub-old')).toBeTruthy();
    expect(v.dom.querySelector('.cm-cm-sub-new')).toBeTruthy();
    expect(v.dom.querySelector('.cm-cm-sub-arrow')).toBeTruthy();
    expect(v.dom.textContent ?? '').not.toContain('~>');
    v.destroy();
  });

  it('renders highlight with cm-cm-highlight class', () => {
    const doc = 'pre {== mark ==} post\nnext';
    const v = setup(doc, doc.length);
    expect(v.dom.querySelector('.cm-cm-highlight')).toBeTruthy();
    expect(v.dom.textContent ?? '').not.toContain('{==');
    v.destroy();
  });

  it('renders comment as a single pill widget, hides body', () => {
    const doc = 'pre {>> note here <<} post\nnext';
    const v = setup(doc, doc.length);
    const pill = v.dom.querySelector('.cm-cm-comment-pill');
    expect(pill).toBeTruthy();
    expect((pill as HTMLElement)?.textContent).toBe('💬');
    expect(v.dom.textContent ?? '').not.toContain('note here');
    v.destroy();
  });

  it('shows source verbatim when caret is on the line (Live active-line invariant)', () => {
    const doc = 'foo {++ X ++} bar';
    const v = setup(doc, 6); // caret inside `{++`
    // Source preserved.
    expect(v.dom.textContent ?? '').toContain('{++');
    expect(v.dom.textContent ?? '').toContain('++}');
    // Faint active-line decoration applied.
    expect(v.dom.querySelector('.cm-cm-active')).toBeTruthy();
    expect(v.dom.querySelector('.cm-cm-active-insert')).toBeTruthy();
    v.destroy();
  });

  it('clicking the comment pill fires durumi:cm-focus with the source `from`', () => {
    const doc = 'pre {>> note <<} post\nnext';
    const v = setup(doc, doc.length);
    const pill = v.dom.querySelector('.cm-cm-comment-pill') as HTMLElement;
    expect(pill).toBeTruthy();
    let received: { from: number } | null = null;
    v.dom.addEventListener('durumi:cm-focus', (e) => {
      received = (e as CustomEvent<{ from: number }>).detail;
    });
    pill.click();
    expect(received).not.toBeNull();
    expect(received!.from).toBe(doc.indexOf('{>>'));
    v.destroy();
  });

  it('coexists with adjacent ==text== highlights and ~~strike~~', () => {
    const doc = 'a ==regular== b {== tracked ==} c ~~strike~~ d\nnext';
    const v = setup(doc, doc.length);
    // Both critic and inline-extras highlights have been parsed, but only
    // CmHighlight gets our class; the regular Highlight node remains plain.
    expect(v.dom.querySelector('.cm-cm-highlight')).toBeTruthy();
    expect(v.dom.textContent ?? '').toContain('regular');
    expect(v.dom.textContent ?? '').toContain('strike');
    v.destroy();
  });

  // ── Document mode (WYSIWYG) parity — v0.2.8 ──
  // Each CriticMarkup operator must keep its delimiters hidden and its
  // styled inner content visible even when the caret is on the line.
  // The active-line carve-out is intentional only in Live mode.

  it('Document mode: insertion stays styled, `{++ ++}` stays hidden when caret on the line', () => {
    const doc = 'foo {++ X ++} bar';
    const v = setup(doc, 6, 'wysiwyg'); // caret inside `{++`
    expect(v.dom.querySelector('.cm-cm-insert')).toBeTruthy();
    expect(v.dom.textContent ?? '').not.toContain('{++');
    expect(v.dom.textContent ?? '').not.toContain('++}');
    expect(v.dom.querySelector('.cm-cm-active')).toBeNull();
    v.destroy();
  });

  it('Document mode: deletion stays styled, `{-- --}` stays hidden when caret on the line', () => {
    const doc = 'hi {-- gone --} bye';
    const v = setup(doc, 5, 'wysiwyg'); // caret inside the delete span
    expect(v.dom.querySelector('.cm-cm-delete')).toBeTruthy();
    expect(v.dom.textContent ?? '').not.toContain('{--');
    expect(v.dom.textContent ?? '').not.toContain('--}');
    expect(v.dom.querySelector('.cm-cm-active')).toBeNull();
    v.destroy();
  });

  it('Document mode: substitution stays rendered, `~>` arrow widget remains', () => {
    const doc = 'edit {~~old~>new~~} done';
    const v = setup(doc, 8, 'wysiwyg'); // caret inside the sub span
    expect(v.dom.querySelector('.cm-cm-sub-old')).toBeTruthy();
    expect(v.dom.querySelector('.cm-cm-sub-new')).toBeTruthy();
    expect(v.dom.querySelector('.cm-cm-sub-arrow')).toBeTruthy();
    expect(v.dom.textContent ?? '').not.toContain('~>');
    expect(v.dom.textContent ?? '').not.toContain('{~~');
    expect(v.dom.querySelector('.cm-cm-active')).toBeNull();
    v.destroy();
  });

  it('Document mode: highlight stays styled, `{== ==}` stays hidden when caret on the line', () => {
    const doc = 'pre {== mark ==} post';
    const v = setup(doc, 8, 'wysiwyg'); // caret inside the highlight
    expect(v.dom.querySelector('.cm-cm-highlight')).toBeTruthy();
    expect(v.dom.textContent ?? '').not.toContain('{==');
    expect(v.dom.textContent ?? '').not.toContain('==}');
    expect(v.dom.querySelector('.cm-cm-active')).toBeNull();
    v.destroy();
  });

  it('Document mode: comment stays as a pill, body hidden when caret on the line', () => {
    const doc = 'pre {>> note here <<} post';
    const v = setup(doc, 8, 'wysiwyg'); // caret inside the comment
    expect(v.dom.querySelector('.cm-cm-comment-pill')).toBeTruthy();
    expect(v.dom.textContent ?? '').not.toContain('note here');
    expect(v.dom.querySelector('.cm-cm-active')).toBeNull();
    v.destroy();
  });

  // ── Empty-body CriticMarkup handling — v0.2.14 ──
  // Zero-length CM spans (`{++++}`, `{----}`, `{== ==}`, `{>><<}`,
  // `{~~~>~~}`) used to fall through the parser and render as raw braces.
  // v0.2.14 accepts empty bodies at the parser level and the decoration
  // layer hides the delimiters + renders a tiny styled placeholder (insert/
  // delete/highlight/sub) or the pill widget (comment).

  it('Document mode: empty `{++++}` hides delimiters and renders a styled placeholder', () => {
    const doc = 'a {++++} b\nnext';
    const v = setup(doc, doc.length, 'wysiwyg');
    expect(v.dom.textContent ?? '').not.toContain('{++');
    expect(v.dom.textContent ?? '').not.toContain('++}');
    const ph = v.dom.querySelector('.cm-cm-empty.cm-cm-insert');
    expect(ph).toBeTruthy();
    v.destroy();
  });

  it('Document mode: empty `{----}` hides delimiters and renders a styled placeholder', () => {
    const doc = 'a {----} b\nnext';
    const v = setup(doc, doc.length, 'wysiwyg');
    expect(v.dom.textContent ?? '').not.toContain('{--');
    expect(v.dom.textContent ?? '').not.toContain('--}');
    const ph = v.dom.querySelector('.cm-cm-empty.cm-cm-delete');
    expect(ph).toBeTruthy();
    v.destroy();
  });

  it('Document mode: empty `{== ==}` hides delimiters and renders the highlight mark', () => {
    const doc = 'a {== ==} b\nnext';
    const v = setup(doc, doc.length, 'wysiwyg');
    expect(v.dom.textContent ?? '').not.toContain('{==');
    expect(v.dom.textContent ?? '').not.toContain('==}');
    // The single-space body renders as a `Decoration.mark` (visible
    // highlight). Either an empty-placeholder OR the styled mark span
    // satisfies the invariant; assert at least one of them is present.
    const hasMark = v.dom.querySelector('.cm-cm-highlight');
    const hasEmpty = v.dom.querySelector('.cm-cm-empty.cm-cm-highlight');
    expect(hasMark || hasEmpty).toBeTruthy();
    v.destroy();
  });

  it('Document mode: empty `{>><<}` hides delimiters and renders the comment pill', () => {
    const doc = 'a {>><<} b\nnext';
    const v = setup(doc, doc.length, 'wysiwyg');
    expect(v.dom.textContent ?? '').not.toContain('{>>');
    expect(v.dom.textContent ?? '').not.toContain('<<}');
    const pill = v.dom.querySelector('.cm-cm-comment-pill');
    expect(pill).toBeTruthy();
    v.destroy();
  });

  it('Document mode: empty substitution `{~~~>~~}` keeps the arrow widget', () => {
    const doc = 'a {~~~>~~} b\nnext';
    const v = setup(doc, doc.length, 'wysiwyg');
    expect(v.dom.textContent ?? '').not.toContain('{~~');
    expect(v.dom.textContent ?? '').not.toContain('~~}');
    expect(v.dom.textContent ?? '').not.toContain('~>');
    const arrow = v.dom.querySelector('.cm-cm-sub-arrow');
    expect(arrow).toBeTruthy();
    // Both old and new sides are empty — placeholders should appear.
    expect(v.dom.querySelector('.cm-cm-empty.cm-cm-sub-old')).toBeTruthy();
    expect(v.dom.querySelector('.cm-cm-empty.cm-cm-sub-new')).toBeTruthy();
    v.destroy();
  });

  // ── Mode-only transaction regression guard — v0.2.8 codex follow-up ──
  // The decoration field must rebuild when a `setEditMode` effect arrives,
  // even if the transaction has no doc change and no selection change. Prior
  // to the fix, `update()` short-circuited on `tr.docChanged || tr.selection`,
  // leaving the previous mode's decorations stale until the next keystroke.
  it('rebuilds decorations on a bare setEditMode effect (no doc/selection change)', () => {
    const doc = 'foo {++ X ++} bar';
    const v = setup(doc, 6); // caret inside the insert span, Live (typora) mode
    // Baseline: Live-mode active-line carve-out applies a `cm-cm-active` mark.
    expect(v.dom.querySelector('.cm-cm-active')).toBeTruthy();
    // Mode-only transaction: no `changes`, no `selection`.
    v.dispatch({ effects: setEditMode.of('wysiwyg') });
    // After the effect, Document mode must have removed the active-line carve-out.
    expect(v.dom.querySelector('.cm-cm-active')).toBeNull();
    v.destroy();
  });
});
