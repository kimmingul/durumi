import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  renderInlineMarksToDom,
  _testing,
} from '../../src/editor/markdownExt/inlineMarkdownRenderer';
import { _resetForTest as resetKatex } from '../../src/editor/math/katexLoader';

const { tokenizeAtoms, splitEmphasis } = _testing;

function html(frag: DocumentFragment): string {
  const host = document.createElement('div');
  host.appendChild(frag.cloneNode(true));
  return host.innerHTML;
}

function render(src: string): string {
  return html(renderInlineMarksToDom(src));
}

beforeEach(() => {
  resetKatex();
});

afterEach(() => {
  resetKatex();
});

describe('inlineMarkdownRenderer — atomic tokenization', () => {
  it('emits a single text token for plain content', () => {
    expect(tokenizeAtoms('hello world')).toEqual([
      { kind: 'text', value: 'hello world' },
    ]);
  });

  it('captures inline code and surrounding text', () => {
    expect(tokenizeAtoms('a `code` b')).toEqual([
      { kind: 'text', value: 'a ' },
      { kind: 'code', value: 'code' },
      { kind: 'text', value: ' b' },
    ]);
  });

  it('captures inline math', () => {
    expect(tokenizeAtoms('x $a+b$ y')).toEqual([
      { kind: 'text', value: 'x ' },
      { kind: 'math', value: 'a+b' },
      { kind: 'text', value: ' y' },
    ]);
  });

  it('rejects inline math with leading or trailing whitespace', () => {
    expect(tokenizeAtoms('$ a$')).toEqual([{ kind: 'text', value: '$ a$' }]);
    expect(tokenizeAtoms('$a $')).toEqual([{ kind: 'text', value: '$a $' }]);
  });

  it('captures Pandoc citations', () => {
    expect(tokenizeAtoms('see [@smith2023]')).toEqual([
      { kind: 'text', value: 'see ' },
      { kind: 'citation', keys: ['smith2023'], raw: '[@smith2023]' },
    ]);
  });

  it('captures author-suppressing citations and multi-key citations', () => {
    expect(tokenizeAtoms('[-@k1]')).toEqual([
      { kind: 'citation', keys: ['k1'], raw: '[-@k1]' },
    ]);
    expect(tokenizeAtoms('[@a; @b]')).toEqual([
      { kind: 'citation', keys: ['a', 'b'], raw: '[@a; @b]' },
    ]);
  });

  it('captures links and falls through to text for footnotes', () => {
    expect(tokenizeAtoms('[text](https://example.com)')).toEqual([
      { kind: 'link', text: 'text', url: 'https://example.com' },
    ]);
    // Footnote-style references are left untouched (not link, not citation).
    expect(tokenizeAtoms('see [^1]')).toEqual([{ kind: 'text', value: 'see [^1]' }]);
  });

  it('honours backslash escapes for emphasis markers in text segments', () => {
    // Escaped markers are emitted as separate `literal` tokens so the
    // emphasis pass never sees them as opening / closing chars.
    expect(tokenizeAtoms('a \\*b\\* c')).toEqual([
      { kind: 'text', value: 'a ' },
      { kind: 'literal', value: '*' },
      { kind: 'text', value: 'b' },
      { kind: 'literal', value: '*' },
      { kind: 'text', value: ' c' },
    ]);
  });
});

describe('inlineMarkdownRenderer — emphasis parsing', () => {
  it('parses simple emphasis', () => {
    const spans = splitEmphasis('hello *world*');
    expect(spans).toHaveLength(2);
    expect(spans[0]).toEqual({ kind: 'text', text: 'hello ' });
    expect(spans[1]!.kind).toBe('em');
  });

  it('parses simple strong', () => {
    const spans = splitEmphasis('**bold**');
    expect(spans).toHaveLength(1);
    expect(spans[0]!.kind).toBe('strong');
    expect((spans[0]!.inner ?? [])[0]).toEqual({ kind: 'text', text: 'bold' });
  });

  it('parses nested strong-with-em', () => {
    const spans = splitEmphasis('**bold *italic***');
    expect(spans).toHaveLength(1);
    expect(spans[0]!.kind).toBe('strong');
    const inner = spans[0]!.inner ?? [];
    expect(inner.some((s) => s.kind === 'em')).toBe(true);
  });

  it('skips intra-word underscores', () => {
    expect(splitEmphasis('snake_case_x')).toEqual([
      { kind: 'text', text: 'snake_case_x' },
    ]);
  });

  it('parses superscript and subscript', () => {
    const spans = splitEmphasis('H~2~O and X^2^');
    const kinds = spans.map((s) => s.kind);
    expect(kinds).toContain('sub');
    expect(kinds).toContain('sup');
  });

  it('parses strikethrough', () => {
    const spans = splitEmphasis('~~gone~~');
    expect(spans).toHaveLength(1);
    expect(spans[0]!.kind).toBe('strike');
  });

  it('rejects empty emphasis (e.g. `**` adjacent)', () => {
    expect(splitEmphasis('****')).toEqual([{ kind: 'text', text: '****' }]);
  });

  it('rejects emphasis that starts or ends with whitespace', () => {
    expect(splitEmphasis('** bold **').map((s) => s.kind)).toEqual(['text']);
    expect(splitEmphasis('* italic *').map((s) => s.kind)).toEqual(['text']);
  });
});

