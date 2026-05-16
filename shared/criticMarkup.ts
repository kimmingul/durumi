/**
 * Single source of truth for the CriticMarkup track-changes notation.
 *
 * Used by:
 *   - the renderer hook `useDocCriticMarkup` (sidebar tab + status badges)
 *   - the export pipeline (`renderHtml.ts`, Pandoc pre-processing)
 *
 * The CodeMirror live decoration uses its own lezer-tree walker, but BOTH
 * paths share the same gating rules so the sidebar list, status counts,
 * and exported document agree by construction.
 *
 * Operators (https://fletcher.github.io/MultiMarkdown-6/syntax/critic.html):
 *
 *   {++ added ++}        insertion
 *   {-- deleted --}      deletion
 *   {~~ old ~> new ~~}   substitution (old replaced by new)
 *   {== marked ==}       highlight (review-tracked, distinct from `==text==`)
 *   {>> note <<}         inline reviewer comment
 *
 * Code-fence safety: anything inside ``` / ~~~ fenced code is never an
 * operator (mirrors the same approach in `shared/comments.ts`).
 *
 * Multi-line bodies are rejected. If a `{++` opens but the closing `++}`
 * isn't found on the same logical line, the run is left untouched as plain
 * text.
 */

import { escapeHtml } from './escapeHtml';

export type CmKind = 'insert' | 'delete' | 'substitution' | 'highlight' | 'comment';

export interface CmAnnotation {
  kind: CmKind;
  /** Byte offset of the opening `{xx`. */
  from: number;
  /** Byte offset just past the closing `xx}`. */
  to: number;
  /** 1-based line number of the opening. */
  line: number;
  /** Inner body text for ins/del/highlight/comment (trimmed). */
  text: string;
  /** Substitution-only: the `old` side (trimmed). */
  oldText?: string;
  /** Substitution-only: the `new` side (trimmed). */
  newText?: string;
}

