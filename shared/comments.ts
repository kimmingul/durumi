/**
 * Single source of truth for the `%% memo %%` annotation syntax.
 *
 * Used by:
 *   - the renderer hook `useDocComments` (sidebar + status bar)
 *   - the export pipeline (`renderHtml.ts`, Pandoc pre-processing)
 *
 * The CodeMirror live decoration uses its own lezer-tree walker, but BOTH
 * paths share the same gating rules so the sidebar list, status bar count,
 * and exported document agree by construction.
 *
 * Syntax:
 *   - Inline: `%% text %%` on a single line. The text right after `%%` and
 *     right before the closing `%%` must be non-space (mirrors the
 *     `==highlight==` rule). Empty content is rejected. Triple `%%%` rejects.
 *   - Block: a line containing only `%%` (with optional surrounding whitespace)
 *     opens a multi-line memo; another `%%`-only line closes it. Inner blank
 *     lines are allowed.
 *   - Optional tag prefix: the first whitespace-delimited token inside the
 *     comment body, matching `@\w[\w-]*:?`, is extracted as the tag.
 *
 * Code-fence safety: `%%` inside ``` fenced code is never a comment.
 */

export interface Comment {
  /** Byte offset of the opening `%%` in the source. */
  from: number;
  /** Byte offset just past the closing `%%`. */
  to: number;
  /** 1-based line number of the opening `%%`. */
  line: number;
  /** Lowercased tag without the leading `@` and without trailing `:`, or null. */
  tag: string | null;
  /** Inner body text minus the tag prefix, trimmed. */
  text: string;
  /** True when the memo was a block-form `%%\n…\n%%`. */
  block: boolean;
}

const FENCE_RE = /^(```|~~~)/;
const TAG_RE = /^@([A-Za-z][A-Za-z0-9_-]*):?(?:\s|$)/;

/**
 * Walks the document line-by-line. Inline matches scan within a single line
 * after the fence-aware filter. Block matches consume contiguous lines.
 */
export function parseComments(src: string): Comment[] {
  const out: Comment[] = [];
  const lines = src.split('\n');

  // Compute the byte offset of the start of each line so we can return
  // absolute `from`/`to` positions.
  const lineStart: number[] = new Array(lines.length);
  {
    let acc = 0;
    for (let i = 0; i < lines.length; i++) {
      lineStart[i] = acc;
      acc += (lines[i] ?? '').length + 1; // +1 for the newline we split on
    }
  }

  let inFence = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) {
      i++;
      continue;
    }
    if (FENCE_RE.test(line.trimStart())) {
      inFence = !inFence;
      i++;
      continue;
    }
    if (inFence) {
      i++;
      continue;
    }

    // Block form: a line that is just `%%` (whitespace trimmed) opens a memo.
    if (line.trim() === '%%') {
      const openLine = i;
      let j = i + 1;
      while (j < lines.length && (lines[j] ?? '').trim() !== '%%') j++;
      if (j < lines.length) {
        // Closer found.
        const innerLines = lines.slice(openLine + 1, j);
        const innerJoined = innerLines.join('\n').trim();
        if (innerJoined.length > 0) {
          const { tag, text } = extractTag(innerJoined);
          out.push({
            from: lineStart[openLine] ?? 0,
            to: (lineStart[j] ?? 0) + (lines[j] ?? '').length,
            line: openLine + 1,
            tag,
            text,
            block: true,
          });
          i = j + 1;
          continue;
        }
      }
      // Unbalanced block — fall through and try to parse as inline within
      // this line (probably no match, but cheap).
    }

    // Inline form on this line.
    parseInlineRun(line, lineStart[i] ?? 0, i + 1, out);
    i++;
  }

  return out;
}

/**
 * Scans a single line for `%% … %%` inline runs. Pushes any matches onto
 * `out`. Skips matches whose inner text is empty or whose immediate inside
 * char is whitespace (mirrors the `==highlight==` parser's rule, so that
 * `100%% complete` doesn't accidentally match).
 */
function parseInlineRun(
  line: string,
  baseOffset: number,
  lineNumber: number,
  out: Comment[],
): void {
  let cursor = 0;
  while (cursor < line.length) {
    const open = line.indexOf('%%', cursor);
    if (open < 0) return;
    // Reject `%%%` triple — ambiguous.
    if (line[open + 2] === '%') {
      cursor = open + 3;
      continue;
    }
    // Word-boundary: prev char (if any) must not be alphanumeric. Without
    // this, `100%% complete %%done%%` would erroneously match `%% complete
    // %%`.
    if (open > 0 && /[A-Za-z0-9]/.test(line[open - 1] ?? '')) {
      cursor = open + 2;
      continue;
    }
    // Find the closing `%%`. Skip over `%%%` triples (a `%%` is part of a
    // triple when EITHER adjacent char is also `%`).
    let close = -1;
    let scan = open + 2;
    while (scan < line.length) {
      const idx = line.indexOf('%%', scan);
      if (idx < 0) break;
      if (line[idx + 2] === '%' || line[idx - 1] === '%') {
        scan = idx + 2;
        continue;
      }
      close = idx;
      break;
    }
    if (close < 0 || close <= open + 2) {
      cursor = open + 2;
      continue;
    }
    const inner = line.slice(open + 2, close).trim();
    if (inner.length === 0) {
      cursor = close + 2;
      continue;
    }
    const { tag, text } = extractTag(inner);
    out.push({
      from: baseOffset + open,
      to: baseOffset + close + 2,
      line: lineNumber,
      tag,
      text,
      block: false,
    });
    cursor = close + 2;
  }
}

