// Phase 3.1.2 — inline markdown renderer for in-cell content (v0.2.7).
//
// Renders a single line of markdown (the text content of one table cell) into
// a DocumentFragment of styled DOM nodes. This is the "blurred" rendering for
// the Phase 3.1.2 sub-active-cell pattern: when a cell is NOT focused, the
// user sees rendered marks (`<strong>`, `<em>`, `<code>`, KaTeX, citation
// pills, links, etc.); when the cell IS focused, the raw text is shown so
// editing stays source-honest. The markdown source in the EditorState
// remains the single canonical truth — render is purely visual.
//
// --- Design ---
//
// We use a small hand-rolled tokenizer rather than markdown-it (which is a
// lazy chunk) or the lezer parser (which would require running a second
// parser instance per cell). The grammar is intentionally small — only the
// inline marks the user is likely to nest inside a single short cell:
//
//   `code`          inline code (no nesting; backslash escape inside is literal)
//   $tex$           inline math via the lazy KaTeX loader (Phase 3.2 helper)
//   [@key]          Pandoc citation → styled pill (matches CitationWidget)
//   [text](url)     link → styled <a> (no click handler — clicks focus the cell)
//   **text**, __t__ strong
//   *text*, _t_     emphasis
//   ~~text~~        strikethrough
//   ^text^          superscript (Pandoc-style, no whitespace inside)
//   ~text~          subscript  (MultiMarkdown-style, no whitespace inside)
//
// The atomic forms (`code`, `$math$`, `[@cit]`, `[text](url)`) are scanned
// first — they cannot contain nested inline marks. Then a recursive emphasis
// pass walks the remaining segments.
//
// CriticMarkup is intentionally NOT rendered inside cells — it remains
// literal text per the Phase 3.1.2 hard rules (Phase 3.4 territory).
//
// Backslash escapes (`\*`, `\_`, `\$`, `\[`, `\` `) are honoured so a literal
// star (etc.) doesn't trigger a mark. The escape itself is consumed.

import {
  getCachedKatex,
  isKatexInflight,
  requestKatexRender,
} from '../math/katexLoader';

// --- Public API ----------------------------------------------------------

/**
 * Optional context the caller can pass to hook into asynchronous side-effects
 * (lazy KaTeX render completing) so the caller can re-render once the cache
 * fills.
 */
export interface InlineRenderContext {
  /** Called once for each inline math expression that wasn't in the KaTeX
   * cache. The callback may dispatch a CodeMirror tick to rebuild. */
  onKatexReady?: () => void;
}

/**
 * Render `source` (a single line of raw markdown text from one table cell)
 * into a `DocumentFragment` of styled DOM nodes. Empty input returns a
 * fragment with a single empty text node so the cell is still selectable.
 */
export function renderInlineMarksToDom(
  source: string,
  ctx?: InlineRenderContext,
): DocumentFragment {
  const frag = document.createDocumentFragment();
  if (source.length === 0) {
    frag.appendChild(document.createTextNode(''));
    return frag;
  }
  const tokens = tokenizeAtoms(source);
  for (const tok of tokens) {
    appendToken(frag, tok, ctx);
  }
  return frag;
}

/** Test-only export — see `tests/editor/inlineMarkdownRenderer.test.ts`. */
export const _testing = {
  tokenizeAtoms,
  splitEmphasis,
};

// --- Token model ---------------------------------------------------------

type AtomToken =
  | { kind: 'text'; value: string }
  | { kind: 'literal'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'math'; value: string }
  | { kind: 'citation'; keys: string[]; raw: string }
  | { kind: 'link'; text: string; url: string };

// --- Atomic pre-scan -----------------------------------------------------

/**
 * Single left-to-right pass that captures the atomic tokens (code, math,
 * citation, link) and emits the surrounding bytes as `text` tokens.
 * Backslash escapes anywhere outside an atomic token are stripped here so
 * the emphasis pass can use raw `*`, `_`, `~`, `^` markers without
 * second-guessing escapes.
 */
