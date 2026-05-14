import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import {
  cellTextToMarkdown,
  markdownToCellText,
  findCellRange,
  replaceCellText,
  _splitCellSpansEscapeAwareForTest,
} from '../../src/editor/markdownExt/tableEdit';
import { tableDecoration } from '../../src/editor/decorations/table';

describe('cellTextToMarkdown', () => {
  it('passes plain text through', () => {
    expect(cellTextToMarkdown('hello')).toBe('hello');
  });
  it('escapes pipes as \\|', () => {
    expect(cellTextToMarkdown('a|b')).toBe('a\\|b');
  });
  it('doubles backslashes before escaping pipes', () => {
    expect(cellTextToMarkdown('a\\b')).toBe('a\\\\b');
  });
  it('flattens newlines to spaces', () => {
    expect(cellTextToMarkdown('a\nb')).toBe('a b');
    expect(cellTextToMarkdown('a\r\nb')).toBe('a b');
  });
  it('handles empty string', () => {
    expect(cellTextToMarkdown('')).toBe('');
  });
  it('handles Korean text without modification', () => {
    expect(cellTextToMarkdown('가나다')).toBe('가나다');
  });
});

describe('markdownToCellText', () => {
  it('reverses escaped pipes', () => {
    expect(markdownToCellText('a\\|b')).toBe('a|b');
  });
  it('reverses doubled backslashes', () => {
    expect(markdownToCellText('a\\\\b')).toBe('a\\b');
  });
  it('trims surrounding whitespace', () => {
    expect(markdownToCellText('  hello  ')).toBe('hello');
  });
  it('round-trips with cellTextToMarkdown', () => {
    const inputs = ['hello', 'a|b', 'a\\b', '가나다', 'a\\|b|c'];
    for (const s of inputs) {
      expect(markdownToCellText(cellTextToMarkdown(s))).toBe(s);
    }
  });
});

describe('_splitCellSpansEscapeAwareForTest', () => {
  it('handles plain row with leading and trailing pipes', () => {
    const spans = _splitCellSpansEscapeAwareForTest('| H1 | H2 |');
    expect(spans).toHaveLength(2);
    expect(spans[0]).toEqual({ from: 2, to: 4 });
    expect(spans[1]).toEqual({ from: 7, to: 9 });
  });
  it('handles escaped pipe inside a cell', () => {
    const spans = _splitCellSpansEscapeAwareForTest('| a\\|b | c |');
    expect(spans).toHaveLength(2);
    // first span covers `a\|b`
    expect('| a\\|b | c |'.slice(spans[0].from, spans[0].to)).toBe('a\\|b');
    expect('| a\\|b | c |'.slice(spans[1].from, spans[1].to)).toBe('c');
  });
  it('handles row without trailing pipe', () => {
    const spans = _splitCellSpansEscapeAwareForTest('H1 | H2');
    expect(spans).toHaveLength(2);
    expect('H1 | H2'.slice(spans[0].from, spans[0].to)).toBe('H1');
    expect('H1 | H2'.slice(spans[1].from, spans[1].to)).toBe('H2');
  });
});

describe('findCellRange', () => {
  const SRC = '| H1 | H2 |\n| --- | --- |\n| a | b |';

  it('locates header row 0 col 0', () => {
    const r = findCellRange(SRC, 0, 0);
    expect(r).not.toBeNull();
    expect(SRC.slice(r!.from, r!.to)).toBe('H1');
  });
  it('locates header row 0 col 1', () => {
    const r = findCellRange(SRC, 0, 1);
    expect(SRC.slice(r!.from, r!.to)).toBe('H2');
  });
  it('skips the delimiter line — body row 1 col 0', () => {
    const r = findCellRange(SRC, 1, 0);
    expect(SRC.slice(r!.from, r!.to)).toBe('a');
  });
  it('returns null for out-of-range row', () => {
    expect(findCellRange(SRC, 5, 0)).toBeNull();
  });
  it('returns null for out-of-range column', () => {
    expect(findCellRange(SRC, 0, 5)).toBeNull();
  });
  it('returns null when no delimiter line exists', () => {
    const badSrc = '| H1 | H2 |\n| a | b |';
    expect(findCellRange(badSrc, 0, 0)).toBeNull();
  });
  it('locates a cell containing an escaped pipe', () => {
    const src = '| H1 | H2 |\n| --- | --- |\n| a\\|b | c |';
    const r = findCellRange(src, 1, 0);
    expect(src.slice(r!.from, r!.to)).toBe('a\\|b');
  });
});

describe('replaceCellText (integration with EditorView)', () => {
  function makeView(doc: string): EditorView {
    return new EditorView({
      state: EditorState.create({
        doc,
        extensions: [markdown({ base: markdownLanguage, extensions: [GFM] }), tableDecoration()],
      }),
      parent: document.body,
    });
  }

  it('replaces a header cell and updates the document', () => {
    const view = makeView('| H1 | H2 |\n| --- | --- |\n| a | b |');
    const result = replaceCellText(view, 0, view.state.doc.length, 0, 0, 'NEW');
    expect(result).not.toBeNull();
    expect(view.state.doc.toString()).toBe('| NEW | H2 |\n| --- | --- |\n| a | b |');
    view.destroy();
  });

  it('replaces a body cell', () => {
    const view = makeView('| H1 | H2 |\n| --- | --- |\n| a | b |');
    const result = replaceCellText(view, 0, view.state.doc.length, 1, 1, 'NEW');
    expect(result).not.toBeNull();
    expect(view.state.doc.toString()).toBe('| H1 | H2 |\n| --- | --- |\n| a | NEW |');
    view.destroy();
  });

  it('escapes pipes in user-typed cell text', () => {
    const view = makeView('| H1 | H2 |\n| --- | --- |\n| a | b |');
    replaceCellText(view, 0, view.state.doc.length, 1, 0, 'x|y');
    expect(view.state.doc.toString()).toBe('| H1 | H2 |\n| --- | --- |\n| x\\|y | b |');
    view.destroy();
  });

  it('preserves Korean text unchanged', () => {
    const view = makeView('| H1 | H2 |\n| --- | --- |\n| a | b |');
    replaceCellText(view, 0, view.state.doc.length, 1, 0, '가나다');
    expect(view.state.doc.toString()).toBe('| H1 | H2 |\n| --- | --- |\n| 가나다 | b |');
    view.destroy();
  });

  it('returns null when cell coordinates are out of range', () => {
    const view = makeView('| H1 | H2 |\n| --- | --- |\n| a | b |');
    const result = replaceCellText(view, 0, view.state.doc.length, 99, 0, 'x');
    expect(result).toBeNull();
    view.destroy();
  });

  it('uses a non-input.type userEvent so the wysiwygEscape filter ignores it', () => {
    // Smoke test: even if the doc contains a `#`-prefix that the WYSIWYG
    // escape filter would normally backslash, our programmatic cell dispatch
    // must NOT be re-rewritten.
    const view = makeView('| H1 | H2 |\n| --- | --- |\n| a | b |');
    replaceCellText(view, 0, view.state.doc.length, 1, 0, '# x');
    // No `\#` should appear; the filter only acts on `input.type`.
    expect(view.state.doc.toString()).toContain('| # x |');
    view.destroy();
  });
});
