import { describe, it, expect } from 'vitest';
import { getExportStyles } from '../../src/export/exportStyles';

describe('getExportStyles', () => {
  const css = getExportStyles();

  it('contains all 10 cm-tok-* token classes', () => {
    for (const tok of [
      'cm-tok-keyword',
      'cm-tok-string',
      'cm-tok-comment',
      'cm-tok-number',
      'cm-tok-function',
      'cm-tok-type',
      'cm-tok-variable',
      'cm-tok-operator',
      'cm-tok-punct',
      'cm-tok-atom',
    ]) {
      expect(css, `missing rule for .${tok}`).toContain(`.${tok}`);
    }
  });

  it('declares an A4 @page rule for print', () => {
    expect(css).toContain('@page');
    expect(css).toContain('A4');
  });

  it('uses Korean-friendly font fallback', () => {
    expect(css).toMatch(/Apple SD Gothic Neo|Malgun Gothic|Noto Sans KR/);
  });

  it('declares page-break-inside avoid for code/tables', () => {
    expect(css).toContain('page-break-inside');
  });

  it('produces a non-trivial length', () => {
    expect(css.length).toBeGreaterThan(1000);
  });
});