const FENCE_RE = /^(```|~~~)/;

interface RawMatch {
  kind: CmKind;
  /** Index relative to the line of the opening `{`. */
  open: number;
  /** Index relative to the line of the start of the closing `xx}`. */
  close: number;
  /** For substitution only. */
  arrow?: number;
}

/**
 * Scans `line` for a single CriticMarkup run starting at or after `cursor`.
 * Returns the leftmost match, or null when none. The matcher tries each of
 * the five openers in order — first hit wins.
 */
function nextMatch(line: string, cursor: number): RawMatch | null {
  let best: RawMatch | null = null;
  // We look for `{++`, `{--`, `{~~`, `{==`, `{>>` and pair them with their
  // matching closers.
  const tryAt = (openIdx: number): RawMatch | null => {
    const a = line[openIdx + 1];
    const b = line[openIdx + 2];
    if (a === undefined || b === undefined) return null;
    if (a !== b) return null;
    if (a === '+') return findCloser(line, openIdx, '+', 'insert');
    if (a === '-') return findCloser(line, openIdx, '-', 'delete');
    if (a === '=') return findCloser(line, openIdx, '=', 'highlight');
    if (a === '~') return findSubstitution(line, openIdx);
    if (a === '>') return findCloser(line, openIdx, '<', 'comment');
    return null;
  };
  let i = cursor;
  while (i < line.length) {
    const open = line.indexOf('{', i);
    if (open < 0) return best;
    const m = tryAt(open);
    if (m) {
      const curBest = best as RawMatch | null;
      if (curBest === null) {
        best = m;
      } else if (m.open < curBest.open) {
        best = m;
      }
      // First valid match wins (we scan left-to-right).
      return best;
    }
    i = open + 1;
  }
  return best;
}

function findCloser(
  line: string,
  open: number,
  closeChar: string,
  kind: CmKind,
): RawMatch | null {
  // Body starts at open + 3 (`{xx`). Find the first `xx}` after.
  const bodyStart = open + 3;
  const closer = closeChar + closeChar + '}';
  const close = line.indexOf(closer, bodyStart);
  if (close < 0) return null;
  if (close <= bodyStart) return null;
  const body = line.slice(bodyStart, close);
  if (body.trim().length === 0) return null;
  return { kind, open, close };
}

function findSubstitution(line: string, open: number): RawMatch | null {
  const bodyStart = open + 3;
  const close = line.indexOf('~~}', bodyStart);
  if (close < 0) return null;
  if (close <= bodyStart) return null;
  const arrow = line.indexOf('~>', bodyStart);
  if (arrow < 0 || arrow >= close) return null;
  const oldStr = line.slice(bodyStart, arrow);
  const newStr = line.slice(arrow + 2, close);
  if (oldStr.trim().length === 0 || newStr.trim().length === 0) return null;
  return { kind: 'substitution', open, close, arrow };
}

export function parseCmAnnotations(src: string): CmAnnotation[] {
  const out: CmAnnotation[] = [];
  const lines = src.split('\n');
  const lineStart: number[] = new Array(lines.length);
  {
    let acc = 0;
    for (let i = 0; i < lines.length; i++) {
      lineStart[i] = acc;
      acc += (lines[i] ?? '').length + 1;
    }
  }
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const ls = lineStart[i] ?? 0;
    if (FENCE_RE.test(line.trimStart())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    let cursor = 0;
    while (cursor < line.length) {
      const m = nextMatch(line, cursor);
      if (!m) break;
      const bodyStart = m.open + 3;
      const close = m.close;
      if (m.kind === 'substitution' && m.arrow !== undefined) {
        const oldText = line.slice(bodyStart, m.arrow).trim();
        const newText = line.slice(m.arrow + 2, close).trim();
        out.push({
          kind: 'substitution',
          from: ls + m.open,
          to: ls + close + 3,
          line: i + 1,
          text: `${oldText} → ${newText}`,
          oldText,
          newText,
        });
      } else {
        const inner = line.slice(bodyStart, close).trim();
        out.push({
          kind: m.kind,
          from: ls + m.open,
          to: ls + close + 3,
          line: i + 1,
          text: inner,
        });
      }
      cursor = close + 3;
    }
  }
  return out;
}

/**
 * Rewrites `src` by transforming each CriticMarkup run.
 *
 *   accept × insert       → keep inner only
 *   accept × delete       → drop entirely
 *   accept × substitution → keep `newText` only
 *   accept × highlight    → keep inner wrapped in `==text==` (HTML target)
 *                           or unwrapped (Pandoc target)
 *   accept × comment      → drop entirely
 *
 *   preserve × insert       → <ins>{inner}</ins>           |  [{inner}]{.insertion}
 *   preserve × delete       → <del>{inner}</del>           |  [{inner}]{.deletion}
 *   preserve × substitution → <del>old</del><ins>new</ins> |  [old]{.deletion}[new]{.insertion}
 *   preserve × highlight    → <mark class="cm-highlight">…</mark>
 *                                                          |  [{inner}]{.highlight}
 *   preserve × comment      → <aside class="cm-comment">…</aside>
 *                                                          |  fenced div ::: comment
 */
export function transformCm(
  src: string,
  mode: 'accept' | 'preserve',
  target: 'html' | 'pandoc',
): string {
  const ann = parseCmAnnotations(src);
  if (ann.length === 0) return src;
  let out = src;
  for (let i = ann.length - 1; i >= 0; i--) {
    const a = ann[i];
    if (!a) continue;
    const replacement = renderCm(a, mode, target);
    out = out.slice(0, a.from) + replacement + out.slice(a.to);
  }
  return out;
}

function renderCm(
  a: CmAnnotation,
  mode: 'accept' | 'preserve',
  target: 'html' | 'pandoc',
): string {
  if (mode === 'accept') {
    switch (a.kind) {
      case 'insert':
        return a.text;
      case 'delete':
        return '';
      case 'substitution':
        return a.newText ?? '';
      case 'highlight':
        // HTML: re-wrap so markdown-it-mark renders <mark>. Pandoc: leave bare
        // (Pandoc has no first-class highlight semantics in plain markdown).
        return target === 'html' ? `==${a.text}==` : a.text;
      case 'comment':
        return '';
    }
  }
  // preserve mode
  if (target === 'html') {
    // Annotation text is unescaped user input. We wrap it in raw HTML tags
    // (<ins>, <del>, <mark>, <aside>) so the rest of the markdown-it pipeline
    // does not see it as Markdown — which means *we* are responsible for
    // escaping it. Without this, a `{++<script>...++}` in a third-party
    // manuscript would survive into the exported HTML.
    switch (a.kind) {
      case 'insert':
        return `<ins>${escapeHtml(a.text)}</ins>`;
      case 'delete':
        return `<del>${escapeHtml(a.text)}</del>`;
      case 'substitution':
        return `<del>${escapeHtml(a.oldText ?? '')}</del><ins>${escapeHtml(a.newText ?? '')}</ins>`;
      case 'highlight':
        return `<mark class="cm-highlight">${escapeHtml(a.text)}</mark>`;
      case 'comment':
        return `<aside class="cm-comment">${escapeHtml(a.text)}</aside>`;
    }
  }
  // pandoc target
  switch (a.kind) {
    case 'insert':
      return `[${a.text}]{.insertion}`;
    case 'delete':
      return `[${a.text}]{.deletion}`;
    case 'substitution':
      return `[${a.oldText ?? ''}]{.deletion}[${a.newText ?? ''}]{.insertion}`;
    case 'highlight':
      return `[${a.text}]{.highlight}`;
    case 'comment':
      return `\n\n::: comment\n${a.text}\n:::\n\n`;
  }
}
