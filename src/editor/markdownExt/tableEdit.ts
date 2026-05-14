// Phase 3.1.1 — table-cell edit helpers.
//
// These pure functions support the in-place contentEditable cell editor in
// `decorations/table.ts`. They are kept free of CodeMirror imports where
// possible so they can be unit-tested with simple string fixtures.
//
// The model: a "table source" is the slice of markdown that the Lezer
// `Table` node spans — first byte of the header `|` through last byte of the
// final body row's trailing `|`. Rows are indexed *logically*: row 0 is the
// header, row 1+ are body rows. The delimiter row (`| --- | --- |`) is
// skipped in the logical index because it is not user-editable cell content
// (alignment is a separate concern handled by the toolbar in a future phase).
//
// Pipe-escape contract: a literal `|` inside a cell must appear as `\|` in
// the markdown source, otherwise it terminates the cell. `cellTextToMarkdown`
// applies that escape; `markdownToCellText` reverses it and also trims the
// outer spaces that the parser conventionally inserts.

import { EditorView } from '@codemirror/view';

/**
 * Convert a user-facing cell string to its markdown form.
 *
 * - Backslashes are doubled first (`\` → `\\`) to avoid creating spurious
 *   escapes when the user types a literal backslash followed by a pipe.
 * - Pipes become `\|` so they don't terminate the cell on round-trip.
 * - Newlines collapse to a space — markdown tables are single-line per row
 *   in GFM, so a newline inside a cell would break the table structure.
 */
export function cellTextToMarkdown(cellText: string): string {
  return cellText
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

/**
 * Inverse of `cellTextToMarkdown`. Handles `\\` → `\` and `\|` → `|`. Also
 * trims the outer whitespace that markdown tables conventionally include
 * around cell text.
 */
export function markdownToCellText(cellMd: string): string {
  // Two-pass because the simple replace order matters: process escapes left
  // to right, treating `\\` as a literal backslash that does not consume the
  // following character.
  let out = '';
  for (let i = 0; i < cellMd.length; i++) {
    const ch = cellMd[i];
    if (ch === '\\' && i + 1 < cellMd.length) {
      const next = cellMd[i + 1];
      if (next === '\\' || next === '|') {
        out += next;
        i++;
        continue;
      }
    }
    out += ch;
  }
  return out.trim();
}

/**
 * Locate the byte range of a specific cell within `tableSource`. The
 * returned `{ from, to }` is *relative to the start of `tableSource`*. The
 * caller is expected to add `tableNode.from` to convert into absolute doc
 * coordinates.
 *
 * Returns the trimmed inner span — i.e. the content the user sees as the
 * cell text, NOT including the surrounding spaces or the pipe delimiters.
 *
 * Returns `null` if the row/col is out of range, or if the table source is
 * malformed (e.g. only a header row, no body).
 */
export function findCellRange(
  tableSource: string,
  row: number,
  col: number,
): { from: number; to: number } | null {
  return findCellRangeImpl(tableSource, row, col, false);
}

/**
 * Like `findCellRange` but returns the FULL span between the cell's pipe
 * delimiters, including the surrounding spaces. Used by `replaceCellText`
 * so the dispatched change overwrites the existing padding rather than
 * leaving stale spaces around the new text.
 */
export function findCellPipeSpan(
  tableSource: string,
  row: number,
  col: number,
): { from: number; to: number } | null {
  return findCellRangeImpl(tableSource, row, col, true);
}

function findCellRangeImpl(
  tableSource: string,
  row: number,
  col: number,
  fullSpan: boolean,
): { from: number; to: number } | null {
  const lines = splitLinesWithOffsets(tableSource);
  // Identify the delimiter line so we can map logical row indices to
  // physical line indices.
  const delimRe = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;
  const physicalRows: number[] = [];
  let delimIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text;
    if (delimRe.test(text.trim())) {
      delimIdx = i;
      continue;
    }
    if (text.includes('|')) physicalRows.push(i);
  }
  if (delimIdx === -1) return null;
  // Logical row 0 is the line before delimIdx (header); subsequent logical
  // rows are the body rows after delimIdx, in document order.
  const logicalToPhysical: number[] = [];
  for (const idx of physicalRows) {
    if (idx < delimIdx) {
      // Only the immediately-preceding line is the header in well-formed
      // GFM tables. Take the last one before delim as the header.
      logicalToPhysical[0] = idx;
    } else {
      logicalToPhysical.push(idx);
    }
  }
  if (row < 0 || row >= logicalToPhysical.length) return null;
  const lineIdx = logicalToPhysical[row];
  const line = lines[lineIdx];
  const cells = splitCellSpansEscapeAware(line.text, fullSpan);
  if (col < 0 || col >= cells.length) return null;
  const span = cells[col];
  return {
    from: line.from + span.from,
    to: line.from + span.to,
  };
}

