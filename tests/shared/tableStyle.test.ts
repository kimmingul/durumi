import { describe, it, expect } from 'vitest';
import {
  borderToCss,
  defaultStyle,
  isDefaultStyle,
  isHtmlWrapperCloseLine,
  isHtmlWrapperOpenLine,
  isPandocAttrLine,
  parseBorderShorthand,
  parseHtmlWrapper,
  parsePandocAttrs,
  presets,
  serializeBorder,
  serializeHtmlWrapper,
  serializePandocAttrs,
  styleEquals,
  styleToCssVars,
} from '../../shared/tableStyle';

describe('parseBorderShorthand', () => {
  it('parses "1px solid #000"', () => {
    expect(parseBorderShorthand('1px solid #000')).toEqual({
      width: '1px',
      style: 'solid',
      color: '#000',
    });
  });

  it('parses "2px dashed red"', () => {
    expect(parseBorderShorthand('2px dashed red')).toEqual({
      width: '2px',
      style: 'dashed',
      color: 'red',
    });
  });

  it('parses just a width', () => {
    expect(parseBorderShorthand('3px')).toEqual({ width: '3px' });
  });

  it('parses style + color without width', () => {
    expect(parseBorderShorthand('solid #abc')).toEqual({ style: 'solid', color: '#abc' });
  });

  it('treats "none" as 0-width none', () => {
    expect(parseBorderShorthand('none')).toEqual({ style: 'none', width: '0' });
  });

  it('returns null on empty input', () => {
    expect(parseBorderShorthand('   ')).toBeNull();
  });

  it('tolerates extra whitespace', () => {
    expect(parseBorderShorthand('  2px   solid    #000  ')).toEqual({
      width: '2px',
      style: 'solid',
      color: '#000',
    });
  });

  it('preserves color literals like var(--border)', () => {
    expect(parseBorderShorthand('1px solid var(--border)')).toEqual({
      width: '1px',
      style: 'solid',
      color: 'var(--border)',
    });
  });
});

describe('serializeBorder + borderToCss', () => {
  it('round-trips a full BorderSpec', () => {
    const spec = { width: '2px', style: 'solid' as const, color: '#000' };
    expect(serializeBorder(spec)).toBe('2px solid #000');
    expect(parseBorderShorthand(serializeBorder(spec))).toEqual(spec);
  });

  it('borderToCss collapses none/0', () => {
    expect(borderToCss({ width: '0', style: 'none' })).toBe('0');
    expect(borderToCss({ width: '1px', style: 'none' })).toBe('0');
    expect(borderToCss({ width: '0' })).toBe('0');
    expect(borderToCss({ width: '1px', style: 'solid', color: 'red' })).toBe('1px solid red');
  });

  it('borderToCss falls back to currentColor when color is absent', () => {
    expect(borderToCss({ width: '1px', style: 'solid' })).toBe('1px solid currentColor');
  });

  it('borderToCss returns empty string for undefined spec', () => {
    expect(borderToCss(undefined)).toBe('');
  });
});

describe('isPandocAttrLine / isHtmlWrapperOpenLine / isHtmlWrapperCloseLine', () => {
  it('recognises a pandoc attr line', () => {
    expect(isPandocAttrLine('{.durumi-table data-top-rule="2px solid"}')).toBe(true);
    expect(isPandocAttrLine('   {.durumi-table}  ')).toBe(true);
  });

  it('rejects lines without the class', () => {
    expect(isPandocAttrLine('{.other-class}')).toBe(false);
    expect(isPandocAttrLine('just text')).toBe(false);
    expect(isPandocAttrLine('| a | b |')).toBe(false);
  });

  it('recognises a html wrapper opening tag', () => {
    expect(isHtmlWrapperOpenLine('<div class="durumi-table">')).toBe(true);
    expect(isHtmlWrapperOpenLine('<div data-x="1" class="durumi-table" data-y="2">')).toBe(true);
  });

  it('rejects html wrapper open lines without the class', () => {
    expect(isHtmlWrapperOpenLine('<div class="other">')).toBe(false);
    expect(isHtmlWrapperOpenLine('<div>')).toBe(false);
  });

  it('recognises a html wrapper closing tag', () => {
    expect(isHtmlWrapperCloseLine('</div>')).toBe(true);
    expect(isHtmlWrapperCloseLine('  </div>  ')).toBe(true);
  });
});

