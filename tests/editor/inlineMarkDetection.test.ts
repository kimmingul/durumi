import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { InlineExtrasExtension } from '../../src/editor/markdownExt/inlineExtras';
import { inlineMarksAt } from '../../src/editor/markdownExt/inlineMarkDetection';

function makeState(doc: string, anchor: number): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [
      markdown({ base: markdownLanguage, extensions: [GFM, InlineExtrasExtension] }),
    ],
  });
}

describe('inlineMarksAt', () => {
  it('flags bold inside **text**', () => {
    // Doc: `**bold**` — caret at index 4 (inside "bold").
    const state = makeState('**bold**', 4);
    const m = inlineMarksAt(state, 4);
    expect(m.bold).toBe(true);
    expect(m.italic).toBe(false);
  });

  it('flags italic inside *text*', () => {
    const state = makeState('*ital*', 3);
    const m = inlineMarksAt(state, 3);
    expect(m.italic).toBe(true);
    expect(m.bold).toBe(false);
  });

  it('flags both bold + italic inside ***x***', () => {
    const state = makeState('***x***', 4);
    const m = inlineMarksAt(state, 4);
    expect(m.bold).toBe(true);
    expect(m.italic).toBe(true);
  });

  it('flags strike inside ~~text~~', () => {
    const state = makeState('~~gone~~', 4);
    const m = inlineMarksAt(state, 4);
    expect(m.strike).toBe(true);
  });

  it('flags code inside `text`', () => {
    const state = makeState('`code`', 3);
    const m = inlineMarksAt(state, 3);
    expect(m.code).toBe(true);
  });

  it('flags sup inside HTML <sup>…</sup>', () => {
    const state = makeState('x<sup>2</sup>', 7);
    const m = inlineMarksAt(state, 7);
    expect(m.sup).toBe(true);
  });

  it('flags sub inside HTML <sub>…</sub>', () => {
    const state = makeState('H<sub>2</sub>O', 7);
    const m = inlineMarksAt(state, 7);
    expect(m.sub).toBe(true);
  });

  it('returns nothing for plain text', () => {
    const state = makeState('plain text', 3);
    const m = inlineMarksAt(state, 3);
    expect(m.bold).toBe(false);
    expect(m.italic).toBe(false);
    expect(m.strike).toBe(false);
    expect(m.code).toBe(false);
    expect(m.sup).toBe(false);
    expect(m.sub).toBe(false);
  });

  it('returns nothing for caret outside an HTML tag pair', () => {
    const state = makeState('x<sup>2</sup> after', 17);
    const m = inlineMarksAt(state, 17);
    expect(m.sup).toBe(false);
  });
});
