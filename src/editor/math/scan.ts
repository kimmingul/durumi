import type { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

export interface MathRange {
  from: number;
  to: number;
  tex: string;
}

export type InlineMathRange = MathRange;
export type BlockMathRange = MathRange;

export interface SkipRange {
  from: number;
  to: number;
}

const SKIP_NODES = new Set(['FencedCode', 'CodeBlock', 'HTMLBlock', 'InlineCode']);

/**
 * Walks the syntax tree and collects ranges for code regions where math should
 * not be parsed. These are: fenced code blocks, indented code blocks, HTML
 * blocks, and inline code spans.
 */
export function getSkipRanges(state: EditorState): SkipRange[] {
  const ranges: SkipRange[] = [];
  const tree = syntaxTree(state);
  tree.iterate({
    enter(node) {
      if (SKIP_NODES.has(node.name)) {
        ranges.push({ from: node.from, to: node.to });
      }
    },
  });
  return ranges;
}

function isInsideAny(pos: number, ranges: { from: number; to: number }[]): boolean {
  for (const r of ranges) {
    if (pos >= r.from && pos < r.to) return true;
  }
  return false;
}

function overlapsAny(
  from: number,
  to: number,
  ranges: { from: number; to: number }[],
): boolean {
  for (const r of ranges) {
    if (from < r.to && to > r.from) return true;
  }
  return false;
}

// Block math: `$$...$$` (lazy match across newlines), not preceded by `\`.
const BLOCK_MATH_RE = /(?<!\\)\$\$([\s\S]+?)\$\$/g;

// Inline math: `$...$` on a single line, not preceded by `\`. The body may not
// start or end with whitespace (so adjacency rule rejects `$5 and $10`), and
// may not contain newlines or unescaped `$`. Body is either a single non-space
// char or a length-2+ sequence with non-space ends.
const INLINE_MATH_RE = /(?<!\\)\$([^\s$][^\n$]*?[^\s$\\]|[^\s$\\])\$/g;

/**
 * Find block math ranges (`$$...$$`) in the document. Block math may span
 * newlines. Skips matches inside code regions (fenced code, code blocks,
 * HTML blocks, inline code).
 */
export function scanBlockMath(state: EditorState): BlockMathRange[] {
  const text = state.doc.toString();
  const skips = getSkipRanges(state);
  const out: BlockMathRange[] = [];
  for (const m of text.matchAll(BLOCK_MATH_RE)) {
    const idx = m.index;
    if (idx === undefined) continue;
    const from = idx;
    const to = idx + m[0].length;
    if (overlapsAny(from, to, skips)) continue;
    out.push({ from, to, tex: m[1]! });
  }
  return out;
}

/**
 * Find inline math ranges (`$...$`) in the document. Skips matches inside
 * code regions and matches that overlap any block math range.
 */
export function scanInlineMath(state: EditorState, blocks: BlockMathRange[]): InlineMathRange[] {
  const text = state.doc.toString();
  const skips = getSkipRanges(state);
  const out: InlineMathRange[] = [];
  for (const m of text.matchAll(INLINE_MATH_RE)) {
    const idx = m.index;
    if (idx === undefined) continue;
    const from = idx;
    const to = idx + m[0].length;
    if (overlapsAny(from, to, skips)) continue;
    if (overlapsAny(from, to, blocks)) continue;
    // The body group (m[1]) is whichever alternation matched.
    const tex = m[1]!;
    out.push({ from, to, tex });
  }
  return out;
}

// Re-exported helper so consumers can reuse the inside-check.
export function isPosInsideRanges(pos: number, ranges: { from: number; to: number }[]): boolean {
  return isInsideAny(pos, ranges);
}