function extractTag(inner: string): { tag: string | null; text: string } {
  const m = inner.match(TAG_RE);
  if (!m || !m[1]) return { tag: null, text: inner };
  const tag = m[1].toLowerCase();
  const text = inner.slice(m[0].length).trimStart();
  return { tag, text: text.length > 0 ? text : inner };
}

/**
 * Removes every memo from the source. Default behavior on export — the
 * medical-research workflow can't afford accidental leaks of `@reviewer`
 * notes into a submitted PDF.
 *
 * Inline removals: replace `%% … %%` with empty (no whitespace fixup; the
 * markdown engine collapses double-spaces). Block removals: drop the entire
 * `%%`/closer/inner-content range AND the trailing newline so the surrounding
 * paragraphs stay structurally clean.
 */
export function stripComments(src: string): string {
  return rewriteComments(src, () => '');
}

/**
 * "Include comments" export. Inline memos stay inline as a footnote-style
 * marker `[메모: …]`; block memos are promoted to a blockquote — a stable
 * representation across HTML, DOCX, and LaTeX (Pandoc renders blockquotes
 * natively in all targets).
 */
export function promoteComments(src: string): string {
  return rewriteComments(src, (memo) => {
    const tagPart = memo.tag ? `@${memo.tag} ` : '';
    if (memo.block) {
      const body = memo.text
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
      return `> **메모${memo.tag ? ` ${tagPart.trim()}` : ''}**\n${body}`;
    }
    return `[메모: ${tagPart}${memo.text}]`;
  });
}

/**
 * Splices a new `%% … %%` block into `src` at the position of `memo`, with the
 * tag and body coming from `edit`.
 *
 * Form selection is automatic:
 *   - body contains `\n` → block form `%%\n[@tag\n]body\n%%`
 *   - else               → inline `%% [@tag ]body %%`
 *
 * Tag handling (deliberate three-state):
 *   - `tag === undefined` → keep `memo.tag`
 *   - `tag === null`      → drop the tag
 *   - `tag === '<name>'`  → set to that tag (lowercased; `@` and trailing `:`
 *     stripped if the caller accidentally included them)
 *
 * Validation: an empty/whitespace-only body is a no-op (returns the original
 * source + the memo's existing range). Callers should treat that as "delete
 * the memo" and use a different code path.
 */
export interface MemoEdit {
  /** undefined = keep existing, null = remove tag, string = set tag. */
  tag?: string | null;
  body: string;
}
export interface ReplaceResult {
  newSrc: string;
  newRange: { from: number; to: number };
}
export function replaceMemo(src: string, memo: Comment, edit: MemoEdit): ReplaceResult {
  const trimmedBody = edit.body.trim();
  if (trimmedBody.length === 0) {
    return { newSrc: src, newRange: { from: memo.from, to: memo.to } };
  }
  const nextTag: string | null =
    edit.tag === undefined
      ? memo.tag
      : edit.tag === null
        ? null
        : normalizeTag(edit.tag);
  const replacement = buildMemoText(nextTag, trimmedBody);
  const newSrc = src.slice(0, memo.from) + replacement + src.slice(memo.to);
  return {
    newSrc,
    newRange: { from: memo.from, to: memo.from + replacement.length },
  };
}

function normalizeTag(raw: string): string | null {
  const stripped = raw.trim().replace(/^@+/, '').replace(/:$/, '').toLowerCase();
  return stripped.length > 0 ? stripped : null;
}

function buildMemoText(tag: string | null, body: string): string {
  const hasNewline = body.includes('\n');
  if (hasNewline) {
    const tagLine = tag ? `@${tag}\n` : '';
    return `%%\n${tagLine}${body}\n%%`;
  }
  const tagPart = tag ? `@${tag} ` : '';
  return `%% ${tagPart}${body} %%`;
}

/**
 * Apply `transform` to each parsed memo, returning a new source string with
 * the original memo ranges replaced by the transform's output. Operates from
 * the END of the document toward the start so byte offsets stay valid as we
 * splice.
 */
function rewriteComments(src: string, transform: (memo: Comment) => string): string {
  const memos = parseComments(src);
  if (memos.length === 0) return src;
  let result = src;
  for (let i = memos.length - 1; i >= 0; i--) {
    const m = memos[i];
    if (!m) continue;
    const replacement = transform(m);
    const from = m.from;
    let to = m.to;
    if (m.block) {
      // Consume the trailing newline so the strip doesn't leave a blank
      // line where the block stood.
      if (result[to] === '\n') to += 1;
    }
    result = result.slice(0, from) + replacement + result.slice(to);
  }
  return result;
}
