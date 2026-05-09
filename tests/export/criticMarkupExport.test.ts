import { describe, it, expect } from 'vitest';
import { renderHtml } from '../../src/export/renderHtml';

describe('renderHtml CriticMarkup track-changes policy', () => {
  it('accepts insertions by default (keeps the inner text)', async () => {
    const md = 'before {++ added ++} after';
    const html = await renderHtml(md, 'doc');
    expect(html).toContain('before');
    expect(html).toContain('added');
    expect(html).toContain('after');
    expect(html).not.toContain('{++');
    // accept-mode does not emit <ins>.
    expect(html).not.toContain('<ins>');
  });

  it('drops deletions by default', async () => {
    const md = 'keep {-- gone --} this';
    const html = await renderHtml(md, 'doc');
    expect(html).not.toContain('gone');
    expect(html).not.toContain('{--');
    expect(html).toContain('keep');
    expect(html).toContain('this');
  });

  it('resolves substitutions to the new text by default', async () => {
    const md = 'say {~~ greeting ~> hello ~~} there';
    const html = await renderHtml(md, 'doc');
    expect(html).toContain('hello');
    expect(html).toContain('there');
    expect(html).not.toContain('greeting');
    expect(html).not.toContain('~>');
  });

  it('passes highlights through as <mark> via markdown-it-mark', async () => {
    const md = 'a {== marked ==} b';
    const html = await renderHtml(md, 'doc');
    expect(html).toContain('<mark>marked</mark>');
  });

  it('drops reviewer comments by default', async () => {
    const md = 'see {>> reviewer note <<} here';
    const html = await renderHtml(md, 'doc');
    expect(html).not.toContain('reviewer note');
    expect(html).not.toContain('{>>');
  });

  it('preserveAnnotations=true emits <ins> for insertions', async () => {
    const md = 'before {++ added ++} after';
    const html = await renderHtml(md, 'doc', '', { preserveAnnotations: true });
    expect(html).toContain('<ins>added</ins>');
  });

  it('preserveAnnotations=true emits <del> for deletions', async () => {
    const md = 'keep {-- gone --} this';
    const html = await renderHtml(md, 'doc', '', { preserveAnnotations: true });
    expect(html).toContain('<del>gone</del>');
  });

  it('preserveAnnotations=true emits <del>+<ins> for substitutions', async () => {
    const md = 'say {~~old~>new~~} there';
    const html = await renderHtml(md, 'doc', '', { preserveAnnotations: true });
    expect(html).toContain('<del>old</del>');
    expect(html).toContain('<ins>new</ins>');
  });

  it('preserveAnnotations=true emits <mark class="cm-highlight"> for tracked highlights', async () => {
    const md = 'a {== marked ==} b';
    const html = await renderHtml(md, 'doc', '', { preserveAnnotations: true });
    expect(html).toContain('<mark class="cm-highlight">marked</mark>');
  });

  it('preserveAnnotations=true emits <aside class="cm-comment"> for comments', async () => {
    const md = 'see {>> note <<} here';
    const html = await renderHtml(md, 'doc', '', { preserveAnnotations: true });
    expect(html).toContain('<aside class="cm-comment">note</aside>');
  });

  it('does not touch CriticMarkup inside fenced code blocks', async () => {
    const md = '```\nlet x = "{++ literal ++}";\n```';
    const html = await renderHtml(md, 'doc');
    expect(html).toContain('{++ literal ++}');
  });

  it('the ==text== inline-extras highlight still renders normally alongside CM', async () => {
    const md = 'a ==plain== b {== tracked ==} c';
    const html = await renderHtml(md, 'doc');
    expect(html).toContain('<mark>plain</mark>');
    expect(html).toContain('<mark>tracked</mark>');
  });
});
