// Lazy markdown-it loader for the editor's inline-rendering paths (table
// cells, etc.). markdown-it is ~160 KB plus dependencies; loading it eagerly
// for the editor's table widget would bloat the renderer main chunk for a
// feature that isn't used until the user actually types a markdown table.
//
// First lookup: returns the raw escaped text and kicks off the async load.
// Subsequent lookups return the cached HTML.

type MarkdownIt = import('markdown-it').default;

let mdPromise: Promise<MarkdownIt> | null = null;
let mdInstance: MarkdownIt | null = null;
const cache = new Map<string, string>();
const inflight = new Set<string>();

async function loadMd(): Promise<MarkdownIt> {
  if (!mdPromise) {
    mdPromise = import('markdown-it').then((m) => {
      // `html:false` so user-supplied HTML in cells does not bypass escaping.
      const inst = new m.default({ html: false, linkify: false });
      mdInstance = inst;
      return inst;
    });
  }
  return mdPromise;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Synchronously look up rendered inline HTML for `source`. Returns null on the
 * first call for any given input — the caller should display the escaped text
 * and arrange (via `requestRenderInline`) to rebuild once the cache is filled.
 */
export function getCachedInline(source: string): string | null {
  return cache.get(source) ?? null;
}

export function isInlineInflight(source: string): boolean {
  return inflight.has(source);
}

/**
 * Kick off (or join) an async render for `source`. Resolves with the HTML
 * which is also written to the cache. The caller should re-render its widget
 * after resolution so the cache hit picks up the new content.
 */
export function requestRenderInline(source: string): Promise<string> {
  const cached = cache.get(source);
  if (cached !== undefined) return Promise.resolve(cached);
  if (mdInstance) {
    // markdown-it is already loaded — render synchronously and cache.
    const html = mdInstance.renderInline(source);
    cache.set(source, html);
    return Promise.resolve(html);
  }
  if (inflight.has(source)) {
    // Another caller already kicked off the load — return a promise that
    // resolves once the load completes.
    return loadMd().then((md) => {
      const cachedHit = cache.get(source);
      if (cachedHit !== undefined) return cachedHit;
      const html = md.renderInline(source);
      cache.set(source, html);
      return html;
    });
  }
  inflight.add(source);
  return loadMd()
    .then((md) => {
      const html = md.renderInline(source);
      cache.set(source, html);
      inflight.delete(source);
      return html;
    })
    .catch(() => {
      inflight.delete(source);
      const fallback = escapeHtml(source);
      cache.set(source, fallback);
      return fallback;
    });
}

// Test-only helper
export function _resetForTest(): void {
  cache.clear();
  inflight.clear();
  mdPromise = null;
  mdInstance = null;
}

export { escapeHtml as _escapeHtmlForTest };