describe('parsePandocAttrs', () => {
  it('parses a full attr block', () => {
    const out = parsePandocAttrs('{.durumi-table data-top-rule="2px solid #000" data-row-rules="0.5px solid #888"}');
    expect(out).not.toBeNull();
    expect(out!.topRule).toEqual({ width: '2px', style: 'solid', color: '#000' });
    expect(out!.rowRules).toEqual({ width: '0.5px', style: 'solid', color: '#888' });
  });

  it('returns null when the class anchor is missing', () => {
    expect(parsePandocAttrs('{.other-class data-top-rule="2px solid"}')).toBeNull();
  });

  it('parses inner contents without the braces', () => {
    const out = parsePandocAttrs('.durumi-table data-bottom-rule="2px solid black"');
    expect(out).not.toBeNull();
    expect(out!.bottomRule).toEqual({ width: '2px', style: 'solid', color: 'black' });
  });

  it('parses cell-pad alias', () => {
    const out = parsePandocAttrs('{.durumi-table data-cell-pad="12px"}');
    expect(out!.cellPadding).toBe('12px');
  });

  it('accepts single-quoted values', () => {
    const out = parsePandocAttrs("{.durumi-table data-top-rule='1px solid red'}");
    expect(out!.topRule).toEqual({ width: '1px', style: 'solid', color: 'red' });
  });
});

describe('parseHtmlWrapper', () => {
  it('parses a full html wrapper opening tag', () => {
    const out = parseHtmlWrapper(
      '<div class="durumi-table" data-top-rule="2px solid #000" data-vert-rules="none">',
    );
    expect(out).not.toBeNull();
    expect(out!.topRule).toEqual({ width: '2px', style: 'solid', color: '#000' });
    expect(out!.verticalRules).toEqual({ width: '0', style: 'none' });
  });

  it('returns null when class is absent', () => {
    expect(parseHtmlWrapper('<div data-top-rule="2px solid">')).toBeNull();
  });

  it('accepts class with multiple values', () => {
    const out = parseHtmlWrapper('<div class="custom durumi-table other" data-top-rule="1px solid">');
    expect(out).not.toBeNull();
    expect(out!.topRule!.width).toBe('1px');
  });

  it('accepts header-rule alias for header-separator', () => {
    const out = parseHtmlWrapper('<div class="durumi-table" data-header-rule="1px solid #000">');
    expect(out!.headerSeparator).toEqual({ width: '1px', style: 'solid', color: '#000' });
  });

  it('accepts vertical-rules alias', () => {
    const out = parseHtmlWrapper('<div class="durumi-table" data-vertical-rules="1px solid">');
    expect(out!.verticalRules).toEqual({ width: '1px', style: 'solid' });
  });
});

describe('serializePandocAttrs', () => {
  it('emits {.durumi-table} for empty style', () => {
    expect(serializePandocAttrs({})).toBe('{.durumi-table}');
  });

  it('emits full attrs', () => {
    const out = serializePandocAttrs({
      topRule: { width: '2px', style: 'solid', color: '#000' },
      cellPadding: '12px',
    });
    expect(out).toBe('{.durumi-table data-top-rule="2px solid #000" data-cell-pad="12px"}');
  });

  it('round-trips through parsePandocAttrs', () => {
    const original = presets.booktabs();
    const wire = serializePandocAttrs(original);
    const parsed = parsePandocAttrs(wire)!;
    expect(parsed).toEqual(original);
  });
});

