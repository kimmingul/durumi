import { describe, it, expect } from 'vitest';
import { parseComments, stripComments, promoteComments } from '../../shared/comments';

describe('parseComments', () => {
  it('parses an inline comment with a tag', () => {
    const memos = parseComments('a %% @ai stats verify %% b');
    expect(memos).toHaveLength(1);
    expect(memos[0]).toMatchObject({
      line: 1,
      tag: 'ai',
      block: false,
    });
    expect(memos[0]?.text).toBe('stats verify');
  });

  it('parses an inline comment without a tag', () => {
    const memos = parseComments('hi %% just a note %% bye');
    expect(memos).toHaveLength(1);
    expect(memos[0]?.tag).toBeNull();
    expect(memos[0]?.text).toBe('just a note');
  });

  it('does not match `100%% complete` (word-boundary gate)', () => {
    expect(parseComments('100%% complete')).toEqual([]);
  });

  it('rejects empty body', () => {
    expect(parseComments('a %% %% b')).toEqual([]);
    expect(parseComments('a %%%% b')).toEqual([]);
  });

  it('rejects `%%%text%%%` triples', () => {
    expect(parseComments('%%%not match%%%')).toEqual([]);
  });

  it('parses multiple inline comments on one line', () => {
    const memos = parseComments('%% @ai foo %% and %% bar %%');
    expect(memos).toHaveLength(2);
    expect(memos[0]?.tag).toBe('ai');
    expect(memos[1]?.tag).toBeNull();
  });

  it('parses a block comment with a tag', () => {
    const src = '%%\n@reviewer multi\nline body\n%%';
    const memos = parseComments(src);
    expect(memos).toHaveLength(1);
    expect(memos[0]?.block).toBe(true);
    expect(memos[0]?.tag).toBe('reviewer');
    expect(memos[0]?.text).toContain('multi');
    expect(memos[0]?.text).toContain('line body');
  });

  it('reports correct line numbers', () => {
    const src = 'first\nsecond %% inline %%\nthird';
    const memos = parseComments(src);
    expect(memos).toHaveLength(1);
    expect(memos[0]?.line).toBe(2);
  });

  it('skips matches inside fenced code blocks', () => {
    const src = '```\n%% not a memo %%\n```\n%% real one %%';
    const memos = parseComments(src);
    expect(memos).toHaveLength(1);
    expect(memos[0]?.text).toBe('real one');
  });

  it('lowercases tags and strips trailing colon', () => {
    const memos = parseComments('%% @AI: foo %%');
    expect(memos[0]?.tag).toBe('ai');
  });
});

describe('stripComments', () => {
  it('removes inline memos and leaves prose', () => {
    const src = 'before %% @ai note %% after';
    expect(stripComments(src)).toBe('before  after');
  });

  it('removes block memos and consumes the trailing newline', () => {
    const src = 'para 1\n\n%%\nblock memo\n%%\n\npara 2';
    const out = stripComments(src);
    expect(out).not.toContain('block memo');
    expect(out).toContain('para 1');
    expect(out).toContain('para 2');
  });

  it('preserves `%%` inside fenced code', () => {
    const src = '```\n%% kept %%\n```';
    expect(stripComments(src)).toBe(src);
  });

  it('is a no-op when there are no memos', () => {
    expect(stripComments('hello\nworld')).toBe('hello\nworld');
  });
});

describe('promoteComments', () => {
  it('promotes inline memos into a `[메모: …]` marker', () => {
    const src = 'see %% @ai check %% here';
    const out = promoteComments(src);
    expect(out).toContain('[메모: @ai check]');
  });

  it('promotes block memos into blockquotes', () => {
    const src = '%%\n@reviewer issue here\n%%';
    const out = promoteComments(src);
    expect(out).toContain('> **메모 @reviewer**');
    expect(out).toContain('> issue here');
  });

  it('omits the tag prefix for untagged memos', () => {
    const src = 'a %% bare note %% b';
    const out = promoteComments(src);
    expect(out).toContain('[메모: bare note]');
  });
});
