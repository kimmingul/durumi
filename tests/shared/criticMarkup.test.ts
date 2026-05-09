import { describe, it, expect } from 'vitest';
import { parseCmAnnotations, transformCm } from '../../shared/criticMarkup';

describe('parseCmAnnotations', () => {
  it('parses an insertion', () => {
    const a = parseCmAnnotations('hello {++ added ++} world');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: 'insert', line: 1, text: 'added' });
  });

  it('parses a deletion', () => {
    const a = parseCmAnnotations('foo {-- gone --} bar');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: 'delete', text: 'gone' });
  });

  it('parses a substitution and exposes oldText / newText', () => {
    const a = parseCmAnnotations('say {~~ hi ~> hello ~~} now');
    expect(a).toHaveLength(1);
    expect(a[0].kind).toBe('substitution');
    expect(a[0].oldText).toBe('hi');
    expect(a[0].newText).toBe('hello');
    expect(a[0].text).toBe('hi → hello');
  });

  it('parses a highlight (distinct from ==text==)', () => {
    const a = parseCmAnnotations('a {== marked ==} b');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: 'highlight', text: 'marked' });
    // Plain `==text==` does not get matched as a CM highlight.
    expect(parseCmAnnotations('a ==plain== b')).toEqual([]);
  });

  it('parses a comment', () => {
    const a = parseCmAnnotations('a {>> note <<} b');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: 'comment', text: 'note' });
  });

  it('captures correct line numbers', () => {
    const a = parseCmAnnotations('first\nsecond {++ x ++}\nthird');
    expect(a).toHaveLength(1);
    expect(a[0].line).toBe(2);
  });

  it('skips runs inside fenced code', () => {
    const src = '```\n{++ ignored ++}\n```\nreal {-- x --} here';
    const a = parseCmAnnotations(src);
    expect(a).toHaveLength(1);
    expect(a[0].kind).toBe('delete');
  });

  it('rejects multi-line bodies (closer must be on the same line)', () => {
    expect(parseCmAnnotations('open {++ line\nbreak ++} done')).toEqual([]);
  });

  it('rejects empty / whitespace-only bodies', () => {
    expect(parseCmAnnotations('a {++++} b')).toEqual([]);
    expect(parseCmAnnotations('a {==  ==} b')).toEqual([]);
    expect(parseCmAnnotations('a {>><<} b')).toEqual([]);
  });

  it('parses several runs on one line in document order', () => {
    const a = parseCmAnnotations('{++ ins ++} {-- del --} {== mark ==} {>> note <<}');
    expect(a.map((x) => x.kind)).toEqual([
      'insert',
      'delete',
      'highlight',
      'comment',
    ]);
  });

  it('returns absolute byte offsets', () => {
    const src = 'first line\nhello {++ x ++} world';
    const a = parseCmAnnotations(src);
    expect(a).toHaveLength(1);
    expect(src.slice(a[0].from, a[0].to)).toBe('{++ x ++}');
  });
});

describe('transformCm — accept mode', () => {
  it('insert: keeps inner', () => {
    expect(transformCm('a {++ X ++} b', 'accept', 'html')).toBe('a X b');
    expect(transformCm('a {++ X ++} b', 'accept', 'pandoc')).toBe('a X b');
  });

  it('delete: drops the entire span', () => {
    expect(transformCm('a {-- X --} b', 'accept', 'html')).toBe('a  b');
  });

  it('substitution: keeps newText only', () => {
    expect(transformCm('say {~~old~>new~~} now', 'accept', 'html')).toBe(
      'say new now',
    );
  });

  it('highlight (html): wraps inner as ==text== for markdown-it-mark', () => {
    expect(transformCm('a {== M ==} b', 'accept', 'html')).toBe('a ==M== b');
  });

  it('highlight (pandoc): leaves inner bare', () => {
    expect(transformCm('a {== M ==} b', 'accept', 'pandoc')).toBe('a M b');
  });

  it('comment: drops the entire span', () => {
    expect(transformCm('see {>> note <<} here', 'accept', 'html')).toBe(
      'see  here',
    );
  });
});

