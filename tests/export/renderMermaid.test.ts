import { describe, it, expect, vi, beforeEach } from 'vitest';

const renderMock = vi.fn(async (_id: string, body: string) => ({
  svg: `<svg>${body.length}</svg>`,
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: renderMock,
  },
}));

import {
  extractMermaidBlocks,
  preprocessMermaid,
  renderMermaidToSvg,
  _resetForTest as resetRenderer,
} from '../../src/export/renderMermaid';
import { renderHtml } from '../../src/export/renderHtml';

beforeEach(() => {
  renderMock.mockClear();
  resetRenderer();
});

describe('extractMermaidBlocks', () => {
  it('finds 0 blocks in plain markdown', () => {
    expect(extractMermaidBlocks('# nothing here\n').length).toBe(0);
  });

  it('finds 1 block', () => {
    const md = '# hi\n\n```mermaid\ngraph TD\nA-->B\n```\n\nbye\n';
    const out = extractMermaidBlocks(md);
    expect(out.length).toBe(1);
    expect(out[0]!.body).toBe('graph TD\nA-->B');
    expect(out[0]!.fullMatch.startsWith('```mermaid')).toBe(true);
  });

  it('finds 2 blocks', () => {
    const md = '```mermaid\ngraph TD\nA-->B\n```\n\nmid\n\n```mermaid\nsequenceDiagram\nA->>B: hi\n```\n';
    const out = extractMermaidBlocks(md);
    expect(out.length).toBe(2);
    expect(out[0]!.body).toContain('graph TD');
    expect(out[1]!.body).toContain('sequenceDiagram');
  });

  it('matches case-insensitively', () => {
    const md = '```MERMAID\ngraph TD\n```\n';
    expect(extractMermaidBlocks(md).length).toBe(1);
  });
});

describe('preprocessMermaid', () => {
  it('replaces a fence with an inline `<div class="mermaid-rendered">…SVG…</div>`', async () => {
    const md = '# Title\n\n```mermaid\ngraph TD\nA-->B\n```\n\nafter';
    const out = await preprocessMermaid(md);
    expect(out).not.toContain('```mermaid');
    expect(out).toContain('<div class="mermaid-rendered">');
    expect(out).toContain('<svg>');
    expect(out).toContain('after');
  });

  it('returns input unchanged when there are no mermaid fences', async () => {
    const md = '# nothing\n\n```ts\nconst x = 1;\n```\n';
    const out = await preprocessMermaid(md);
    expect(out).toBe(md);
  });

  it('falls back to a `<pre class="mermaid-error">` on render rejection', async () => {
    renderMock.mockRejectedValueOnce(new Error('syntax bad'));
    const md = '```mermaid\nnot valid\n```\n';
    const out = await preprocessMermaid(md);
    expect(out).toContain('<pre class="mermaid-error">');
    expect(out).toContain('syntax bad');
  });
});

describe('renderMermaidToSvg', () => {
  it('returns the mocked SVG on success', async () => {
    const out = await renderMermaidToSvg('graph TD; A-->B');
    expect(out).toContain('<svg>');
  });

  it('returns the error fallback when mermaid throws', async () => {
    renderMock.mockRejectedValueOnce(new Error('nope'));
    const out = await renderMermaidToSvg('bad');
    expect(out).toContain('<pre class="mermaid-error">');
  });
});

describe('renderHtml integration', () => {
  it('inlines the SVG into the exported HTML body', async () => {
    const md = '# Diagram\n\n```mermaid\ngraph TD\nA-->B\n```\n';
    const html = await renderHtml(md, 't');
    expect(html).toContain('<div class="mermaid-rendered">');
    expect(html).toContain('<svg>');
    // The original fence should not appear as a code block in the output.
    expect(html).not.toContain('language-mermaid');
  });
});
