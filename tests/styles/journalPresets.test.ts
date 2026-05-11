import { describe, expect, it, beforeEach } from 'vitest';
import {
  JOURNAL_PRESETS,
  PRESET_IDS,
  STYLE_ENTRIES,
  DEFAULT_PRESET_ID,
  cloneStyleSet,
  defaultStyleSet,
  getPreset,
  isValidStyleSet,
  type StyleSet,
} from '../../src/styles/journalPresets';
import {
  applyStyleSet,
  clearStyleSet,
  styleVarNames,
} from '../../src/styles/applyStyles';

describe('journalPresets', () => {
  it('exposes exactly six prebuilt preset ids in the documented order', () => {
    expect(PRESET_IDS).toEqual([
      'durumi-default',
      'classic-manuscript',
      'nature-style',
      'lancet-style',
      'jkms-korean',
      'comfortable-draft',
    ]);
  });

  it('declares ten style entries (body + h1–h6 + blockquote + code + tableHeader)', () => {
    expect(STYLE_ENTRIES).toEqual([
      'body',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'code',
      'tableHeader',
    ]);
  });

  it('every preset has every style entry with a valid StyleSpec shape', () => {
    for (const id of PRESET_IDS) {
      const preset = JOURNAL_PRESETS[id];
      expect(preset.id).toBe(id);
      expect(typeof preset.i18nKey).toBe('string');
      expect(isValidStyleSet(preset.styles)).toBe(true);
      for (const entry of STYLE_ENTRIES) {
        const spec = preset.styles[entry];
        expect(typeof spec.fontFamily).toBe('string');
        expect(spec.fontFamily.length).toBeGreaterThan(0);
        expect(spec.fontSizePx).toBeGreaterThan(0);
        expect([400, 500, 600, 700]).toContain(spec.fontWeight);
        expect(spec.color === null || typeof spec.color === 'string').toBe(true);
        expect(spec.lineHeight).toBeGreaterThanOrEqual(1);
        expect(spec.lineHeight).toBeLessThanOrEqual(4);
      }
    }
  });

  it('matches the spec sheet for each preset (body + H1 + H2 + H3)', () => {
    const cm = JOURNAL_PRESETS['classic-manuscript'].styles;
    expect(cm.body.fontSizePx).toBe(16); // 12pt
    expect(cm.body.lineHeight).toBe(2.0);
    expect(cm.h1.fontSizePx).toBe(19); // 14pt
    expect(cm.h2.fontSizePx).toBe(17); // 13pt
    expect(cm.h3.fontSizePx).toBe(16); // 12pt
    expect(cm.body.fontFamily).toContain('Times New Roman');

    const nat = JOURNAL_PRESETS['nature-style'].styles;
    expect(nat.body.fontSizePx).toBe(14);
    expect(nat.body.lineHeight).toBe(1.5);
    expect(nat.h1.fontSizePx).toBe(22);
    expect(nat.h2.fontSizePx).toBe(18);
    expect(nat.h3.fontSizePx).toBe(15);
    expect(nat.body.fontFamily).toContain('Helvetica');

    const lan = JOURNAL_PRESETS['lancet-style'].styles;
    expect(lan.body.fontSizePx).toBe(14);
    expect(lan.body.lineHeight).toBeCloseTo(1.55, 5);
    expect(lan.h1.fontSizePx).toBe(22);
    expect(lan.h2.fontSizePx).toBe(19);
    expect(lan.h3.fontSizePx).toBe(16);
    expect(lan.body.fontFamily).toContain('Georgia');

    const jk = JOURNAL_PRESETS['jkms-korean'].styles;
    expect(jk.body.fontSizePx).toBe(16);
    expect(jk.body.lineHeight).toBeCloseTo(1.7, 5);
    expect(jk.h1.fontSizePx).toBe(22);
    expect(jk.body.fontFamily).toContain('Noto Serif KR');

    const cd = JOURNAL_PRESETS['comfortable-draft'].styles;
    expect(cd.body.fontSizePx).toBe(17);
    expect(cd.body.lineHeight).toBeCloseTo(1.75, 5);
    expect(cd.h1.fontSizePx).toBe(24);
    expect(cd.body.fontFamily).toContain('Atkinson Hyperlegible');

    const dd = JOURNAL_PRESETS['durumi-default'].styles;
    expect(dd.body.fontSizePx).toBe(16);
    expect(dd.body.lineHeight).toBeCloseTo(1.6, 5);
    expect(dd.h1.fontSizePx).toBe(24);
  });

  it('DEFAULT_PRESET_ID points at "durumi-default" and defaultStyleSet clones it', () => {
    expect(DEFAULT_PRESET_ID).toBe('durumi-default');
    const a = defaultStyleSet();
    const b = defaultStyleSet();
    expect(a).toEqual(b);
    // Independent objects — mutating one must not bleed into the other.
    a.body.fontSizePx = 999;
    expect(b.body.fontSizePx).not.toBe(999);
  });

  it('getPreset returns null for unknown ids and the preset for known ones', () => {
    expect(getPreset(null)).toBeNull();
    expect(getPreset(undefined)).toBeNull();
    expect(getPreset('')).toBeNull();
    expect(getPreset('bogus')).toBeNull();
    expect(getPreset('durumi-default')?.id).toBe('durumi-default');
  });

  it('cloneStyleSet produces an independent deep copy', () => {
    const original = JOURNAL_PRESETS['nature-style'].styles;
    const clone = cloneStyleSet(original);
    expect(clone).toEqual(original);
    clone.h1.fontWeight = 400;
    expect(original.h1.fontWeight).toBe(700);
  });

  it('isValidStyleSet rejects malformed inputs', () => {
    expect(isValidStyleSet(null)).toBe(false);
    expect(isValidStyleSet({})).toBe(false);
    expect(isValidStyleSet({ body: {} })).toBe(false);
    const partial = cloneStyleSet(JOURNAL_PRESETS['durumi-default'].styles) as Partial<StyleSet>;
    delete partial.h3;
    expect(isValidStyleSet(partial)).toBe(false);
  });
});