describe('serializeHtmlWrapper', () => {
  it('wraps a table in a div block', () => {
    const out = serializeHtmlWrapper(
      { topRule: { width: '2px', style: 'solid', color: '#000' } },
      '| a | b |\n|---|---|\n| 1 | 2 |',
    );
    expect(out).toContain('<div class="durumi-table" data-top-rule="2px solid #000">');
    expect(out).toContain('| a | b |');
    expect(out).toContain('</div>');
  });

  it('produces blank lines inside the wrapper for markdown parsing', () => {
    const out = serializeHtmlWrapper(presets.grid(), '| a |\n|---|\n| 1 |');
    expect(out).toMatch(/<div [^>]+>\n\n/);
    expect(out).toMatch(/\n\n<\/div>$/);
  });
});

describe('styleEquals + isDefaultStyle', () => {
  it('default style is equal to itself', () => {
    expect(styleEquals(defaultStyle(), defaultStyle())).toBe(true);
    expect(isDefaultStyle(defaultStyle())).toBe(true);
  });

  it('empty style is not the default (header separator differs)', () => {
    expect(isDefaultStyle({})).toBe(false);
  });

  it('grid preset is not the default', () => {
    expect(isDefaultStyle(presets.grid())).toBe(false);
  });

  it('booktabs preset is not the default', () => {
    expect(isDefaultStyle(presets.booktabs())).toBe(false);
  });

  it('none preset is not the default', () => {
    expect(isDefaultStyle(presets.none())).toBe(false);
  });
});

describe('presets', () => {
  it('none disables every rule', () => {
    const p = presets.none();
    expect(p.topRule!.style).toBe('none');
    expect(p.headerSeparator!.style).toBe('none');
    expect(p.rowRules!.style).toBe('none');
    expect(p.verticalRules!.style).toBe('none');
    expect(p.bottomRule!.style).toBe('none');
  });

  it('default has only the header separator + cell padding', () => {
    const p = presets.default();
    expect(p.headerSeparator).toBeDefined();
    expect(p.cellPadding).toBe('8px');
    expect(p.topRule).toBeUndefined();
    expect(p.rowRules).toBeUndefined();
    expect(p.verticalRules).toBeUndefined();
    expect(p.bottomRule).toBeUndefined();
  });

  it('booktabs has top/header/bottom but no vertical rules', () => {
    const p = presets.booktabs();
    expect(p.topRule!.width).toBe('2px');
    expect(p.bottomRule!.width).toBe('2px');
    expect(p.headerSeparator!.width).toBe('1px');
    expect(p.verticalRules!.style).toBe('none');
    expect(p.rowRules!.style).toBe('none');
  });

  it('grid has all rules enabled', () => {
    const p = presets.grid();
    expect(p.topRule!.style).toBe('solid');
    expect(p.headerSeparator!.style).toBe('solid');
    expect(p.rowRules!.style).toBe('solid');
    expect(p.verticalRules!.style).toBe('solid');
    expect(p.bottomRule!.style).toBe('solid');
  });
});

describe('styleToCssVars', () => {
  it('maps every set field to a CSS variable', () => {
    const vars = styleToCssVars(presets.grid());
    expect(vars['--durumi-table-top-rule']).toBeTruthy();
    expect(vars['--durumi-table-header-separator']).toBeTruthy();
    expect(vars['--durumi-table-row-rules']).toBeTruthy();
    expect(vars['--durumi-table-vert-rules']).toBeTruthy();
    expect(vars['--durumi-table-bottom-rule']).toBeTruthy();
    expect(vars['--durumi-table-cell-pad']).toBe('8px');
  });

  it('omits unset fields', () => {
    const vars = styleToCssVars({ topRule: { width: '1px', style: 'solid', color: '#000' } });
    expect(vars['--durumi-table-top-rule']).toBe('1px solid #000');
    expect(vars['--durumi-table-row-rules']).toBeUndefined();
  });
});
