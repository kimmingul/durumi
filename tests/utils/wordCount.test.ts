import { describe, it, expect } from 'vitest';
import { computeWordStats } from '../../src/utils/wordCount';

describe('computeWordStats', () => {
  it('counts a simple paragraph', () => {
    const s = computeWordStats('Hello world from durumi');
    expect(s.words).toBe(4);
    expect(s.chars).toBe(23);
    expect(s.charsNoSpaces).toBe(20);
    expect(s.readingMinutes).toBe(1);
  });

  it('strips heading hashes from word count', () => {
    expect(computeWordStats('# Heading text').words).toBe(2);
  });

  it('does not count list bullets as words', () => {
    expect(computeWordStats('- alpha\n- beta\n- gamma').words).toBe(3);
    expect(computeWordStats('1. alpha\n2. beta').words).toBe(2);
  });

  it('strips fenced code blocks entirely', () => {
    const md = 'before\n\n```js\nconst x = 1;\n```\n\nafter';
    expect(computeWordStats(md).words).toBe(2);
  });

  it('counts the visible label of links and images', () => {
    expect(computeWordStats('See [Durumi docs](https://x) site').words).toBe(4);
    expect(computeWordStats('![alt text here](img.png)').words).toBe(3);
  });

  it('strips footnote refs and definition prefixes', () => {
    const md = 'note[^a] body\n\n[^a]: explanation here\n';
    expect(computeWordStats(md).words).toBe(4); // note body explanation here
  });

  it('strips a YAML front matter block from the count', () => {
    const md = '---\ntitle: Doc\nauthor: Min\n---\n\nbody one two';
    expect(computeWordStats(md).words).toBe(3);
  });

  it('reading time scales with word count', () => {
    const text = ('word '.repeat(500)).trim();
    const s = computeWordStats(text);
    expect(s.words).toBe(500);
    expect(s.readingMinutes).toBe(3); // ceil(500/230) = 3
  });

  it('always reports at least 1 minute, even for tiny docs', () => {
    expect(computeWordStats('hi').readingMinutes).toBe(1);
    expect(computeWordStats('').readingMinutes).toBe(1);
  });
});
