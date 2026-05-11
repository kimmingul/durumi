import { describe, expect, it } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import {
  editModeStateExtension,
  setEditMode,
} from '../../src/editor/editMode';
import {
  escapeMarkdownChar,
  wysiwygEscapeFilter,
} from '../../src/editor/wysiwygEscape';

function makeState(opts: { doc?: string; mode?: 'wysiwyg' | 'typora' | 'markdown'; caret?: number } = {}) {
  const doc = opts.doc ?? '';
  let state = EditorState.create({
    doc,
    extensions: [editModeStateExtension(), wysiwygEscapeFilter()],
    selection: opts.caret !== undefined ? EditorSelection.cursor(opts.caret) : undefined,
  });
  if (opts.mode && opts.mode !== 'wysiwyg') {
    state = state.update({ effects: setEditMode.of(opts.mode) }).state;
  }
  return state;
}

function typeChar(state: EditorState, ch: string): EditorState {
  const head = state.selection.main.head;
  const tr = state.update({
    changes: { from: head, to: head, insert: ch },
    selection: EditorSelection.cursor(head + ch.length),
    userEvent: 'input.type',
  });
  return tr.state;
}

describe('escapeMarkdownChar (pure)', () => {
  const blank = EditorState.create({ doc: '' });

  it('always escapes the obvious markdown markers', () => {
    for (const ch of ['#', '>', '<', '*', '_', '`', '[', ']', '~']) {
      expect(escapeMarkdownChar(ch, blank, 0)).toBe('\\' + ch);
    }
  });

  it('escapes `-` and `+` only at line start (after whitespace)', () => {
    const s = EditorState.create({ doc: 'hello world\n  foo' });
    // col 0 of line 1
    expect(escapeMarkdownChar('-', s, 0)).toBe('\\-');
    // mid-line 1
    expect(escapeMarkdownChar('-', s, 5)).toBe('-');
    // col 14 = line 2 start + 2 (after 2 spaces) → still whitespace-only prefix
    expect(escapeMarkdownChar('-', s, 14)).toBe('\\-');
  });

  it('escapes `.` only after digits at line start (numbered list trigger)', () => {
    const s = EditorState.create({ doc: '1\n  12\n2025' });
    // After "1" on line 1
    expect(escapeMarkdownChar('.', s, 1)).toBe('\\.');
    // After "  12" on line 2
    expect(escapeMarkdownChar('.', s, 6)).toBe('\\.');
    // After "2025" at start of line 3 — still digits-only prefix → escape
    expect(escapeMarkdownChar('.', s, 11)).toBe('\\.');
  });

  it('does NOT escape `.` mid-line after non-digit text', () => {
    const s = EditorState.create({ doc: 'hello' });
    expect(escapeMarkdownChar('.', s, 5)).toBe('.');
  });

  it('leaves ordinary characters alone', () => {
    for (const ch of ['a', 'Z', '0', ' ', '한', '글', '@', '/', '\\']) {
      expect(escapeMarkdownChar(ch, blank, 0)).toBe(ch);
    }
  });

  it('does not escape `!` (the trailing `[` will be escaped, breaking image syntax)', () => {
    expect(escapeMarkdownChar('!', blank, 0)).toBe('!');
  });
});