describe('applyStyles', () => {
  beforeEach(() => {
    clearStyleSet();
  });

  it('styleVarNames covers every entry × every suffix (10 × 5 = 50 vars)', () => {
    const names = styleVarNames();
    expect(names.length).toBe(STYLE_ENTRIES.length * 5);
    // Spot-checks for the exact var names the export pipeline will read.
    expect(names).toContain('--style-body-font');
    expect(names).toContain('--style-body-size');
    expect(names).toContain('--style-body-weight');
    expect(names).toContain('--style-body-color');
    expect(names).toContain('--style-body-lh');
    expect(names).toContain('--style-h1-font');
    expect(names).toContain('--style-h6-lh');
    expect(names).toContain('--style-blockquote-font');
    expect(names).toContain('--style-code-size');
    expect(names).toContain('--style-table-header-weight');
  });

  it('applyStyleSet writes every variable onto document.documentElement', () => {
    const set = JOURNAL_PRESETS['nature-style'].styles;
    applyStyleSet(set);
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--style-body-font')).toContain('Helvetica');
    expect(style.getPropertyValue('--style-body-size')).toBe('14px');
    expect(style.getPropertyValue('--style-body-weight')).toBe('400');
    expect(style.getPropertyValue('--style-body-lh')).toBe('1.5');
    expect(style.getPropertyValue('--style-h1-size')).toBe('22px');
    expect(style.getPropertyValue('--style-h1-weight')).toBe('700');
    expect(style.getPropertyValue('--style-h6-size')).toBe('12px');
    expect(style.getPropertyValue('--style-table-header-weight')).toBe('700');
  });

  it('null color produces "inherit", non-null colors round-trip', () => {
    const set = cloneStyleSet(JOURNAL_PRESETS['durumi-default'].styles);
    set.body.color = '#112233';
    set.h1.color = null;
    applyStyleSet(set);
    expect(document.documentElement.style.getPropertyValue('--style-body-color')).toBe('#112233');
    expect(document.documentElement.style.getPropertyValue('--style-h1-color')).toBe('inherit');
  });

  it('is idempotent — calling twice with the same set leaves vars equal', () => {
    const set = JOURNAL_PRESETS['lancet-style'].styles;
    applyStyleSet(set);
    const first = document.documentElement.style.getPropertyValue('--style-body-font');
    applyStyleSet(set);
    const second = document.documentElement.style.getPropertyValue('--style-body-font');
    expect(second).toBe(first);
  });

  it('clearStyleSet removes every variable it wrote', () => {
    applyStyleSet(JOURNAL_PRESETS['jkms-korean'].styles);
    expect(document.documentElement.style.getPropertyValue('--style-body-font')).not.toBe('');
    clearStyleSet();
    for (const name of styleVarNames()) {
      expect(document.documentElement.style.getPropertyValue(name)).toBe('');
    }
  });

  it('accepts a custom target element so callers can scope the variables', () => {
    const el = document.createElement('div');
    applyStyleSet(JOURNAL_PRESETS['durumi-default'].styles, el);
    expect(el.style.getPropertyValue('--style-body-size')).toBe('16px');
    // documentElement must remain untouched in this path.
    expect(document.documentElement.style.getPropertyValue('--style-body-size')).toBe('');
  });
});
