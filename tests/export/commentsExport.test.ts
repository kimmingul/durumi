import { describe, it, expect } from 'vitest';
import { renderHtml } from '../../src/export/renderHtml';

describe('renderHtml comment policy', () => {
  it('strips memos from the output by default', async () => {
    const md = 'Visible body text. %% @reviewer please double-check %% Done.';
    const html = await renderHtml(md, 'doc');
    expect(html).not.toContain('please double-check');
    expect(html).not.toContain('@reviewer');
    expect(html).not.toContain('%%');
    // Surrounding text survives.
    expect(html).toContain('Visible body text.');
    expect(html).toContain('Done.');
  });

  it('strips block memos cleanly', async () => {
    const md = 'para 1\n\n%%\n@ai check stats\nfollowup\n%%\n\npara 2';
    const html = await renderHtml(md, 'doc');
    expect(html).not.toContain('check stats');
    expect(html).not.toContain('followup');
    expect(html).toContain('para 1');
    expect(html).toContain('para 2');
  });

  it('preserves memos as visible blockquotes when includeComments is true', async () => {
    const md = 'See %% @ai run Wilcoxon %% next.';
    const html = await renderHtml(md, 'doc', '', { includeComments: true });
    // The promoted form `[메모: @ai run Wilcoxon]` is rendered as part of the
    // surrounding paragraph.
    expect(html).toContain('@ai');
    expect(html).toContain('run Wilcoxon');
  });

  it('preserves block memos as blockquotes when includeComments is true', async () => {
    const md = '%%\n@reviewer concern about cohort size\n%%';
    const html = await renderHtml(md, 'doc', '', { includeComments: true });
    // Block memos become blockquotes — markdown-it wraps them in
    // `<blockquote>` tags.
    expect(html).toContain('<blockquote>');
    expect(html).toContain('concern about cohort size');
  });

  it('does not touch `%%` inside fenced code blocks', async () => {
    const md = '```\nlet x = "%% literal %%";\n```';
    const html = await renderHtml(md, 'doc');
    expect(html).toContain('%% literal %%');
  });

  it('does not let a memo with `[@key]` inside disturb citation numbering', async () => {
    const md = 'real cite [@a]. %% @ai also see [@b] %% end.';
    const html = await renderHtml(md, 'doc');
    // Memo (and the `[@b]` inside it) is gone.
    expect(html).not.toContain('also see');
    expect(html).not.toContain('@ai');
    expect(html).not.toContain('@b');
    // The real citation `[@a]` stays as raw text since no bibliography is provided.
    expect(html).toContain('real cite');
  });
});
