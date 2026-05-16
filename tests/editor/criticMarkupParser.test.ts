import { describe, it, expect } from 'vitest';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { InlineExtrasExtension } from '../../src/editor/markdownExt/inlineExtras';
import { CriticMarkupExtension } from '../../src/editor/markdownExt/criticMarkup';

function setup(doc: string): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [
      markdown({
        base: markdownLanguage,
        // Mirror MarkdownEditor.tsx's extension order so the regression
        // surface is realistic — InlineExtras BEFORE CriticMarkup means our
        // `before: 'Emphasis'` ordering must still beat the existing
        // `==text==`, `~text~`, `~~text~~` parsers.
        extensions: [GFM, InlineExtrasExtension, CriticMarkupExtension],
      }),
    ],
  });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({ state, parent });
}

function nodesOfType(view: EditorView, name: string) {
  const out: Array<{ from: number; to: number }> = [];
  syntaxTree(view.state).iterate({
    enter(node) {
      if (node.name === name) out.push({ from: node.from, to: node.to });
    },
  });
  return out;
}

describe('CriticMarkupExtension parser', () => {
  it('parses {++ ins ++} as CmInsert', () => {
    const v = setup('hello {++ added ++} world');
    const ins = nodesOfType(v, 'CmInsert');
    expect(ins).toHaveLength(1);
    expect(ins[0]).toEqual({ from: 6, to: 19 });
    v.destroy();
  });

  it('parses {-- del --} as CmDelete', () => {
    const v = setup('hello {-- gone --} world');
    const del = nodesOfType(v, 'CmDelete');
    expect(del).toHaveLength(1);
    expect(del[0]!.from).toBe(6);
    v.destroy();
  });

  it('parses {~~ old ~> new ~~} as CmSubstitution with old/new children', () => {
    const v = setup('text {~~old~>new~~} after');
    const sub = nodesOfType(v, 'CmSubstitution');
    expect(sub).toHaveLength(1);
    const oldNodes = nodesOfType(v, 'CmSubOld');
    const newNodes = nodesOfType(v, 'CmSubNew');
    expect(oldNodes).toHaveLength(1);
    expect(newNodes).toHaveLength(1);
    const arrow = nodesOfType(v, 'CmSubArrow');
    expect(arrow).toHaveLength(1);
    v.destroy();
  });

  it('parses {== highlight ==} as CmHighlight, distinct from ==text==', () => {
    const v = setup('start ==plain== then {== tracked ==} end');
    const cm = nodesOfType(v, 'CmHighlight');
    const plain = nodesOfType(v, 'Highlight');
    expect(cm).toHaveLength(1);
    expect(plain).toHaveLength(1);
    expect(cm[0]!.from).toBeGreaterThan(plain[0]!.to);
    v.destroy();
  });

  it('parses {>> note <<} as CmComment', () => {
    const v = setup('text {>> reviewer note <<} after');
    const cmt = nodesOfType(v, 'CmComment');
    expect(cmt).toHaveLength(1);
    const body = nodesOfType(v, 'CmCommentBody');
    expect(body).toHaveLength(1);
    v.destroy();
  });

  // v0.2.14: empty bodies are now ACCEPTED at the parser level so the
  // decoration layer can render a styled placeholder in Document mode
  // (otherwise raw `{++++}` would leak through). The shared (export) path
  // is unaffected — these zero-length tracked-change spans only matter in
  // the live editor where the user can see and complete them.
  it('accepts empty bodies (v0.2.14 — decoration layer renders placeholder)', () => {
    expect(nodesOfType(setup('a {++++} b'), 'CmInsert')).toHaveLength(1);
    expect(nodesOfType(setup('a {----} b'), 'CmDelete')).toHaveLength(1);
    expect(nodesOfType(setup('a {== ==} b'), 'CmHighlight')).toHaveLength(1);
    expect(nodesOfType(setup('a {>><<} b'), 'CmComment')).toHaveLength(1);
    // The zero-length body case must not produce a CmCommentBody child —
    // there is no body text to delimit.
    expect(nodesOfType(setup('a {>><<} b'), 'CmCommentBody')).toHaveLength(0);
  });

  it('rejects unbalanced operators (no closing match)', () => {
    expect(nodesOfType(setup('text {++ no closer'), 'CmInsert')).toHaveLength(0);
    expect(nodesOfType(setup('text {-- no closer'), 'CmDelete')).toHaveLength(0);
    expect(nodesOfType(setup('text {== no closer'), 'CmHighlight')).toHaveLength(0);
  });

  it('rejects multi-line bodies', () => {
    expect(nodesOfType(setup('a {++ line one\nline two ++} b'), 'CmInsert')).toHaveLength(
      0,
    );
  });

  it('rejects substitutions without an arrow', () => {
    expect(nodesOfType(setup('a {~~ no arrow ~~} b'), 'CmSubstitution')).toHaveLength(
      0,
    );
  });

  it('accepts substitutions with empty old or new side (v0.2.14)', () => {
    // Empty-old `{~~~> new ~~}` and empty-new `{~~ old ~>~~}` are now
    // recognised as well-formed substitutions; the decoration layer renders
    // a tiny placeholder on the empty side so the arrow widget still has
    // visible neighbours in Document mode.
    expect(nodesOfType(setup('a {~~~> new ~~} b'), 'CmSubstitution')).toHaveLength(1);
    expect(nodesOfType(setup('a {~~ old ~>~~} b'), 'CmSubstitution')).toHaveLength(1);
    // The empty side does NOT emit a CmSubOld / CmSubNew element.
    expect(nodesOfType(setup('a {~~~>new~~} b'), 'CmSubOld')).toHaveLength(0);
    expect(nodesOfType(setup('a {~~old~>~~} b'), 'CmSubNew')).toHaveLength(0);
  });

  it('beats single-tilde Subscript and double-tilde Strikethrough', () => {
    // The substitution form contains tildes on both sides; our parser must
    // win, with no Subscript or Strikethrough nodes intersecting it.
    const v = setup('x {~~old~>new~~} y');
    expect(nodesOfType(v, 'CmSubstitution')).toHaveLength(1);
    expect(nodesOfType(v, 'Subscript')).toHaveLength(0);
    expect(nodesOfType(v, 'Strikethrough')).toHaveLength(0);
    v.destroy();
  });

  it('coexists with surrounding emphasis and strikethrough', () => {
    const v = setup('*em* {++ ins ++} ~~strike~~');
    expect(nodesOfType(v, 'CmInsert')).toHaveLength(1);
    expect(nodesOfType(v, 'Emphasis')).toHaveLength(1);
    expect(nodesOfType(v, 'Strikethrough')).toHaveLength(1);
    v.destroy();
  });

  it('parses all five operators inside one paragraph', () => {
    const src =
      'a {++ins++} b {-- del --} c {~~ x ~> y ~~} d {== mark ==} e {>> note <<} f';
    const v = setup(src);
    expect(nodesOfType(v, 'CmInsert')).toHaveLength(1);
    expect(nodesOfType(v, 'CmDelete')).toHaveLength(1);
    expect(nodesOfType(v, 'CmSubstitution')).toHaveLength(1);
    expect(nodesOfType(v, 'CmHighlight')).toHaveLength(1);
    expect(nodesOfType(v, 'CmComment')).toHaveLength(1);
    v.destroy();
  });

  it('parses multiple insertions on the same line', () => {
    const v = setup('a {++ one ++} b {++ two ++} c');
    expect(nodesOfType(v, 'CmInsert')).toHaveLength(2);
    v.destroy();
  });

  it('insertion mark spans cover the open and close delimiters exactly', () => {
    const v = setup('hi {++X++} bye');
    const marks = nodesOfType(v, 'CmInsertMark');
    expect(marks).toHaveLength(2);
    expect(marks[0]).toEqual({ from: 3, to: 6 });
    expect(marks[1]).toEqual({ from: 7, to: 10 });
    v.destroy();
  });

  it('does not match `{+ +}` (single-plus is not the operator)', () => {
    expect(nodesOfType(setup('x {+ a +} y'), 'CmInsert')).toHaveLength(0);
  });

  it('does not match braces around plain text', () => {
    expect(nodesOfType(setup('see {note} here'), 'CmInsert')).toHaveLength(0);
    expect(nodesOfType(setup('see {note} here'), 'CmComment')).toHaveLength(0);
  });

  it('escaped delimiters short-circuit by changing the leading char', () => {
    // A backslash-escape in front of `{` makes the next char an Escape node,
    // so the `{` is consumed at pos+1 — our parser doesn't fire there.
    const v = setup('see \\{++ x ++}');
    expect(nodesOfType(v, 'CmInsert')).toHaveLength(0);
    v.destroy();
  });

  it('substitution arrow lands inside the substitution range', () => {
    const v = setup('start {~~old~>new~~} end');
    const sub = nodesOfType(v, 'CmSubstitution')[0]!;
    const arr = nodesOfType(v, 'CmSubArrow')[0]!;
    expect(arr.from).toBeGreaterThan(sub.from);
    expect(arr.to).toBeLessThan(sub.to);
    v.destroy();
  });
});
