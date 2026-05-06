// Export-pipeline mermaid rendering. Lazy-loads `mermaid` (~700KB) only
// when at least one mermaid fence is present in the source markdown.
//
// Strategy (see C5 spec §Export):
//   1. `extractMermaidBlocks` finds every ```mermaid``` fence via matchAll.
//   2. `renderMermaidToSvg` renders one fence body to an SVG string. On
//      mermaid render rejection, returns a `<pre class="mermaid-error">`
//      fallback rather than crashing the whole export.
//   3. `preprocessMermaid` runs all renders in parallel, then string-replaces
//      each fence with `<div class="mermaid-rendered">…SVG…</div>`. The
//      caller (renderHtml) must use markdown-it with `html: true` so the
//      injected HTML survives.

import { escapeHtml } from './escapeHtml';

type MermaidLib = typeof import('mermaid').default;

let mermaidPromise: Promise<MermaidLib> | null = null;

async function loadMermaid(): Promise<MermaidLib> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      m.default.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict',
      });
      return m.default;
    });
  }
  return mermaidPromise;
}

export interface ExtractedBlock {
  /** The full ` ```mermaid\n…\n``` ` substring as it appeared in the source. */
  fullMatch: string;
  /** The fence body (between the info line and the closing fence). */
  body: string;
}

const FENCE_RE = /```mermaid\s*\n([\s\S]*?)\n```/gi;

export function extractMermaidBlocks(markdown: string): ExtractedBlock[] {
  const out: ExtractedBlock[] = [];
  for (const m of markdown.matchAll(FENCE_RE)) {
    out.push({ fullMatch: m[0], body: m[1] ?? '' });
  }
  return out;
}

let counter = 0;

export async function renderMermaidToSvg(body: string): Promise<string> {
  try {
    const lib = await loadMermaid();
    const id = `durumi-export-${++counter}`;
    const { svg } = await lib.render(id, body);
    return svg;
  } catch (err) {
    return `<pre class="mermaid-error">${escapeHtml(String(err))}</pre>`;
  }
}

export async function preprocessMermaid(markdown: string): Promise<string> {
  const blocks = extractMermaidBlocks(markdown);
  if (blocks.length === 0) return markdown;
  const svgs = await Promise.all(blocks.map((b) => renderMermaidToSvg(b.body)));
  let out = markdown;
  for (let i = 0; i < blocks.length; i++) {
    const wrapper = `\n\n<div class="mermaid-rendered">${svgs[i]}</div>\n\n`;
    out = out.replace(blocks[i]!.fullMatch, wrapper);
  }
  return out;
}

// Test-only: reset the lazy-load singleton.
export function _resetForTest(): void {
  mermaidPromise = null;
  counter = 0;
}
