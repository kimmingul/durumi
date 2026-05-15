// Phase 3.3 (v0.2.6) — per-table line styling plugin.
//
// Walks the live document at a given offset and resolves the table style
// metadata that travels with the table source. Two wire formats are
// supported:
//
//   1. Pandoc attribute block — `{.durumi-table ...}` on its own line
//      immediately preceding the table (blank lines between the block
//      and the table are allowed).
//
//   2. HTML wrapper — `<div class="durumi-table" data-...>` block on
//      its own line above the table; closing `</div>` after the table.
//
// The parser scans the raw text in the EditorState (NOT the lezer
// markdown tree, which doesn't always include the wrapper / attr block
// as a child of `Table`). Pure helpers also accept plain strings so the
// logic is exercised by vitest without an EditorView.

import type { EditorState } from '@codemirror/state';
import {
  isDefaultStyle,
  isHtmlWrapperCloseLine,
  isHtmlWrapperOpenLine,
  isPandocAttrLine,
  parseHtmlWrapper,
  parsePandocAttrs,
  serializeHtmlWrapper,
  serializePandocAttrs,
  type TableStyle,
  type TableStyleSerialized,
} from '../../../shared/tableStyle';

/**
 * Resolve the style metadata for the table starting at `tableFrom` in
 * `state`. Looks at the line(s) immediately above the table for a Pandoc
 * attr block or an HTML wrapper's opening tag. Returns `{source:'none'}`
 * with an empty style when no metadata is present.
 */
export function resolveTableStyle(
  state: EditorState,
  tableFrom: number,
): TableStyleSerialized {
  const tableStart = state.doc.lineAt(tableFrom);
  // Skip blank lines walking upward.
  let lineNumber = tableStart.number - 1;
  while (lineNumber >= 1) {
    const line = state.doc.line(lineNumber);
    const text = line.text;
    if (text.trim().length === 0) {
      lineNumber--;
      continue;
    }
    if (isPandocAttrLine(text)) {
      const style = parsePandocAttrs(text) ?? {};
      return { source: 'pandoc', style };
    }
    if (isHtmlWrapperOpenLine(text)) {
      const style = parseHtmlWrapper(text) ?? {};
      return { source: 'html', style };
    }
    // Anything else means there's no metadata directly preceding the table.
    break;
  }
  return { source: 'none', style: {} };
}

// ─── pure helpers for non-editor contexts (tests / export) ───────────────

/**
 * Pure-string variant: given a full document text and a byte offset that
 * lies inside (or at the start of) a markdown table, walk backwards to
 * find the wire-format wrapper. Used by export so the renderHtml path can
 * pick up the same metadata.
 */
export function resolveTableStyleFromText(
  doc: string,
  tableOffset: number,
): TableStyleSerialized {
  // Find the start-of-line that contains `tableOffset`.
  let lineStart = tableOffset;
  while (lineStart > 0 && doc[lineStart - 1] !== '\n') lineStart--;
  // Walk upward through prior lines.
  let cursor = lineStart - 1; // newline before the table line
  while (cursor > 0) {
    // Find the prior line's bounds.
    const prevEnd = cursor; // the `\n` we landed on
    let prevStart = prevEnd;
    while (prevStart > 0 && doc[prevStart - 1] !== '\n') prevStart--;
    const lineText = doc.slice(prevStart, prevEnd);
    if (lineText.trim().length === 0) {
      // Skip blank line, continue upward.
      cursor = prevStart - 1;
      continue;
    }
    if (isPandocAttrLine(lineText)) {
      return { source: 'pandoc', style: parsePandocAttrs(lineText) ?? {} };
    }
    if (isHtmlWrapperOpenLine(lineText)) {
      return { source: 'html', style: parseHtmlWrapper(lineText) ?? {} };
    }
    break;
  }
  return { source: 'none', style: {} };
}

export interface TableWrapperSpan {
  /** Inclusive offset where the Pandoc attr block / HTML opening div starts. */
  prefixFrom: number;
  /** Exclusive offset where the prefix ends (typically `prefix newline`). */
  prefixTo: number;
  /** Inclusive offset where the closing `</div>` line starts (html only). */
  suffixFrom: number | null;
  /** Exclusive offset where the suffix ends. */
  suffixTo: number | null;
  source: 'pandoc' | 'html' | 'none';
}

/**
 * Locate the byte ranges of the existing wrapper around a table, if any.
 * Used by the writer so a style change knows what to delete / replace.
 */
export function locateTableWrapperSpan(
  state: EditorState,
  tableFrom: number,
  tableTo: number,
): TableWrapperSpan {
  const result: TableWrapperSpan = {
    prefixFrom: tableFrom,
    prefixTo: tableFrom,
    suffixFrom: null,
    suffixTo: null,
    source: 'none',
  };
  // Walk upward.
  const tableStart = state.doc.lineAt(tableFrom);
  let lineNum = tableStart.number - 1;
  let blankRunFrom: number | null = null;
  while (lineNum >= 1) {
    const line = state.doc.line(lineNum);
    if (line.text.trim().length === 0) {
      // Remember the earliest blank line we saw — we'll include them in
      // the wrapper span so deletion produces a clean source.
      if (blankRunFrom === null) blankRunFrom = line.from;
      lineNum--;
      continue;
    }
    if (isPandocAttrLine(line.text)) {
      result.source = 'pandoc';
      result.prefixFrom = line.from;
      result.prefixTo = Math.min(state.doc.length, tableStart.from);
      return result;
    }
    if (isHtmlWrapperOpenLine(line.text)) {
      result.source = 'html';
      result.prefixFrom = line.from;
      result.prefixTo = Math.min(state.doc.length, tableStart.from);
      // Now find the matching closing </div>.
      const tableEndLine = state.doc.lineAt(Math.min(state.doc.length, tableTo));
      for (let n = tableEndLine.number + 1; n <= state.doc.lines; n++) {
        const candidate = state.doc.line(n);
        if (candidate.text.trim().length === 0) continue;
        if (isHtmlWrapperCloseLine(candidate.text)) {
          result.suffixFrom = tableEndLine.to;
          result.suffixTo = Math.min(state.doc.length, candidate.to);
          break;
        }
        // Any other content interrupts the wrapper.
        break;
      }
      return result;
    }
    break;
  }
  void blankRunFrom; // reserved for future blank-line cleanup
  return result;
}

/**
 * Compute the markdown source replacement for a styled table:
 * given the original `tableSrc`, the target `style`, and the desired
 * wire `format`, produce the bytes the writer should splice into the
 * document.
 *
 * When `style` is the Durumi default, return the bare `tableSrc` so
 * no metadata leaks into the source.
 */
export function applyStyleToTable(
  tableSrc: string,
  style: TableStyle,
  format: 'pandoc' | 'html',
  opts: { stripDefault: boolean } = { stripDefault: true },
): string {
  if (opts.stripDefault && isDefaultStyle(style)) {
    return tableSrc;
  }
  if (format === 'pandoc') {
    return `${serializePandocAttrs(style)}\n\n${tableSrc.replace(/^\s+/, '')}`;
  }
  return serializeHtmlWrapper(style, tableSrc) + (tableSrc.endsWith('\n') ? '\n' : '');
}
