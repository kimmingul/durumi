import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { __test } from '../../src/editor/atomicInlineMarks';
import { editModeStateExtension, setEditMode } from '../../src/editor/editMode';
import { userActiveExtension } from '../../src/editor/decorations/activeLine';
import { FrontMatterExtension } from '../../src/editor/markdownExt/frontMatter';
import { InlineExtrasExtension } from '../../src/editor/markdownExt/inlineExtras';
import { EditorView } from '@codemirror/view';

const { findInlineMarkAtEdge } = __test;

function stateFor(doc: string, cursor = 0): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [
      // Match the production parser surface for the gates we care
      // about — GFM for emphasis variants and FrontMatterExtension so
      // the FrontMatter ancestor check in isInsideCodeIsland actually
      // sees a FrontMatter node when the doc starts with `---\n...\n---`.
      markdown({ base: markdownLanguage, extensions: [GFM, FrontMatterExtension, InlineExtrasExtension] }),
      editModeStateExtension(),
      userActiveExtension(),
    ],
  });
}

function armUserActive(view: EditorView): void {
  view.dispatch({
    selection: { anchor: view.state.selection.main.anchor },
    userEvent: 'select',
  });
}

describe('findInlineMarkAtEdge — Bold (`**`)', () => {
  it('returns null when the lookup runs and nothing matches', () => {
    const doc = 'plain text';
    const state = stateFor(doc, 0);
    expect(findInlineMarkAtEdge(state, 0, 'backward')).toBeNull();
  });

});

