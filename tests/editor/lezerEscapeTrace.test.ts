import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { syntaxTree } from '@codemirror/language';

/**
 * v0.1.12 diagnostic — confirm what Lezer markdown's syntax tree looks
 * like for escaped sequences. If Lezer creates Link / HTMLTag / ListMark
 * nodes despite the leading `\`, then escape doesn't prevent rendering
 * decorations from firing — we'd need a different strategy in WYSIWYG.
 */
function dumpTree(src: string): string {
  const state = EditorState.create({
    doc: src,
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
  });
  const tree = syntaxTree(state);
  const out: string[] = [];
  tree.iterate({
    enter(node) {
      out.push(`${node.name}@${node.from}-${node.to}=${JSON.stringify(src.slice(node.from, node.to))}`);
    },
  });
  return out.join('\n');
}

describe('Lezer markdown — escape sequence treatment', () => {
  it('\\[Text\\] should not produce a Link node', () => {
    const dump = dumpTree('\\[Text\\]');
    // eslint-disable-next-line no-console
    console.log('TREE for \\[Text\\]:\n' + dump);
    expect(dump).not.toMatch(/Link@/);
  });

  it('\\<sup\\>1\\</sup\\> should not produce HTMLTag / HTMLBlock', () => {
    const dump = dumpTree('\\<sup\\>1\\</sup\\>');
    // eslint-disable-next-line no-console
    console.log('TREE for \\<sup\\>...:\n' + dump);
    expect(dump).not.toMatch(/HTMLTag@/);
    expect(dump).not.toMatch(/HTMLBlock@/);
  });

  it('1\\. item should not produce OrderedList / ListItem', () => {
    const dump = dumpTree('1\\. item');
    // eslint-disable-next-line no-console
    console.log('TREE for 1\\. item:\n' + dump);
    expect(dump).not.toMatch(/OrderedList@/);
    expect(dump).not.toMatch(/ListItem@/);
  });

  it('control case: [Text] WITHOUT escape — Link node EXPECTED', () => {
    const dump = dumpTree('[Text]');
    // eslint-disable-next-line no-console
    console.log('TREE for [Text]:\n' + dump);
    // No explicit assertion — just for the snapshot.
  });

  it('user manuscript line — what nodes need hiding on the active line', () => {
    const src =
      '**Authors:** [Your Name]<sup>1</sup>, Min-Gul Kim<sup>2,3,4,\\*</sup>';
    const dump = dumpTree(src);
    // eslint-disable-next-line no-console
    console.log('TREE for manuscript line:\n' + dump);
  });

  it('ATX heading line — what nodes need hiding', () => {
    const dump = dumpTree('# Model-dependent behavioural bias in large-language-model');
    // eslint-disable-next-line no-console
    console.log('TREE for heading:\n' + dump);
  });

  it('inline link with URL [label](https://x.com)', () => {
    const dump = dumpTree('[label](https://x.com)');
    // eslint-disable-next-line no-console
    console.log('TREE for [label](url):\n' + dump);
  });

  it('numbered list line', () => {
    const dump = dumpTree('1. [Your Department], Jeonbuk National University Hospital');
    // eslint-disable-next-line no-console
    console.log('TREE for numbered list:\n' + dump);
  });

  it('Corresponding author line with email autolink and link reference', () => {
    const src = '\\*Corresponding author: Min-Gul Kim, MD, PhD; mgkim@jbnu.ac.kr; ORCID: [to be added]';
    const dump = dumpTree(src);
    // eslint-disable-next-line no-console
    console.log('TREE for corresponding line:\n' + dump);
  });
});
