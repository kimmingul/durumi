import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { autolinkDecoration, autolinkTheme } from '../../src/editor/decorations/autolink';
import { linkDecoration } from '../../src/editor/decorations/link';

function setup(doc: string, cursor: number) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        markdown({ base: markdownLanguage, extensions: [GFM] }),
        // linkDecoration is included so we verify autolink doesn't double-decorate
        // the URL inside a regular `[text](url)` pair.
        linkDecoration(),
        autolinkDecoration(),
        autolinkTheme,
      ],
    }),
    parent,
  });
  view.dispatch({ selection: { anchor: cursor }, userEvent: 'select' });
  return view;
}

describe('autolinkDecoration', () => {
  it('hides the angle brackets around an autolink when off-line', () => {
    const doc = 'See <https://x.com> end\nnext';
    const v = setup(doc, doc.length);
    const hidden = v.dom.querySelectorAll('.cm-md-marker-hidden');
    expect(hidden.length).toBeGreaterThanOrEqual(2);
    expect(v.dom.innerHTML).toContain('cm-md-autolink');
    v.destroy();
  });

  it('keeps angle brackets visible while caret is on the autolink line', () => {
    const v = setup('See <https://x.com> end', 5);
    const html = v.dom.innerHTML;
    // The brackets aren't replaced when the line is active, so the literal
    // `<` and `>` show up in the rendered text.
    expect(html).toContain('&lt;');
    v.destroy();
  });

  it('marks bare URLs that GFM linkified', () => {
    const doc = 'Check https://example.com today\nnext';
    const v = setup(doc, doc.length);
    expect(v.dom.innerHTML).toContain('cm-md-autolink');
    v.destroy();
  });

  it('does not double-decorate a URL inside `[text](url)`', () => {
    const doc = 'Click [here](https://x.com)\nnext';
    const v = setup(doc, doc.length);
    // Inline-link URL isn't an autolink — the cm-md-autolink class shouldn't
    // appear for the URL portion. (The link decoration hides it instead.)
    expect(v.dom.innerHTML).not.toContain('cm-md-autolink');
    v.destroy();
  });
});
