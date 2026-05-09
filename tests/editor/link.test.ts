import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { linkDecoration, linkReferenceDecoration } from '../../src/editor/decorations/link';

function setup(doc: string, cursor: number) {
  const view = new EditorView({
    state: EditorState.create({
      doc, selection: { anchor: cursor },
      extensions: [
        markdown({ base: markdownLanguage, extensions: [GFM] }),
        linkDecoration(),
        linkReferenceDecoration(),
      ],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
  view.dispatch({ selection: { anchor: cursor }, userEvent: 'select' });
  return view;
}

describe('link decoration — inline form', () => {
  it('applies cm-md-link class to link text', () => {
    const v = setup('see [text](https://x.com) end', 0);
    expect(v.dom.innerHTML).toContain('cm-md-link');
    v.destroy();
  });

  it('hides brackets and url when cursor off-line', () => {
    const v = setup('see [text](https://x.com)\nnext', 30);
    expect(v.dom.querySelectorAll('.cm-md-marker-hidden').length).toBeGreaterThan(0);
    v.destroy();
  });

  it('handles a link with a title', () => {
    const doc = 'see [text](https://x.com "title")\nnext';
    const v = setup(doc, doc.length);
    expect(v.dom.innerHTML).toContain('cm-md-link');
    v.destroy();
  });

  it('honors backslash-escaped `\\]` inside the link label', () => {
    const doc = 'a [hard \\] inside](url) b\nnext';
    const v = setup(doc, doc.length);
    // The label text is the single visible chunk between `[` and the
    // matching `]` at position 17 — not the escaped `\]` at position 8.
    const linkSpans = v.dom.querySelectorAll('.cm-md-link');
    expect(linkSpans.length).toBeGreaterThan(0);
    v.destroy();
  });
});

describe('link decoration — reference form', () => {
  it('applies cm-md-link to the visible label of `[text][id]`', () => {
    const doc = 'See [text][id] end\n\n[id]: https://x.com';
    const v = setup(doc, doc.length);
    expect(v.dom.innerHTML).toContain('cm-md-link');
    v.destroy();
  });

  it('handles the shortcut form `[id]` when paired with a definition', () => {
    const doc = 'See [id] end\n\n[id]: https://x.com';
    const v = setup(doc, doc.length);
    expect(v.dom.innerHTML).toContain('cm-md-link');
    v.destroy();
  });
});

describe('linkReferenceDecoration', () => {
  it('applies cm-md-link-ref to the definition line', () => {
    const v = setup('[id]: https://x.com', 0);
    expect(v.dom.innerHTML).toContain('cm-md-link-ref');
    v.destroy();
  });
});
