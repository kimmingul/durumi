import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock mermaid BEFORE importing modules under test. The mock returns a
// deterministic SVG string that includes the body length so we can assert
// the call site received the body it should have.
const renderMock = vi.fn(async (id: string, body: string) => ({
  svg: `<svg data-id="${id}" data-len="${body.length}">ok</svg>`,
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: renderMock,
  },
}));

import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { findMermaidFences } from '../../src/editor/decorations/mermaid';
import {
  requestRender,
  getCachedSvg,
  _resetForTest as resetRenderer,
} from '../../src/editor/mermaid/renderer';

function makeState(doc: string, cursor: number): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
  });
}

beforeEach(() => {
  renderMock.mockClear();
  resetRenderer();
});

describe('findMermaidFences', () => {
  it('detects a mermaid fence and reports outer range + body', () => {
    const doc = '```mermaid\ngraph TD\n  A-->B\n```\n';
    const state = makeState(doc, doc.length);
    const fences = findMermaidFences(state);
    expect(fences.length).toBe(1);
    expect(fences[0]!.body).toContain('graph TD');
    expect(fences[0]!.body).toContain('A-->B');
    // Outer range should at minimum include the opening and closing fence markers.
    const outer = doc.slice(fences[0]!.from, fences[0]!.to);
    expect(outer.startsWith('```mermaid')).toBe(true);
    expect(outer.trimEnd().endsWith('```')).toBe(true);
  });

  it('matches MERMAID (uppercase) — case-insensitive', () => {
    const doc = '```MERMAID\ngraph TD\nA-->B\n```\n';
    const state = makeState(doc, doc.length);
    expect(findMermaidFences(state).length).toBe(1);
  });

  it('does NOT match `mermaid-extra` (must be exact)', () => {
    const doc = '```mermaid-extra\ngraph TD\n```\n';
    const state = makeState(doc, doc.length);
    expect(findMermaidFences(state).length).toBe(0);
  });

  it('returns nothing when there is no fenced code at all', () => {
    const state = makeState('plain text only', 0);
    expect(findMermaidFences(state).length).toBe(0);
  });
});

describe('mermaid renderer cache + dedup', () => {
  it('caches the rendered SVG keyed by body', async () => {
    const svg = await requestRender('graph TD; A-->B');
    expect(svg).toContain('<svg');
    expect(getCachedSvg('graph TD; A-->B')).toBe(svg);
  });

  it('calls mermaid.render once for the same body even on parallel requests', async () => {
    const [a, b] = await Promise.all([
      requestRender('same body'),
      requestRender('same body'),
    ]);
    expect(a).toBe(b);
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  it('returns a `<pre class="mermaid-error">` fallback when mermaid rejects', async () => {
    renderMock.mockRejectedValueOnce(new Error('boom'));
    const out = await requestRender('bad input');
    expect(out).toContain('<pre class="mermaid-error">');
    expect(out).toContain('boom');
  });
});
