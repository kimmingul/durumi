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

function setup(doc: string, cursor: number) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
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
  view.dispatch({ selection: { anchor: cursor }, userEvent: 'select' });
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

  it('shows source verbatim when caret is on the line (active-line invariant)', () => {
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
});