describe('transformCm — preserve mode (HTML)', () => {
  it('insert → <ins>', () => {
    expect(transformCm('a {++ X ++} b', 'preserve', 'html')).toBe('a <ins>X</ins> b');
  });

  it('delete → <del>', () => {
    expect(transformCm('a {-- X --} b', 'preserve', 'html')).toBe('a <del>X</del> b');
  });

  it('substitution → <del>+<ins>', () => {
    expect(transformCm('a {~~ old ~> new ~~} b', 'preserve', 'html')).toBe(
      'a <del>old</del><ins>new</ins> b',
    );
  });

  it('highlight → <mark class="cm-highlight">', () => {
    expect(transformCm('a {== M ==} b', 'preserve', 'html')).toBe(
      'a <mark class="cm-highlight">M</mark> b',
    );
  });

  it('comment → <aside class="cm-comment">', () => {
    expect(transformCm('a {>> note <<} b', 'preserve', 'html')).toBe(
      'a <aside class="cm-comment">note</aside> b',
    );
  });
});

describe('transformCm — preserve mode (Pandoc)', () => {
  it('insert → [text]{.insertion}', () => {
    expect(transformCm('a {++ X ++} b', 'preserve', 'pandoc')).toBe(
      'a [X]{.insertion} b',
    );
  });

  it('delete → [text]{.deletion}', () => {
    expect(transformCm('a {-- X --} b', 'preserve', 'pandoc')).toBe(
      'a [X]{.deletion} b',
    );
  });

  it('substitution → both spans', () => {
    expect(transformCm('a {~~old~>new~~} b', 'preserve', 'pandoc')).toBe(
      'a [old]{.deletion}[new]{.insertion} b',
    );
  });

  it('highlight → [text]{.highlight}', () => {
    expect(transformCm('a {== M ==} b', 'preserve', 'pandoc')).toBe(
      'a [M]{.highlight} b',
    );
  });

  it('comment → ::: comment fenced div', () => {
    const out = transformCm('a {>> note <<} b', 'preserve', 'pandoc');
    expect(out).toContain('::: comment');
    expect(out).toContain('note');
    expect(out).toContain(':::');
  });
});

describe('transformCm — edge cases', () => {
  it('is a no-op on inputs without any CriticMarkup', () => {
    const src = 'plain markdown\nwith *emphasis* and `code`';
    expect(transformCm(src, 'accept', 'html')).toBe(src);
    expect(transformCm(src, 'preserve', 'html')).toBe(src);
    expect(transformCm(src, 'accept', 'pandoc')).toBe(src);
    expect(transformCm(src, 'preserve', 'pandoc')).toBe(src);
  });

  it('preserves fenced code content untouched', () => {
    const src = '```\n{++ code-internal ++}\n```\nreal {++ x ++} here';
    const out = transformCm(src, 'accept', 'html');
    expect(out).toContain('{++ code-internal ++}');
    expect(out).toContain('real x here');
  });

  it('handles multiple operators on the same line in document order', () => {
    const src = '{++ A ++} {-- B --} {== C ==} {>> D <<}';
    expect(transformCm(src, 'accept', 'html')).toBe('A  ==C== ');
  });

  it('is idempotent: applying accept twice equals once', () => {
    const src = 'see {++ added ++} and {-- removed --}';
    const once = transformCm(src, 'accept', 'html');
    const twice = transformCm(once, 'accept', 'html');
    expect(twice).toBe(once);
  });

  it('survives unbalanced operators (no closer) by leaving them as-is', () => {
    const src = 'a {++ no closer here\nb';
    expect(transformCm(src, 'accept', 'html')).toBe(src);
    expect(transformCm(src, 'preserve', 'pandoc')).toBe(src);
  });
});
