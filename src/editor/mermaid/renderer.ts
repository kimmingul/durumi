// Singleton mermaid renderer with lazy load + body-keyed cache + in-flight dedup.
//
// - Mermaid is heavy (~700KB minified). We dynamic-import it on first use only.
// - `cache` maps fence body -> SVG markup. Errors also cache as fallback markup
//   so we don't infinite-retry a syntactically-broken fence.
// - `inflight` dedups concurrent calls for the same body.

type MermaidLib = typeof import('mermaid').default;

let mermaidPromise: Promise<MermaidLib> | null = null;
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
let counter = 0;

async function loadMermaid(): Promise<MermaidLib> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      const lib = m.default;
      const dark =
        typeof document !== 'undefined' &&
        document.documentElement.getAttribute('data-theme') === 'dark';
      lib.initialize({
        startOnLoad: false,
        theme: dark ? 'dark' : 'default',
        securityLevel: 'strict',
      });
      return lib;
    });
  }
  return mermaidPromise;
}

export function getCachedSvg(body: string): string | null {
  return cache.get(body) ?? null;
}

export function isInflight(body: string): boolean {
  return inflight.has(body);
}

function escapeForFallback(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

export function requestRender(body: string): Promise<string> {
  const cached = cache.get(body);
  if (cached !== undefined) return Promise.resolve(cached);
  const ongoing = inflight.get(body);
  if (ongoing) return ongoing;
  const id = `durumi-mermaid-${++counter}`;
  const p = loadMermaid()
    .then((lib) => lib.render(id, body))
    .then(({ svg }) => {
      cache.set(body, svg);
      inflight.delete(body);
      return svg;
    })
    .catch((err: unknown) => {
      inflight.delete(body);
      const msg = escapeForFallback(String(err));
      const fallback = `<pre class="mermaid-error">${msg}</pre>`;
      cache.set(body, fallback);
      return fallback;
    });
  inflight.set(body, p);
  return p;
}

// Test-only helper: clear cache + inflight + reset the lib promise. Not part of
// the public runtime contract.
export function _resetForTest(): void {
  cache.clear();
  inflight.clear();
  mermaidPromise = null;
  counter = 0;
}
