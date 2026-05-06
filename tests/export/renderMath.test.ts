import { describe, it, expect } from 'vitest';
import { renderInline, renderBlock, injectMath } from '../../src/export/renderMath';

describe('renderMath', () => {
  it('renders inline', () => {
    expect(renderInline('x^2')).toMatch(/class="katex"/);
  });

  it('renders block', () => {
    expect(renderBlock('x^2')).toMatch(/katex-display|displayMode/);
  });

  it('injects inline in plain HTML', () => {
    expect(injectMath('<p>$x$</p>')).toMatch(/katex/);
  });

  it('inject skips inside <pre>', () => {
    expect(injectMath('<pre>$x$</pre>')).toBe('<pre>$x$</pre>');
  });

  it('inject skips inside <code>', () => {
    expect(injectMath('<code>$x$</code>')).toBe('<code>$x$</code>');
  });

  it('inject handles block math', () => {
    expect(injectMath('<p>$$x^2$$</p>')).toMatch(/katex-display|displayMode/);
  });
});
