import katex from 'katex';
import { escapeHtml } from './escapeHtml';

/** Render an inline math expression to KaTeX HTML. */
export function renderInline(tex: string): string {
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `<span class="katex-error">${escapeHtml(msg)}</span>`;
  }
}

/** Render a block (display) math expression to KaTeX HTML. */
export function renderBlock(tex: string): string {
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `<span class="katex-error">${escapeHtml(msg)}</span>`;
  }
}

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
const SKIP_TAGS = new Set(['pre', 'code', 'script', 'style']);

interface SkipRange {
  from: number;
  to: number;
}

/**
 * Walk an HTML string and return ranges (`{from, to}` indices into the input
 * string) of text that lies inside `<pre>`, `<code>`, `<script>`, or
 * `<style>` elements. The returned ranges cover the inner text only — they
 * exclude the opening and closing tags themselves.
 */
function getHtmlSkipRanges(html: string): SkipRange[] {
  // Stack entries: { tag, end } where `end` is the index just past the
  // opening tag (the start of skipped content).
  const stack: { tag: string; end: number }[] = [];
  const ranges: SkipRange[] = [];
  for (const m of html.matchAll(TAG_RE)) {
    const idx = m.index;
    if (idx === undefined) continue;
    const full = m[0];
    const name = m[1]!.toLowerCase();
    const attrs = m[2] ?? '';
    const isClose = full.startsWith('</');
    const isSelfClose = !isClose && (attrs.endsWith('/') || full.endsWith('/>'));
    if (!SKIP_TAGS.has(name)) continue;
    if (isClose) {
      // Pop matching frames until we find this tag (handles nesting).
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]!.tag === name) {
          const opening = stack[i]!;
          ranges.push({ from: opening.end, to: idx });
          stack.splice(i, 1);
          break;
        }
      }
    } else if (!isSelfClose) {
      stack.push({ tag: name, end: idx + full.length });
    }
  }
  return ranges;
}

function indexInSkip(idx: number, ranges: SkipRange[]): boolean {
  for (const r of ranges) {
    if (idx >= r.from && idx < r.to) return true;
  }
  return false;
}

const BLOCK_RE = /\$\$([\s\S]+?)\$\$/g;
// For inline, capture an optional preceding char so we can keep it (and reject
// `\$` escapes). The body matches the same shape as the editor scanner.
const INLINE_RE = /(^|[^\\])\$([^\s$][^\n$]*?[^\s$\\]|[^\s$\\])\$/g;

/**
 * Replace `$$...$$` and `$...$` in an HTML string with rendered KaTeX HTML,
 * skipping content inside `<pre>`, `<code>`, `<script>`, `<style>`. Block math
 * is processed first so that block bodies are rendered as displays before
 * inline scanning runs over the resulting HTML.
 */
export function injectMath(html: string): string {
  // Fast path: docs without `$` cannot contain math; skip the full
  // tag-scan + two matchAll walks. Math-free docs are the common case.
  if (!html.includes('$')) return html;
  // First pass: block math.
  const skipsBlock = getHtmlSkipRanges(html);
  let resultBlock = '';
  let last = 0;
  for (const m of html.matchAll(BLOCK_RE)) {
    const idx = m.index;
    if (idx === undefined) continue;
    if (indexInSkip(idx, skipsBlock)) continue;
    resultBlock += html.slice(last, idx);
    resultBlock += renderBlock(m[1]!);
    last = idx + m[0].length;
  }
  resultBlock += html.slice(last);

  // Second pass: inline math (recompute skip ranges since indices changed).
  const skipsInline = getHtmlSkipRanges(resultBlock);
  let resultInline = '';
  last = 0;
  for (const m of resultBlock.matchAll(INLINE_RE)) {
    const idx = m.index;
    if (idx === undefined) continue;
    const lead = m[1] ?? '';
    const dollarIdx = idx + lead.length;
    if (indexInSkip(dollarIdx, skipsInline)) continue;
    resultInline += resultBlock.slice(last, idx);
    resultInline += lead + renderInline(m[2]!);
    last = idx + m[0].length;
  }
  resultInline += resultBlock.slice(last);
  return resultInline;
}
