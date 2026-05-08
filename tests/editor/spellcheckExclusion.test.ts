import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { FrontMatterExtension } from '../../src/editor/markdownExt/frontMatter';
import { spellcheckExclusion } from '../../src/editor/spellcheckExclusion';

function setup(doc: string, cursor = 0): EditorView {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [
      markdown({
        base: markdownLanguage,
        extensions: [GFM, FrontMatterExtension],
      }),
      spellcheckExclusion(),
    ],
  });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({ state, parent });
}

/**
 * Returns the concatenated text content of all descendant nodes that have
 * `spellcheck="false"`. A simple way to ask "is this character covered?".
 */
function noSpellcheckText(view: EditorView): string {
  const nodes = view.dom.querySelectorAll('[spellcheck="false"]');
  const parts: string[] = [];
  nodes.forEach((n) => {
    if (n.textContent) parts.push(n.textContent);
  });
  return parts.join('\n');
}

describe('spellcheckExclusion', () => {
  it('marks fenced code block content with spellcheck="false"', () => {
    const v = setup('Prose line.\n\n```\nteh quik braun fox\n```\n', 0);
    expect(noSpellcheckText(v)).toContain('teh quik braun fox');
    v.destroy();
  });

  it('marks inline code with spellcheck="false"', () => {
    const v = setup('Run `teh quik braun` now.', 0);
    expect(noSpellcheckText(v)).toContain('teh quik braun');
    v.destroy();
  });

  it('marks YAML front matter with spellcheck="false"', () => {
    // Caret inside the front matter so the raw YAML is rendered (otherwise
    // it's replaced by a summary widget — but we don't run the front-matter
    // decoration here, so the content shows in either case).
    const doc = '---\ntitle: teh braun\nauthor: braun\n---\n# Body';
    const v = setup(doc, 5);
    expect(noSpellcheckText(v)).toContain('title: teh braun');
    v.destroy();
  });

  it('marks block math with spellcheck="false"', () => {
    const doc = 'Prose.\n\n$$\\frac{teh}{braun}$$\n\nMore prose.';
    const v = setup(doc, 0);
    expect(noSpellcheckText(v)).toContain('\\frac{teh}{braun}');
    v.destroy();
  });

  it('marks inline math with spellcheck="false"', () => {
    const v = setup('Equation $\\teh + \\braun$ here.', 0);
    expect(noSpellcheckText(v)).toContain('\\teh + \\braun');
    v.destroy();
  });

  it('does not mark plain prose with spellcheck="false"', () => {
    const v = setup('teh quik braun fox jumped over the laizy dog.\n', 0);
    // The misspelled prose should NOT appear inside any spellcheck="false"
    // subtree — that's the whole point of the exclusion being scoped.
    expect(noSpellcheckText(v)).not.toContain('teh quik braun fox');
    v.destroy();
  });

  it('leaves prose around inline code spell-checkable', () => {
    const v = setup('teh prose `teh code` more teh prose', 0);
    const off = noSpellcheckText(v);
    // `teh code` (inside backticks) is excluded.
    expect(off).toContain('teh code');
    // The leading "teh prose " sits in a plain text node with no
    // spellcheck attribute, so it must not show up in the false-set output.
    // (The character sequence "teh code" only appears once in the doc.)
    const matches = off.match(/teh prose/g);
    expect(matches).toBeNull();
    v.destroy();
  });
});
