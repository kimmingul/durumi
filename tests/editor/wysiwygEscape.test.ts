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
    // v0.2.20 — `[` and `]` removed from this set so user-typed
    // `[text](url)` parses as a real inline Link (which the v0.2.19
    // hover tooltip + click + right-click menu depend on). See the
    // commentary at the head of wysiwygEscape.ts::ALWAYS_ESCAPE.
    for (const ch of ['#', '>', '<', '*', '_', '`', '~']) {
      expect(escapeMarkdownChar(ch, blank, 0)).toBe('\\' + ch);
    }
  });

  it('v0.2.20: does NOT escape `[` and `]` (enables typed inline links)', () => {
    // Pinning the new contract: brackets stay raw so lezer can produce a
    // Link node. linkDecoration / linkInteract self-gate on
    // `linkHasUrl` so shortcut `[Notes]` still looks literal — no visual
    // regression for the strict-literal WYSIWYG promise.
    expect(escapeMarkdownChar('[', blank, 0)).toBe('[');
    expect(escapeMarkdownChar(']', blank, 0)).toBe(']');
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

  it('does not escape `!` (image-syntax leader stays literal)', () => {
    // v0.2.20 follow-on: `[` is no longer escaped either, so a typed
    // `![alt](src)` round-trips correctly into a real Image node.
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

  it('v0.2.20: does NOT escape `[` (typed inline links must parse)', () => {
    // Pre-v0.2.20 this test expected `\[` so a typed `[Notes]`
    // placeholder rendered as literal `[Notes]`. The link decoration's
    // `linkHasUrl` gate now keeps that visual contract WITHOUT the
    // escape — shortcut links (no URL child) get no `cm-md-link` mark
    // and no bracket-hide widget. Citations `[@key]` keep working too
    // (citation decoration runs on its own node + the parsed Link
    // shape).
    let s = makeState({ mode: 'wysiwyg' });
    s = typeChar(s, '[');
    expect(s.doc.toString()).toBe('[');
    s = typeChar(s, '@');
    expect(s.doc.toString()).toBe('[@');
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

  it('v0.2.20: typed `[Your Name]` placeholder lands raw (no escape)', () => {
    // Was `\[Your Name\]` before v0.2.20. The visual literal-text
    // contract is now upheld at decoration time (linkDecoration skips
    // styling and bracket-hide for shortcut Links that lack a URL
    // child) instead of at typing time. Round-trip to disk now stores
    // the cleaner `[Your Name]` form.
    let s = makeState({ mode: 'wysiwyg' });
    for (const ch of '[Your Name]') {
      s = typeChar(s, ch);
    }
    expect(s.doc.toString()).toBe('[Your Name]');
  });

  it('v0.2.20: typed inline link `[text](url)` lands as a real link', () => {
    // The fix the user reported: hover tooltip + click-to-open were
    // dead in Document mode because the v0.1.12 escape filter rewrote
    // every typed `[` and `]` to `\[` / `\]`, so the lezer parser saw
    // Escape nodes instead of a Link node. This test pins the new
    // pass-through so the v0.2.19 link interactivity works for typed
    // input, not just toolbar-inserted links.
    let s = makeState({ mode: 'wysiwyg' });
    // Sidestep autoPair's `(` → `()` behavior by inserting the URL part
    // as a single chunk after the brackets settle. autoPair only fires
    // for char-at-a-time `input.type` events; a programmatic multi-char
    // insert bypasses it. We assert the doc text, not the interim
    // caret positions.
    for (const ch of '[click]') {
      s = typeChar(s, ch);
    }
    const head = s.selection.main.head;
    const tr = s.update({
      changes: { from: head, to: head, insert: '(https://example.com)' },
    });
    s = tr.state;
    expect(s.doc.toString()).toBe('[click](https://example.com)');
  });

  it('escapes `1.` typed at line start (numbered list defuse)', () => {
    let s = makeState({ mode: 'wysiwyg' });
    s = typeChar(s, '1');
    s = typeChar(s, '.');
    expect(s.doc.toString()).toBe('1\\.');
  });
});
