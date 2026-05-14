// Lazy KaTeX loader with a synchronous render cache.
//
// KaTeX's runtime is ~580 KB. We don't want that in the renderer main chunk.
// The editor's math decoration widget is built synchronously inside `toDOM()`,
// but the actual KaTeX render output for any given source is content-addressed
// and stable — so we cache `tex -> html` after the first async render.
//
// First sight of a given expression: `renderToStringSync` returns null and
// the widget shows raw text. `requestRender(tex, isBlock)` kicks off the
// async render, fills the cache, and dispatches a tick on the editor view so
// the decoration rebuilds with the now-cached HTML. Mirrors the mermaid
// renderer architecture exactly.

type KatexLib = typeof import('katex').default;

let katexPromise: Promise<KatexLib> | null = null;
const cache = new Map<string, string>(); // key = `${isBlock ? 'b' : 'i'}|${tex}`
const inflight = new Map<string, Promise<string>>();

async function loadKatex(): Promise<KatexLib> {
  if (!katexPromise) {
    katexPromise = import('katex').then((m) => m.default);
  }
  return katexPromise;
}

function keyOf(tex: string, isBlock: boolean): string {
  return (isBlock ? 'b|' : 'i|') + tex;
}

/** Synchronous cache lookup. Returns the rendered HTML, or null on first encounter. */
export function getCachedKatex(tex: string, isBlock: boolean): string | null {
  return cache.get(keyOf(tex, isBlock)) ?? null;
}

export function isKatexInflight(tex: string, isBlock: boolean): boolean {
  return inflight.has(keyOf(tex, isBlock));
}

/**
 * Async-render an expression to KaTeX HTML and cache it. Resolves with the
 * HTML string (or a fallback HTML for parse errors so the cache never thrashes
 * on broken input).
 */
export function requestKatexRender(tex: string, isBlock: boolean): Promise<string> {
  const k = keyOf(tex, isBlock);
  const cached = cache.get(k);
  if (cached !== undefined) return Promise.resolve(cached);
  const ongoing = inflight.get(k);
  if (ongoing) return ongoing;
  const p = loadKatex()
    .then((katex) => {
      const html = katex.renderToString(tex, { throwOnError: false, displayMode: isBlock });
      cache.set(k, html);
      inflight.delete(k);
      return html;
    })
    .catch(() => {
      // Even the fallback caches — but throwOnError: false should make this
      // path unreachable in practice. Cache the raw text as a sentinel.
      inflight.delete(k);
      const fallback = isBlock ? `$$${escapeForFallback(tex)}$$` : `$${escapeForFallback(tex)}$`;
      cache.set(k, fallback);
      return fallback;
    });
  inflight.set(k, p);
  return p;
}

function escapeForFallback(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

// Test-only helper.
export function _resetForTest(): void {
  cache.clear();
  inflight.clear();
  katexPromise = null;
}