describe('inlineMarkdownRenderer — DOM emission', () => {
  it('renders empty input as an empty text node fragment', () => {
    const f = renderInlineMarksToDom('');
    expect(f.childNodes.length).toBe(1);
    expect(f.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect((f.firstChild as Text).data).toBe('');
  });

  it('renders plain text as a text node', () => {
    const out = render('hello');
    expect(out).toBe('hello');
  });

  it('renders bold as <strong>', () => {
    const out = render('**bold**');
    expect(out).toBe('<strong>bold</strong>');
  });

  it('renders italic as <em>', () => {
    const out = render('*italic*');
    expect(out).toBe('<em>italic</em>');
  });

  it('renders strikethrough as <s>', () => {
    const out = render('~~gone~~');
    expect(out).toBe('<s>gone</s>');
  });

  it('renders inline code as <code> with the existing class', () => {
    const out = render('`x`');
    expect(out).toContain('<code class="cm-md-inline-code">x</code>');
  });

  it('renders citation as a styled sup pill', () => {
    const out = render('[@smith2023]');
    expect(out).toContain('cm-md-citation');
    expect(out).toContain('@smith2023');
  });

  it('renders link as <a> with the existing class and href', () => {
    const out = render('[text](https://example.com)');
    expect(out).toContain('cm-md-link');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('>text<');
  });

  it('renders superscript and subscript', () => {
    expect(render('H~2~O')).toContain('<sub>2</sub>');
    expect(render('X^2^')).toContain('<sup>2</sup>');
  });

  it('handles nested marks: bold containing italic', () => {
    const out = render('**bold *italic***');
    expect(out).toMatch(/<strong>bold <em>italic<\/em><\/strong>/);
  });

  it('handles inline marks inside link text', () => {
    const out = render('[**bold**](https://x)');
    expect(out).toContain('<a class="cm-md-link" href="https://x"><strong>bold</strong></a>');
  });

  it('renders math as a placeholder span while KaTeX is lazy-loading', () => {
    const out = render('$x^2$');
    expect(out).toContain('cm-math-inline');
    // First render: raw `$x^2$` text until KaTeX cache fills.
    expect(out).toContain('$x^2$');
  });

  it('preserves Korean text inside bold marks', () => {
    const out = render('**한글**');
    expect(out).toBe('<strong>한글</strong>');
  });

  it('preserves Korean text in plain segments', () => {
    expect(render('가나다')).toBe('가나다');
  });

  it('escaped marker becomes a literal character', () => {
    const out = render('a \\*b\\* c');
    expect(out).toBe('a *b* c');
  });

  it('inline code with special chars is rendered verbatim', () => {
    // `**` inside a code span must NOT be parsed as emphasis.
    const out = render('`**not bold**`');
    expect(out).toContain('<code class="cm-md-inline-code">**not bold**</code>');
  });

  it('unclosed marker is left as literal text', () => {
    const out = render('a *b');
    expect(out).toBe('a *b');
  });

  it('multiple atomic tokens in one cell', () => {
    const out = render('see [@k] with `x` and **y**');
    expect(out).toContain('cm-md-citation');
    expect(out).toContain('<code class="cm-md-inline-code">x</code>');
    expect(out).toContain('<strong>y</strong>');
  });
});

describe('inlineMarkdownRenderer — KaTeX cache miss vs hit', () => {
  it('first call returns null cache and inflight rendering kicks off', async () => {
    // We can't reliably await the dynamic import of katex in a unit env, but
    // we CAN verify the sync path: cache miss → placeholder.
    const frag = renderInlineMarksToDom('$a+b$');
    const span = (frag.firstChild as HTMLElement);
    expect(span.className).toBe('cm-math-inline');
    expect(span.textContent).toBe('$a+b$');
  });
});
