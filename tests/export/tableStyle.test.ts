import { describe, it, expect } from 'vitest';
import { renderHtml } from '../../src/export/renderHtml';

describe('Phase 3.3 — table style export', () => {
  it('renders a table with Pandoc attrs as a styled <table>', async () => {
    const md =
      '{.durumi-table data-top-rule="2px solid #000" data-bottom-rule="2px solid #000"}\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
    const html = await renderHtml(md, 't');
    // The table itself carries the durumi-table class.
    expect(html).toMatch(/<table[^>]*class="durumi-table"/);
    // Inline style for the table-scope rules.
    expect(html).toMatch(/<table[^>]*style="[^"]*border-top:\s*2px solid #000/);
    expect(html).toMatch(/<table[^>]*style="[^"]*border-bottom:\s*2px solid #000/);
    // Scoped style block before the table provides the body / header rules.
    expect(html).toMatch(/<style>#durumi-table-1[^<]*<\/style>/);
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>1</td>');
  });

  it('preserves the HTML wrapper around a styled table', async () => {
    const md =
      '<div class="durumi-table" data-top-rule="2px solid">\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n</div>\n';
    const html = await renderHtml(md, 't');
    // Wrapper div passes through.
    expect(html).toContain('<div class="durumi-table" data-top-rule="2px solid">');
    expect(html).toContain('</div>');
    // The table inside still renders.
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
  });

  it('booktabs preset via Pandoc attrs has no vertical rules', async () => {
    const md =
      '{.durumi-table data-top-rule="2px solid #000" data-header-separator="1px solid #000" data-bottom-rule="2px solid #000" data-row-rules="none" data-vert-rules="none"}\n\n| H | I |\n|---|---|\n| a | b |\n| c | d |\n';
    const html = await renderHtml(md, 't');
    // Top + bottom inline styles present.
    expect(html).toMatch(/border-top:\s*2px solid #000/);
    expect(html).toMatch(/border-bottom:\s*2px solid #000/);
    // Header separator emitted via the scoped style block.
    expect(html).toMatch(/#durumi-table-1 thead th \{ border-bottom: 1px solid #000/);
    // No vertical-rule style (vert is none → 0 → not emitted in css).
    expect(html).toMatch(/#durumi-table-1 th \+ th, #durumi-table-1 td \+ td \{ border-left: 0/);
  });

  it('emits unique ids when multiple styled tables appear', async () => {
    const md =
      '{.durumi-table data-top-rule="1px solid"}\n\n| a |\n|---|\n| 1 |\n\n{.durumi-table data-top-rule="2px solid"}\n\n| b |\n|---|\n| 2 |\n';
    const html = await renderHtml(md, 't');
    expect(html).toContain('id="durumi-table-1"');
    expect(html).toContain('id="durumi-table-2"');
  });

  it('plain unstyled tables are unaffected by the rule', async () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |\n';
    const html = await renderHtml(md, 't');
    // Plain `<table>` with no class / id added — only the global CSS block
    // may legitimately mention `.durumi-table` as a never-matched selector.
    expect(html).toContain('<table>');
    expect(html).not.toMatch(/<table[^>]*class="durumi-table"/);
    expect(html).not.toContain('id="durumi-table-1"');
    expect(html).not.toContain('#durumi-table-1 {');
  });
});
