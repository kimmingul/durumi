import { describe, it, expect } from 'vitest';
import {
  addTableRow,
  addTableColumn,
  removeTableRow,
  removeTableColumn,
} from '../../src/editor/markdownExt/tableTransform';

// Convenience: build a fresh 2x2 markdown table source.
const T_2x2 = '| H1 | H2 |\n| --- | --- |\n| a | b |\n';
const T_3x2 = '| H1 | H2 |\n| --- | --- |\n| a | b |\n| c | d |\n';
const T_ALIGN = '| L | C | R | D |\n|:---|:---:|---:|---|\n| 1 | 2 | 3 | 4 |\n';

function lines(s: string): string[] {
  return s.replace(/\n$/, '').split('\n');
}

describe('addTableRow', () => {
  it('refuses to add a row above the header (row 0, above)', () => {
    const out = addTableRow(T_2x2, 0, 'above');
    expect(out).toBe(T_2x2);
  });

  it('adds a row right after the header when (row=0, below)', () => {
    const out = addTableRow(T_2x2, 0, 'below');
    const L = lines(out);
    // Header / delim / new blank row / existing body
    expect(L[0]).toBe('| H1 | H2 |');
    expect(L[1]).toBe('| --- | --- |');
    expect(L[2]).toBe('|   |   |');
    expect(L[3]).toBe('| a | b |');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('adds a row above an existing body row', () => {
    const out = addTableRow(T_3x2, 2, 'above');
    const L = lines(out);
    // Header / delim / row 1 (a,b) / NEW / row 2 (c,d)
    expect(L[2]).toBe('| a | b |');
    expect(L[3]).toBe('|   |   |');
    expect(L[4]).toBe('| c | d |');
  });

  it('adds a row below the last body row (append at end)', () => {
    const out = addTableRow(T_2x2, 1, 'below');
    const L = lines(out);
    expect(L[2]).toBe('| a | b |');
    expect(L[3]).toBe('|   |   |');
  });

  it('produces matching column count for the new row', () => {
    const out = addTableRow(T_ALIGN, 1, 'below');
    const L = lines(out);
    // 4-column table: new row should have 4 cells.
    const last = L[L.length - 1] ?? '';
    // 5 pipes for a 4-col bordered row.
    const pipes = last.match(/\|/g) ?? [];
    expect(pipes.length).toBe(5);
  });

  it('uses given newCellText option when provided', () => {
    const out = addTableRow(T_2x2, 1, 'below', { newCellText: 'x' });
    const L = lines(out);
    expect(L[3]).toBe('| x | x |');
  });

  it('preserves trailing newline absence', () => {
    const noNL = T_2x2.replace(/\n$/, '');
    const out = addTableRow(noNL, 0, 'below');
    expect(out.endsWith('\n')).toBe(false);
  });
});

describe('addTableColumn', () => {
  it('adds a column to the right of col 0 (becomes new col 1)', () => {
    const out = addTableColumn(T_2x2, 0, 'right');
    const L = lines(out);
    expect(L[0]).toBe('| H1 |   | H2 |');
    expect(L[1]).toBe('| --- | --- | --- |');
    expect(L[2]).toBe('| a |   | b |');
  });

  it('adds a column to the left of col 0 (becomes new col 0)', () => {
    const out = addTableColumn(T_2x2, 0, 'left');
    const L = lines(out);
    expect(L[0]).toBe('|   | H1 | H2 |');
    expect(L[1]).toBe('| --- | --- | --- |');
    expect(L[2]).toBe('|   | a | b |');
  });

  it('adds a column to the right of the last col (becomes new last col)', () => {
    const out = addTableColumn(T_2x2, 1, 'right');
    const L = lines(out);
    expect(L[0]).toBe('| H1 | H2 |   |');
    expect(L[1]).toBe('| --- | --- | --- |');
    expect(L[2]).toBe('| a | b |   |');
  });

  it('adds a column with custom newCellText to every row', () => {
    const out = addTableColumn(T_2x2, 1, 'right', { newCellText: 'NEW' });
    const L = lines(out);
    expect(L[0]).toBe('| H1 | H2 | NEW |');
    expect(L[2]).toBe('| a | b | NEW |');
  });

  it('preserves alignment of existing columns when adding a new one', () => {
    const out = addTableColumn(T_ALIGN, 1, 'right');
    const L = lines(out);
    // delim was `|:---|:---:|---:|---|`; after adding at index 2 (between
    // C and R) it should still carry left/center/--- (default new)/right/default.
    expect(L[1]).toBe('|:---|:---:| --- |---:|---|');
  });
});

describe('removeTableRow', () => {
  it('refuses to remove the header (row 0)', () => {
    const out = removeTableRow(T_2x2, 0);
    expect(out).toBe(T_2x2);
  });

  it('removes the first body row', () => {
    const out = removeTableRow(T_3x2, 1);
    const L = lines(out);
    expect(L[0]).toBe('| H1 | H2 |');
    expect(L[1]).toBe('| --- | --- |');
    expect(L[2]).toBe('| c | d |');
    expect(L.length).toBe(3);
  });

  it('removes the last body row', () => {
    const out = removeTableRow(T_3x2, 2);
    const L = lines(out);
    expect(L[0]).toBe('| H1 | H2 |');
    expect(L[1]).toBe('| --- | --- |');
    expect(L[2]).toBe('| a | b |');
    expect(L.length).toBe(3);
  });

  it('removes a middle body row from a 4-row table', () => {
    const T_4 = '| H1 |\n| --- |\n| a |\n| b |\n| c |\n';
    const out = removeTableRow(T_4, 2);
    const L = lines(out);
    expect(L).toEqual(['| H1 |', '| --- |', '| a |', '| c |']);
  });

  it('removing the only body row leaves a header+delim skeleton', () => {
    const out = removeTableRow(T_2x2, 1);
    const L = lines(out);
    expect(L).toEqual(['| H1 | H2 |', '| --- | --- |']);
  });

  it('out-of-range index is a no-op', () => {
    expect(removeTableRow(T_2x2, 99)).toBe(T_2x2);
    expect(removeTableRow(T_2x2, -5)).toBe(T_2x2);
  });
});

describe('removeTableColumn', () => {
  it('removes the first column', () => {
    const out = removeTableColumn(T_2x2, 0);
    const L = lines(out);
    expect(L[0]).toBe('| H2 |');
    expect(L[1]).toBe('| --- |');
    expect(L[2]).toBe('| b |');
  });

  it('removes the last column', () => {
    const out = removeTableColumn(T_2x2, 1);
    const L = lines(out);
    expect(L[0]).toBe('| H1 |');
    expect(L[1]).toBe('| --- |');
    expect(L[2]).toBe('| a |');
  });

  it('removes a middle column from a 4-col table', () => {
    const out = removeTableColumn(T_ALIGN, 1);
    const L = lines(out);
    // L | R | D remain; center marker dropped from delim.
    expect(L[0]).toBe('| L | R | D |');
    expect(L[1]).toBe('|:---|---:|---|');
    expect(L[2]).toBe('| 1 | 3 | 4 |');
  });

  it('refuses to remove the only remaining column', () => {
    const T_1 = '| H1 |\n| --- |\n| a |\n';
    expect(removeTableColumn(T_1, 0)).toBe(T_1);
  });

  it('out-of-range index is a no-op', () => {
    expect(removeTableColumn(T_2x2, 99)).toBe(T_2x2);
    expect(removeTableColumn(T_2x2, -1)).toBe(T_2x2);
  });
});

describe('alignment preservation', () => {
  it('column add at the middle keeps all surviving alignments', () => {
    const out = addTableColumn(T_ALIGN, 0, 'right');
    const L = lines(out);
    // Originally `|:---|:---:|---:|---|` (L, C, R, D). After adding to the
    // right of col 0, new column is at index 1; existing C/R/D shift.
    expect(L[1]).toBe('|:---| --- |:---:|---:|---|');
  });

  it('column delete drops the matching alignment marker', () => {
    // Delete center column (index 1).
    const out = removeTableColumn(T_ALIGN, 1);
    const L = lines(out);
    expect(L[1]).toBe('|:---|---:|---|');
  });

  it('column delete of left-aligned column leaves rest intact', () => {
    const out = removeTableColumn(T_ALIGN, 0);
    const L = lines(out);
    // After removing index 0 (left), remaining alignments are C, R, D.
    expect(L[1]).toBe('|:---:|---:|---|');
  });
});

describe('malformed input safety', () => {
  it('returns src unchanged when there is no delimiter row', () => {
    const bad = '| H1 |\n| a |\n';
    expect(addTableRow(bad, 0, 'below')).toBe(bad);
    expect(addTableColumn(bad, 0, 'right')).toBe(bad);
    expect(removeTableRow(bad, 1)).toBe(bad);
    expect(removeTableColumn(bad, 0)).toBe(bad);
  });

  it('handles tables without leading/trailing pipes', () => {
    const noPipes = 'H1 | H2\n--- | ---\na | b\n';
    const out = addTableRow(noPipes, 1, 'below');
    const L = lines(out);
    // The new row should match the existing pipe-pattern (no outer pipes).
    expect(L[L.length - 1]).toBe('   |   ');
  });
});