describe('wysiwygEscapeFilter (transaction filter)', () => {
  it('escapes a typed `#` in WYSIWYG mode', () => {
    let s = makeState({ mode: 'wysiwyg' });
    s = typeChar(s, '#');
    expect(s.doc.toString()).toBe('\\#');
  });

  it('does NOT escape in Typora mode', () => {
    let s = makeState({ mode: 'typora' });
    s = typeChar(s, '#');
    expect(s.doc.toString()).toBe('#');
  });

  it('does NOT escape in Markdown source mode', () => {
    let s = makeState({ mode: 'markdown' });
    s = typeChar(s, '#');
    expect(s.doc.toString()).toBe('#');
  });

  it('escapes inline emphasis markers `*` and `_`', () => {
    let s = makeState({ mode: 'wysiwyg' });
    s = typeChar(s, '*');
    expect(s.doc.toString()).toBe('\\*');
    s = typeChar(s, '_');
    expect(s.doc.toString()).toBe('\\*\\_');
  });

  it('escapes `[` (Citation is toolbar-only in WYSIWYG mode)', () => {
    let s = makeState({ mode: 'wysiwyg' });
    s = typeChar(s, '[');
    expect(s.doc.toString()).toBe('\\[');
    // Even followed by `@`, no special exception.
    s = typeChar(s, '@');
    expect(s.doc.toString()).toBe('\\[@');
  });

  it('escapes `-` at line start but not mid-line', () => {
    let s = makeState({ mode: 'wysiwyg', doc: 'a b ', caret: 4 });
    s = typeChar(s, '-');
    // After the trailing space, char at col 4 — `before` contains 'a b ' which
    // is not whitespace-only, so `-` should NOT be escaped.
    expect(s.doc.toString()).toBe('a b -');
    // Now newline + `-` at column 0 of new line.
    s = typeChar(s, '\n');
    s = typeChar(s, '-');
    expect(s.doc.toString()).toBe('a b -\n\\-');
  });

  it('escapes `.` after digits at line start (numbered list defuse)', () => {
    let s = makeState({ mode: 'wysiwyg', doc: '1', caret: 1 });
    s = typeChar(s, '.');
    expect(s.doc.toString()).toBe('1\\.');
  });

  it('leaves the resulting selection at the new caret', () => {
    let s = makeState({ mode: 'wysiwyg' });
    s = typeChar(s, '#');
    // Doc is `\#` (2 chars), caret at 2.
    expect(s.selection.main.head).toBe(2);
  });

  it('does not double-escape when the same char is typed twice', () => {
    let s = makeState({ mode: 'wysiwyg' });
    s = typeChar(s, '*');
    s = typeChar(s, '*');
    expect(s.doc.toString()).toBe('\\*\\*');
  });

  it('lets programmatic dispatches (no `input.type` userEvent) pass through unescaped', () => {
    let s = makeState({ mode: 'wysiwyg' });
    // Simulate the toolbar Bold button: dispatch without userEvent.
    const tr = s.update({ changes: { from: 0, to: 0, insert: '**bold**' } });
    s = tr.state;
    expect(s.doc.toString()).toBe('**bold**');
  });

  it('leaves multi-char insertions (paste) alone', () => {
    let s = makeState({ mode: 'wysiwyg' });
    const tr = s.update({
      changes: { from: 0, to: 0, insert: '# Heading' },
      userEvent: 'input.paste',
    });
    s = tr.state;
    expect(s.doc.toString()).toBe('# Heading');
  });

  it('escapes < and > so typed HTML tags become literal text', () => {
    // User types `<sup>1</sup>` char-by-char in WYSIWYG mode. Each `<`, `>`,
    // and `/` is single-char input. `<`, `>` escape; letters/digits/`/`
    // pass through. Result: `\<sup\>1\</sup\>` — markdown parser treats
    // these as literal text instead of HTML superscript.
    let s = makeState({ mode: 'wysiwyg' });
    for (const ch of '<sup>1</sup>') {
      s = typeChar(s, ch);
    }
    expect(s.doc.toString()).toBe('\\<sup\\>1\\</sup\\>');
  });

  it('escapes a typed `[Your Name]` placeholder fully', () => {
    let s = makeState({ mode: 'wysiwyg' });
    for (const ch of '[Your Name]') {
      s = typeChar(s, ch);
    }
    expect(s.doc.toString()).toBe('\\[Your Name\\]');
  });

  it('escapes `1.` typed at line start (numbered list defuse)', () => {
    let s = makeState({ mode: 'wysiwyg' });
    s = typeChar(s, '1');
    s = typeChar(s, '.');
    expect(s.doc.toString()).toBe('1\\.');
  });
});