function tokenizeAtoms(src: string): AtomToken[] {
  const out: AtomToken[] = [];
  let buf = '';
  let i = 0;
  const flushText = (): void => {
    if (buf.length > 0) {
      out.push({ kind: 'text', value: buf });
      buf = '';
    }
  };
  while (i < src.length) {
    const ch = src[i];
    // Backslash escape — emit the next char as a `literal` atom so the
    // emphasis pass does not interpret it as a marker. Splitting the
    // current text buffer keeps surrounding emphasis intact.
    if (ch === '\\' && i + 1 < src.length) {
      const next = src[i + 1];
      if (next !== undefined && isEscapable(next)) {
        flushText();
        out.push({ kind: 'literal', value: next });
        i += 2;
        continue;
      }
    }
    // Inline code: `` ` `` ... `` ` ``. Backticks can be doubled (``` ``code`` ```)
    // but we keep this simple — single-backtick spans, no doubled-backtick
    // grammar. Cell content rarely needs the doubled form.
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i) {
        flushText();
        out.push({ kind: 'code', value: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    // Inline math: `$...$`. Body cannot contain unescaped `$` or newline,
    // and must not start/end with whitespace (matches `scanInlineMath`).
    if (ch === '$') {
      const m = matchInlineMath(src, i);
      if (m !== null) {
        flushText();
        out.push({ kind: 'math', value: m.tex });
        i = m.end;
        continue;
      }
    }
    // Citation: `[@key]` / `[-@key]` / `[@a; @b]`.
    if (ch === '[') {
      const cit = matchCitation(src, i);
      if (cit !== null) {
        flushText();
        out.push({ kind: 'citation', keys: cit.keys, raw: cit.raw });
        i = cit.end;
        continue;
      }
      // Link: `[text](url)`. Disallow `[^...]` (footnote), and require
      // matching `)` on the same line.
      const lnk = matchLink(src, i);
      if (lnk !== null) {
        flushText();
        out.push({ kind: 'link', text: lnk.text, url: lnk.url });
        i = lnk.end;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flushText();
  return out;
}

function isEscapable(ch: string): boolean {
  // Standard CommonMark punctuation — restricted to chars that this renderer
  // would otherwise treat as syntax. Backslash itself + emphasis + atomics.
  return (
    ch === '\\' ||
    ch === '*' ||
    ch === '_' ||
    ch === '~' ||
    ch === '^' ||
    ch === '`' ||
    ch === '$' ||
    ch === '[' ||
    ch === ']' ||
    ch === '(' ||
    ch === ')'
  );
}

function matchInlineMath(src: string, start: number): { tex: string; end: number } | null {
  // `$` at start; find closing `$` on same line.
  let i = start + 1;
  if (i >= src.length) return null;
  // No leading whitespace inside math.
  if (/\s/.test(src[i] ?? '')) return null;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\n') return null;
    if (ch === '\\' && i + 1 < src.length) {
      i += 2;
      continue;
    }
    if (ch === '$') {
      // Body chars span [start+1, i). Reject if empty or trailing-whitespace.
      if (i === start + 1) return null;
      if (/\s/.test(src[i - 1] ?? '')) return null;
      return { tex: src.slice(start + 1, i), end: i + 1 };
    }
    i++;
  }
  return null;
}

function matchCitation(src: string, start: number): { keys: string[]; raw: string; end: number } | null {
  // `[` + optional `-` + `@` + key chars; subsequent `@key`s allowed.
  let scan = start + 1;
  if (src[scan] === '^') return null; // footnote — not us
  if (src[scan] === '-') scan++;
  if (src[scan] !== '@') return null;
  // Find closing `]` on the same line.
  let end = start + 1;
  while (end < src.length) {
    const ch = src[end];
    if (ch === '\n') return null;
    if (ch === ']') break;
    end++;
  }
  if (end >= src.length || src[end] !== ']') return null;
  const inner = src.slice(start + 1, end);
  const keys: string[] = [];
  let local = 0;
  while (local < inner.length) {
    const c = inner.charCodeAt(local);
    if (c === 64 /* @ */ || (c === 45 /* - */ && inner.charCodeAt(local + 1) === 64)) {
      if (c === 45) local++;
      local++; // skip @
      const keyStart = local;
      while (local < inner.length && isCitationKeyChar(inner.charCodeAt(local))) {
        local++;
      }
      if (local > keyStart) {
        keys.push(inner.slice(keyStart, local));
      }
    } else {
      local++;
    }
  }
  if (keys.length === 0) return null;
  return { keys, raw: src.slice(start, end + 1), end: end + 1 };
}

function isCitationKeyChar(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    code === 0x5f ||
    code === 0x2e ||
    code === 0x2d ||
    code === 0x2b ||
    code === 0x3a ||
    code === 0x2f
  );
}

function matchLink(src: string, start: number): { text: string; url: string; end: number } | null {
  // `[` + text (no newline, no nested `[`) + `]` + `(` + url + `)`.
  if (src[start + 1] === '^') return null; // footnote
  let textEnd = start + 1;
  let depth = 0;
  while (textEnd < src.length) {
    const ch = src[textEnd];
    if (ch === '\n') return null;
    if (ch === '\\' && textEnd + 1 < src.length) {
      textEnd += 2;
      continue;
    }
    if (ch === '[') depth++;
    else if (ch === ']') {
      if (depth === 0) break;
      depth--;
    }
    textEnd++;
  }
  if (textEnd >= src.length || src[textEnd] !== ']') return null;
  if (src[textEnd + 1] !== '(') return null;
  let urlEnd = textEnd + 2;
  while (urlEnd < src.length) {
    const ch = src[urlEnd];
    if (ch === '\n') return null;
    if (ch === '\\' && urlEnd + 1 < src.length) {
      urlEnd += 2;
      continue;
    }
    if (ch === ')') break;
    urlEnd++;
  }
  if (urlEnd >= src.length || src[urlEnd] !== ')') return null;
  const text = src.slice(start + 1, textEnd);
  const url = src.slice(textEnd + 2, urlEnd);
  return { text, url, end: urlEnd + 1 };
}

// --- Emphasis / strike / sup / sub pass ---------------------------------

interface EmphSpan {
  kind: 'strong' | 'em' | 'strike' | 'sup' | 'sub' | 'text';
  text?: string;
  inner?: EmphSpan[];
}

/**
 * Recursive descent over plain (non-atomic) text. Recognises `**...**`,
 * `__...__`, `*...*`, `_..._`, `~~...~~`, `^...^`, `~...~`. Emphasis runs
 * can nest (e.g. `**bold *italic***`).
 *
 * Single-char delimiters (`*`, `_`, `^`, `~`) require non-whitespace inside,
 * matching the Pandoc / MultiMarkdown grammar that the project's existing
 * `inlineExtras.ts` and `@lezer/markdown` use.
 */
function splitEmphasis(src: string): EmphSpan[] {
  const out: EmphSpan[] = [];
  let buf = '';
  let i = 0;
  const flushText = (): void => {
    if (buf.length > 0) {
      out.push({ kind: 'text', text: buf });
      buf = '';
    }
  };
  while (i < src.length) {
    const ch = src[i];
    // Double-marker forms first (longer match wins).
    if ((ch === '*' || ch === '_') && src[i + 1] === ch) {
      const end = findClosingDouble(src, i + 2, ch);
      if (end !== -1) {
        const inner = src.slice(i + 2, end);
        if (inner.length > 0) {
          flushText();
          out.push({ kind: 'strong', inner: splitEmphasis(inner) });
          i = end + 2;
          continue;
        }
      }
    }
    if (ch === '~' && src[i + 1] === '~') {
      const end = findClosingDouble(src, i + 2, '~');
      if (end !== -1) {
        const inner = src.slice(i + 2, end);
        if (inner.length > 0) {
          flushText();
          out.push({ kind: 'strike', inner: splitEmphasis(inner) });
          i = end + 2;
          continue;
        }
      }
    }
    // Single-marker forms. Skip when the marker is part of a doubled
    // run that the double-marker pass already declined — `***foo***`
    // and `****` should not produce a stray <em> on the leftover stars.
    if ((ch === '*' || ch === '_') && src[i + 1] !== ch) {
      const end = findClosingSingle(src, i + 1, ch);
      if (end !== -1) {
        const inner = src.slice(i + 1, end);
        if (inner.length > 0) {
          flushText();
          out.push({ kind: 'em', inner: splitEmphasis(inner) });
          i = end + 1;
          continue;
        }
      }
    }
    if (ch === '^') {
      const end = findClosingNoSpace(src, i + 1, '^');
      if (end !== -1) {
        const inner = src.slice(i + 1, end);
        flushText();
        // Sup contents are guaranteed whitespace-free; no nested emphasis.
        out.push({ kind: 'sup', text: inner });
        i = end + 1;
        continue;
      }
    }
    if (ch === '~') {
      const end = findClosingNoSpace(src, i + 1, '~');
      if (end !== -1) {
        const inner = src.slice(i + 1, end);
        flushText();
        out.push({ kind: 'sub', text: inner });
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flushText();
  return out;
}

function findClosingDouble(src: string, from: number, ch: string): number {
  if (from >= src.length) return -1;
  if (/\s/.test(src[from] ?? '')) return -1;
  // Look for a `chch` pair whose start is non-whitespace-preceded. To handle
  // `**bold *italic***`, prefer the FINAL `chch` in any run of trailing
  // marker chars — i.e. when we see `chch` followed by another `ch`, that
  // first pair is part of a longer triple and we should advance past it.
  // The implementation: scan for `chch`, and if the char AFTER the pair is
  // also `ch`, keep scanning to find the rightmost pair before a non-`ch`
  // character (or end-of-string).
  for (let i = from; i < src.length - 1; i++) {
    if (src[i] !== ch || src[i + 1] !== ch) continue;
    if (i > from && /\s/.test(src[i - 1] ?? '')) continue;
    // Advance past any extra `ch` chars so we land at the LAST pair in a
    // run. This makes `***bold***` close on the rightmost `**`.
    let j = i + 2;
    while (j < src.length && src[j] === ch) j++;
    // The "true closer" is the pair right before position j.
    const closer = j - 2;
    if (closer >= i) return closer;
    return i;
  }
  return -1;
}

function findClosingSingle(src: string, from: number, ch: string): number {
  if (from >= src.length) return -1;
  if (/\s/.test(src[from] ?? '')) return -1;
  for (let i = from; i < src.length; i++) {
    if (src[i] === ch) {
      if (src[i + 1] === ch) continue;
      if (ch === '_') {
        const before = i > 0 ? src[i - 1] ?? ' ' : ' ';
        const after = i + 1 < src.length ? src[i + 1] ?? ' ' : ' ';
        if (isWordChar(before) && isWordChar(after)) continue;
      }
      if (i > from && /\s/.test(src[i - 1] ?? '')) continue;
      return i;
    }
  }
  return -1;
}

function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9]/.test(ch);
}

function findClosingNoSpace(src: string, from: number, ch: string): number {
  if (from >= src.length) return -1;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === undefined) return -1;
    if (c === ch) {
      if (i === from) return -1;
      return i;
    }
    if (/\s/.test(c)) return -1;
  }
  return -1;
}

// --- DOM emission --------------------------------------------------------

function appendToken(host: Node, tok: AtomToken, ctx?: InlineRenderContext): void {
  switch (tok.kind) {
    case 'text': {
      const spans = splitEmphasis(tok.value);
      for (const sp of spans) appendEmphSpan(host, sp);
      return;
    }
    case 'literal': {
      // Escaped character — emit as a raw text node so the emphasis pass
      // never sees the marker symbol.
      host.appendChild(document.createTextNode(tok.value));
      return;
    }
    case 'code': {
      const el = document.createElement('code');
      el.className = 'cm-md-inline-code';
      el.textContent = tok.value;
      host.appendChild(el);
      return;
    }
    case 'math': {
      appendMath(host, tok.value, ctx);
      return;
    }
    case 'citation': {
      const sup = document.createElement('sup');
      sup.className = 'cm-md-citation';
      // Inside a cell we don't have document-level citation numbering, so
      // we show the raw `@key` form for visual feedback. Clicking focuses
      // the cell to reveal the actual `[@key]` source.
      sup.textContent = '[' + tok.keys.map((k) => '@' + k).join(', ') + ']';
      host.appendChild(sup);
      return;
    }
    case 'link': {
      const a = document.createElement('a');
      a.className = 'cm-md-link';
      a.href = tok.url;
      // No click handler — clicks fall through to the contenteditable cell
      // focus handler (matches active-line semantics).
      a.addEventListener('click', (e) => {
        e.preventDefault();
      });
      const spans = splitEmphasis(tok.text);
      for (const sp of spans) appendEmphSpan(a, sp);
      host.appendChild(a);
      return;
    }
  }
}

function appendEmphSpan(host: Node, sp: EmphSpan): void {
  switch (sp.kind) {
    case 'text': {
      host.appendChild(document.createTextNode(sp.text ?? ''));
      return;
    }
    case 'strong': {
      const el = document.createElement('strong');
      for (const ch of sp.inner ?? []) appendEmphSpan(el, ch);
      host.appendChild(el);
      return;
    }
    case 'em': {
      const el = document.createElement('em');
      for (const ch of sp.inner ?? []) appendEmphSpan(el, ch);
      host.appendChild(el);
      return;
    }
    case 'strike': {
      const el = document.createElement('s');
      for (const ch of sp.inner ?? []) appendEmphSpan(el, ch);
      host.appendChild(el);
      return;
    }
    case 'sup': {
      const el = document.createElement('sup');
      el.textContent = sp.text ?? '';
      host.appendChild(el);
      return;
    }
    case 'sub': {
      const el = document.createElement('sub');
      el.textContent = sp.text ?? '';
      host.appendChild(el);
      return;
    }
  }
}

function appendMath(host: Node, tex: string, ctx?: InlineRenderContext): void {
  const span = document.createElement('span');
  span.className = 'cm-math-inline';
  const cached = getCachedKatex(tex, false);
  if (cached !== null) {
    // Trust boundary: katex.renderToString output is library-generated HTML.
    // This mirrors the same sink in `decorations/math.ts`.
    injectTrustedKatex(span, cached);
  } else {
    span.textContent = `$${tex}$`;
    if (!isKatexInflight(tex, false)) {
      void requestKatexRender(tex, false).then(() => {
        if (ctx?.onKatexReady) ctx.onKatexReady();
      });
    } else if (ctx?.onKatexReady) {
      void requestKatexRender(tex, false).then(() => ctx.onKatexReady?.());
    }
  }
  host.appendChild(span);
}

function injectTrustedKatex(host: HTMLElement, html: string): void {
  // Centralised innerHTML sink — KaTeX's library-generated output is the
  // only thing routed through here. Mirrors `decorations/math.ts::injectKatex`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (host as unknown as { innerHTML: string }).innerHTML = html;
}