/**
 * High-level helper that replaces a single cell's text in the document. The
 * caller provides the absolute `tableFrom` / `tableTo` so we can read the
 * current table source from the live editor state — that way concurrent
 * edits never operate on a stale slice.
 *
 * The dispatch carries a custom `userEvent` so the WYSIWYG strict-literal
 * filter (which only acts on `input.type`) doesn't backslash-escape the new
 * cell text. Table cells are inherently a literal-text surface — the
 * markdown-side escaping is handled by `cellTextToMarkdown`.
 */
export function replaceCellText(
  view: EditorView,
  tableFrom: number,
  tableTo: number,
  row: number,
  col: number,
  newCellText: string,
): { absoluteFrom: number; absoluteTo: number; insertedLength: number } | null {
  const src = view.state.sliceDoc(tableFrom, tableTo);
  const local = findCellPipeSpan(src, row, col);
  if (!local) return null;
  // We overwrite the FULL between-pipes range (incl. padding) with a
  // canonical ` <text> ` so the row stays visually aligned and the rebuild
  // produces consistent column widths.
  const escaped = cellTextToMarkdown(newCellText);
  const md = escaped.length === 0 ? '   ' : ' ' + escaped + ' ';
  const absoluteFrom = tableFrom + local.from;
  const absoluteTo = tableFrom + local.to;
  view.dispatch({
    changes: { from: absoluteFrom, to: absoluteTo, insert: md },
    // Custom userEvent — not 'input.type' — so wysiwygEscape ignores us.
    userEvent: 'input.cellEdit',
  });
  return {
    absoluteFrom,
    absoluteTo: absoluteFrom + md.length,
    insertedLength: md.length,
  };
}

interface LineSpan {
  from: number;
  to: number;
  text: string;
}

function splitLinesWithOffsets(src: string): LineSpan[] {
  const out: LineSpan[] = [];
  let from = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') {
      out.push({ from, to: i, text: src.slice(from, i) });
      from = i + 1;
    }
  }
  if (from <= src.length) {
    out.push({ from, to: src.length, text: src.slice(from) });
  }
  return out;
}

/**
 * Parse a single row line and return per-cell ranges. Unescaped `|`
 * separates cells; `\|` is treated as a literal pipe inside a cell.
 *
 * `fullSpan` controls trimming:
 *  - `false` (default) — return the trim-stripped inner span (just the
 *    user-visible cell text).
 *  - `true` — return the FULL between-pipes span including padding
 *    whitespace. Used by `replaceCellText` so dispatched changes
 *    overwrite existing padding instead of stacking spaces.
 */
function splitCellSpansEscapeAware(
  rowText: string,
  fullSpan = false,
): { from: number; to: number }[] {
  // First, locate every unescaped `|` position.
  const pipes: number[] = [];
  for (let i = 0; i < rowText.length; i++) {
    if (rowText[i] === '|') {
      // Count preceding backslashes to determine escape.
      let bs = 0;
      let j = i - 1;
      while (j >= 0 && rowText[j] === '\\') {
        bs++;
        j--;
      }
      if (bs % 2 === 0) pipes.push(i);
    }
  }
  // Trim leading/trailing pipe. Standard GFM rows have both.
  const leadingPipe = pipes.length > 0 && /^\s*\|/.test(rowText);
  const trailingPipe = pipes.length > 0 && /\|\s*$/.test(rowText);
  const start = leadingPipe ? 0 : -1;
  const cellStarts: number[] = [];
  const cellEnds: number[] = [];
  for (let i = 0; i < pipes.length; i++) {
    if (i === 0 && leadingPipe) continue;
    cellEnds.push(pipes[i]);
  }
  if (!trailingPipe) cellEnds.push(rowText.length);
  const prev = leadingPipe ? pipes[0] : start;
  // Build start positions to align with cellEnds.
  cellStarts.push(prev + 1);
  for (let i = leadingPipe ? 1 : 0; i < pipes.length - (trailingPipe ? 1 : 0); i++) {
    cellStarts.push(pipes[i] + 1);
  }
  // Per-cell range. In `fullSpan` mode we keep the raw between-pipes bytes
  // (including padding spaces); otherwise we trim whitespace.
  const out: { from: number; to: number }[] = [];
  for (let i = 0; i < cellEnds.length; i++) {
    const rawFrom = cellStarts[i];
    const rawTo = cellEnds[i];
    if (fullSpan) {
      out.push({ from: rawFrom, to: rawTo });
      continue;
    }
    let f = rawFrom;
    let t = rawTo;
    while (f < t && /\s/.test(rowText[f])) f++;
    while (t > f && /\s/.test(rowText[t - 1])) t--;
    out.push({ from: f, to: t });
  }
  return out;
}

// Test-only export
export { splitCellSpansEscapeAware as _splitCellSpansEscapeAwareForTest };