describe('findInlineMarkAtEdge — Backspace boundaries', () => {
  it('Backspace at node.to (just after closing **) fires', () => {
    const doc = '**bold**';
    const state = stateFor(doc, doc.length);
    expect(findInlineMarkAtEdge(state, doc.length, 'backward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Backspace at closeStart (end of visible label, before hidden **) fires', () => {
    const doc = '**bold**';
    // closeStart = to - 2 = 6 → caret between 'd' and the closing '**'
    const state = stateFor(doc, doc.length - 2);
    expect(findInlineMarkAtEdge(state, doc.length - 2, 'backward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Backspace at openEnd (start of visible label, after hidden **) fires', () => {
    const doc = '**bold**';
    // openEnd = from + 2 = 2 → caret between '**' and 'b'
    const state = stateFor(doc, 2);
    expect(findInlineMarkAtEdge(state, 2, 'backward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Backspace in MIDDLE of label does not fire (label-editable)', () => {
    const doc = '**bold**';
    // caret between 'bo' and 'ld' (pos 4) — must NOT collapse the whole node
    const state = stateFor(doc, 4);
    expect(findInlineMarkAtEdge(state, 4, 'backward')).toBeNull();
  });

  it('Backspace JUST BEFORE node.from does not fire', () => {
    const doc = '**bold** trailing';
    const state = stateFor(doc, 0);
    expect(findInlineMarkAtEdge(state, 0, 'backward')).toBeNull();
  });

  it('Both `**` and `__` heads are accepted', () => {
    const doc = '__bold__';
    const state = stateFor(doc, doc.length);
    expect(findInlineMarkAtEdge(state, doc.length, 'backward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Mismatched markers are rejected (head !== tail contract)', () => {
    // CommonMark requires the same delimiter on both sides; Lezer
    // does not emit StrongEmphasis for `**bold__`. inlineMarkBounds
    // also enforces head === tail defensively so a future parser
    // change cannot silently widen the contract.
    const doc = '**bold__';
    const state = stateFor(doc, doc.length);
    expect(findInlineMarkAtEdge(state, doc.length, 'backward')).toBeNull();
  });
});

describe('findInlineMarkAtEdge — Delete boundaries', () => {
  it('Delete at node.from (just before opening **) fires', () => {
    const doc = '**bold**';
    const state = stateFor(doc, 0);
    expect(findInlineMarkAtEdge(state, 0, 'forward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Delete at closeStart (end of label, before hidden **) fires', () => {
    const doc = '**bold**';
    const state = stateFor(doc, doc.length - 2);
    expect(findInlineMarkAtEdge(state, doc.length - 2, 'forward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Delete in MIDDLE of label does not fire', () => {
    const doc = '**bold**';
    const state = stateFor(doc, 4);
    expect(findInlineMarkAtEdge(state, 4, 'forward')).toBeNull();
  });
});

describe('findInlineMarkAtEdge — gating', () => {
  it('does not fire in Typora mode when the bold is on the active line', () => {
    const doc = '**bold**';
    const baseState = stateFor(doc, doc.length);
    const view = new EditorView({
      state: baseState,
      parent: document.body.appendChild(document.createElement('div')),
    });
    view.dispatch({ effects: setEditMode.of('typora') });
    armUserActive(view);
    expect(findInlineMarkAtEdge(view.state, doc.length, 'backward')).toBeNull();
    view.destroy();
  });

  it('fires in WYSIWYG mode regardless of active line', () => {
    const doc = '**bold**';
    const baseState = stateFor(doc, doc.length);
    const view = new EditorView({
      state: baseState,
      parent: document.body.appendChild(document.createElement('div')),
    });
    view.dispatch({ effects: setEditMode.of('wysiwyg') });
    armUserActive(view);
    expect(findInlineMarkAtEdge(view.state, doc.length, 'backward')).toEqual({
      from: 0,
      to: doc.length,
    });
    view.destroy();
  });

  it('does not fire inside fenced code blocks', () => {
    const doc = '```\n**not really bold**\n```\n';
    const boldFakeEnd = doc.indexOf('**\n```');
    const state = stateFor(doc, boldFakeEnd);
    expect(findInlineMarkAtEdge(state, boldFakeEnd, 'backward')).toBeNull();
  });

  it('does not fire inside inline code spans (`` `**…**` ``)', () => {
    // CommonMark forbids emphasis inside code spans; the InlineCode
    // ancestor check in isInsideCodeIsland is the belt-and-braces
    // guard. Principle §3 (code-island sovereignty).
    const doc = 'see `**not bold**` end';
    const closeBacktick = doc.lastIndexOf('`') + 1;
    const state = stateFor(doc, closeBacktick);
    expect(findInlineMarkAtEdge(state, closeBacktick, 'backward')).toBeNull();
  });

  it('does not fire inside front matter (YAML block at doc start)', () => {
    // FrontMatter content is opaque YAML; even if a value visually
    // contains `**…**`, it must not collapse atomically.
    const doc = '---\ntitle: **draft**\n---\nbody\n';
    const inFm = doc.indexOf('**draft**') + '**draft**'.length;
    const state = stateFor(doc, inFm);
    expect(findInlineMarkAtEdge(state, inFm, 'backward')).toBeNull();
  });

  it('does not fire in Markdown (Source) mode regardless of active line', () => {
    // Markdown mode strips liveDecorations; emphasis.ts does not
    // run; the `**` markers are user-visible source. Atomic ranges
    // installed from the syntax tree alone would freeze caret motion
    // — wrong. shouldApplyAtomic must short-circuit on this mode.
    const doc = '**bold**';
    const baseState = stateFor(doc, doc.length);
    const view = new EditorView({
      state: baseState,
      parent: document.body.appendChild(document.createElement('div')),
    });
    view.dispatch({ effects: setEditMode.of('markdown') });
    armUserActive(view);
    expect(findInlineMarkAtEdge(view.state, doc.length, 'backward')).toBeNull();
    view.destroy();
  });
});

describe('findInlineMarkAtEdge — Italic (`*` / `_`)', () => {
  // Spec-driven design: ITALIC_SPEC uses markerLen=1 against
  // 'Emphasis' nodes. Boundary positions for `*ital*` (length 6):
  //   from=0, openEnd=1, closeStart=5, to=6.

  it('Backspace at node.to (just after closing *) fires on Emphasis', () => {
    const doc = '*ital*';
    const state = stateFor(doc, doc.length);
    expect(findInlineMarkAtEdge(state, doc.length, 'backward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Backspace at closeStart (end of label, before hidden *) fires', () => {
    const doc = '*ital*';
    // closeStart = to - 1 = 5 → caret between 'l' and the closing '*'
    const state = stateFor(doc, doc.length - 1);
    expect(findInlineMarkAtEdge(state, doc.length - 1, 'backward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Backspace at openEnd (start of label, after hidden *) fires', () => {
    const doc = '*ital*';
    // openEnd = from + 1 = 1 → caret between '*' and 'i'
    const state = stateFor(doc, 1);
    expect(findInlineMarkAtEdge(state, 1, 'backward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Backspace in middle of italic label does not fire (label-editable)', () => {
    const doc = '*ital*';
    // caret between 'it' and 'al' (pos 3)
    const state = stateFor(doc, 3);
    expect(findInlineMarkAtEdge(state, 3, 'backward')).toBeNull();
  });

  it('Delete at node.from (just before opening *) fires', () => {
    const doc = '*ital*';
    const state = stateFor(doc, 0);
    expect(findInlineMarkAtEdge(state, 0, 'forward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Both `*` and `_` italic delimiters are accepted', () => {
    const doc = '_ital_';
    const state = stateFor(doc, doc.length);
    expect(findInlineMarkAtEdge(state, doc.length, 'backward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Mismatched italic markers (`*ital_`) are rejected by head === tail', () => {
    // CommonMark would not emit Emphasis here; the head === tail
    // check in inlineMarkBounds is the belt-and-braces guard.
    const doc = '*ital_';
    const state = stateFor(doc, doc.length);
    expect(findInlineMarkAtEdge(state, doc.length, 'backward')).toBeNull();
  });

  it('Italic INSIDE Bold (`**foo *bar* baz**`) — both atomic ranges fire independently', () => {
    // Verifies the spec-driven array iteration: the same syntax-
    // tree walk should match StrongEmphasis at the outer node AND
    // Emphasis at the inner node without one masking the other.
    // Caret at the end of the inner italic `*bar*` (just after
    // its closing `*`) must fire on the italic, not the bold.
    const doc = '**foo *bar* baz**';
    const innerItalicEnd = doc.indexOf('*bar*') + '*bar*'.length;
    const state = stateFor(doc, innerItalicEnd);
    const italicFrom = doc.indexOf('*bar*');
    expect(findInlineMarkAtEdge(state, innerItalicEnd, 'backward')).toEqual({
      from: italicFrom,
      to: innerItalicEnd,
    });
  });

  it('Single asterisk (`*` not followed by content) does not fire', () => {
    // Bare punctuation — no Emphasis node emitted, so no atomic
    // delete trigger. Char-by-char delete must proceed normally.
    const doc = 'a * b';
    const state = stateFor(doc, doc.length);
    expect(findInlineMarkAtEdge(state, doc.length, 'backward')).toBeNull();
  });
});

describe('findInlineMarkAtEdge — Strikethrough (`~~`)', () => {
  // Spec-driven design: STRIKE_SPEC uses markerLen=2 against
  // 'Strikethrough' nodes. Boundary positions for `~~strike~~` (length 10):
  //   from=0, openEnd=2, closeStart=8, to=10.

  it('Backspace at node.to (just after closing ~~) fires on Strikethrough', () => {
    const doc = '~~strike~~';
    const state = stateFor(doc, doc.length);
    expect(findInlineMarkAtEdge(state, doc.length, 'backward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Backspace at closeStart (end of label, before hidden ~~) fires — REGRESSION GUARD', () => {
    const doc = '~~strike~~';
    // closeStart = to - 2 = 8 → caret between 'e' and the closing '~~'
    const state = stateFor(doc, doc.length - 2);
    expect(findInlineMarkAtEdge(state, doc.length - 2, 'backward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Backspace at openEnd (start of label, after hidden ~~) fires', () => {
    const doc = '~~strike~~';
    // openEnd = from + 2 = 2 → caret between '~~' and 's'
    const state = stateFor(doc, 2);
    expect(findInlineMarkAtEdge(state, 2, 'backward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Backspace in middle of strike label does not fire (label-editable)', () => {
    const doc = '~~strike~~';
    // caret between 'str' and 'ike' (pos 5)
    const state = stateFor(doc, 5);
    expect(findInlineMarkAtEdge(state, 5, 'backward')).toBeNull();
  });

  it('Delete at node.from (just before opening ~~) fires', () => {
    const doc = '~~strike~~';
    const state = stateFor(doc, 0);
    expect(findInlineMarkAtEdge(state, 0, 'forward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Backspace on mismatched-marker doc skipped (parser-quirk guard)', () => {
    // Parser does not emit Strikethrough for `~~text` without a closing `~~`.
    // inlineMarkBounds also enforces head === tail defensively.
    const doc = '~~text';
    const state = stateFor(doc, doc.length);
    expect(findInlineMarkAtEdge(state, doc.length, 'backward')).toBeNull();
  });

  it('Strikethrough inside Bold (`**foo ~~bar~~ baz**`) — inner Strikethrough fires independently at its boundary', () => {
    // Verifies the spec-driven array iteration: the same syntax-tree
    // walk matches StrongEmphasis at the outer node AND Strikethrough
    // at the inner node without one masking the other.
    const doc = '**foo ~~bar~~ baz**';
    const innerStrikeEnd = doc.indexOf('~~bar~~') + '~~bar~~'.length;
    const innerStrikeStart = doc.indexOf('~~bar~~');
    const state = stateFor(doc, innerStrikeEnd);
    expect(findInlineMarkAtEdge(state, innerStrikeEnd, 'backward')).toEqual({
      from: innerStrikeStart,
      to: innerStrikeEnd,
    });
  });
});

describe('findInlineMarkAtEdge — Highlight (`==`)', () => {
  // HIGHLIGHT_SPEC uses markerLen=2 against Highlight nodes from
  // InlineExtrasExtension. Boundary positions for `==hl==` (length 6):
  //   from=0, openEnd=2, closeStart=4, to=6.

  it('Backspace at node.to fires on ==hl==', () => {
    const doc = '==hl==';
    const state = stateFor(doc, doc.length);
    expect(findInlineMarkAtEdge(state, doc.length, 'backward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Backspace at closeStart fires (zero-width hidden marker regression)', () => {
    const doc = '==hl==';
    const closeStart = doc.length - 2;
    const state = stateFor(doc, closeStart);
    expect(findInlineMarkAtEdge(state, closeStart, 'backward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Backspace at openEnd fires', () => {
    const doc = '==hl==';
    const openEnd = 2;
    const state = stateFor(doc, openEnd);
    expect(findInlineMarkAtEdge(state, openEnd, 'backward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Backspace in middle of label does NOT fire (label-editable)', () => {
    const doc = '==hl==';
    const middle = doc.indexOf('l');
    const state = stateFor(doc, middle);
    expect(findInlineMarkAtEdge(state, middle, 'backward')).toBeNull();
  });

  it('Delete at node.from fires', () => {
    const doc = '==hl==';
    const state = stateFor(doc, 0);
    expect(findInlineMarkAtEdge(state, 0, 'forward')).toEqual({
      from: 0,
      to: doc.length,
    });
  });

  it('Mismatched marker rejected (==hl__ head !== tail)', () => {
    const doc = '==hl__';
    const state = stateFor(doc, doc.length);
    expect(findInlineMarkAtEdge(state, doc.length, 'backward')).toBeNull();
  });

  it('Highlight inside Bold (`**foo ==bar== baz**`) inner Highlight fires at its boundary independently', () => {
    const doc = '**foo ==bar== baz**';
    const innerHighlightEnd = doc.indexOf('==bar==') + '==bar=='.length;
    const innerHighlightFrom = doc.indexOf('==bar==');
    const state = stateFor(doc, innerHighlightEnd);
    expect(findInlineMarkAtEdge(state, innerHighlightEnd, 'backward')).toEqual({
      from: innerHighlightFrom,
      to: innerHighlightEnd,
    });
  });
});

describe('findInlineMarkAtEdge — Subscript (`~`)', () => {
  it('Backspace at node.to (just after closing ~) fires on Subscript', () => {
    const doc = 'H~2~O';
    const pos = 4; // 'H~2~' end
    const state = stateFor(doc, pos);
    expect(findInlineMarkAtEdge(state, pos, 'backward')).toEqual({ from: 1, to: 4 });
  });

  it('Backspace at closeStart (zero-width regression guard) fires', () => {
    const doc = 'H~2~O';
    const pos = 3; // between '2' and closing '~'
    const state = stateFor(doc, pos);
    expect(findInlineMarkAtEdge(state, pos, 'backward')).toEqual({ from: 1, to: 4 });
  });

  it('Backspace at openEnd fires', () => {
    const doc = 'H~2~O';
    const pos = 2; // between opening '~' and '2'
    const state = stateFor(doc, pos);
    expect(findInlineMarkAtEdge(state, pos, 'backward')).toEqual({ from: 1, to: 4 });
  });

  it('Backspace in MIDDLE does NOT fire', () => {
    const doc = 'a~xyz~b';
    const pos = 3; // between 'x' and 'y'
    const state = stateFor(doc, pos);
    expect(findInlineMarkAtEdge(state, pos, 'backward')).toBeNull();
  });

  it('Delete at node.from fires', () => {
    const doc = 'H~2~O';
    const pos = 1; // before opening '~'
    const state = stateFor(doc, pos);
    expect(findInlineMarkAtEdge(state, pos, 'forward')).toEqual({ from: 1, to: 4 });
  });

  it('Subscript parser requires non-whitespace inside; "~ ~" does not parse', () => {
    const doc = '~ ~';
    const state = stateFor(doc, doc.length);
    expect(findInlineMarkAtEdge(state, doc.length, 'backward')).toBeNull();
  });

  it('Mismatched "~text^" is rejected', () => {
    const doc = '~text^';
    const state = stateFor(doc, doc.length);
    expect(findInlineMarkAtEdge(state, doc.length, 'backward')).toBeNull();
  });

  it('Subscript INSIDE Bold (**H~2~O**)', () => {
    const doc = '**H~2~O**';
    const subStart = doc.indexOf('~2~');
    const subEnd = subStart + '~2~'.length;
    const state = stateFor(doc, subEnd);
    expect(findInlineMarkAtEdge(state, subEnd, 'backward')).toEqual({
      from: subStart,
      to: subEnd,
    });
  });
});
