/**
 * v0.1.11 Phase 3 — Journal style presets.
 *
 * Six prebuilt "draft display" style sets that approximate common journal
 * typography (NEJM/JAMA, Nature, Lancet, JKMS, …). The preset names are for
 * authoring convenience only; they are NOT official typesetting templates
 * and do not guarantee submission-ready output.
 *
 * Each preset is a `StyleSet` — ten `StyleSpec` entries (body + h1–h6 +
 * blockquote + code + tableHeader). Heading sizes use px-equivalents of the
 * journal's typical point sizes (1pt ≈ 1.333px).
 */

export interface StyleSpec {
  /** CSS font-family value (with appropriate quoting baked in). */
  fontFamily: string;
  /** Font size in CSS pixels. Headings are rounded to integer px. */
  fontSizePx: number;
  /** 400 = regular, 600 = semibold, 700 = bold. */
  fontWeight: number;
  /** Explicit color hex / null = inherit the theme foreground. */
  color: string | null;
  /** Unitless line-height multiplier (e.g. 1.5, 2.0). */
  lineHeight: number;
}

export interface StyleSet {
  body: StyleSpec;
  h1: StyleSpec;
  h2: StyleSpec;
  h3: StyleSpec;
  h4: StyleSpec;
  h5: StyleSpec;
  h6: StyleSpec;
  blockquote: StyleSpec;
  code: StyleSpec;
  tableHeader: StyleSpec;
}

/** Style-entry ids, in display order. Used by the Settings UI to render rows. */
export const STYLE_ENTRIES = [
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
] as const;

export type StyleEntryId = (typeof STYLE_ENTRIES)[number];

/**
 * Preset ids. The string values are persisted in preferences.json so they
 * must remain stable. New presets append to the end of this tuple.
 */
export const PRESET_IDS = [
  'durumi-default',
  'classic-manuscript',
  'nature-style',
  'lancet-style',
  'jkms-korean',
  'comfortable-draft',
] as const;

export type JournalPresetId = (typeof PRESET_IDS)[number];

export interface JournalPreset {
  id: JournalPresetId;
  /** i18n key suffix — full key is `settings.styles.preset.<id>`. */
  i18nKey: string;
  styles: StyleSet;
}

/** Monospace stack reused across every preset's `code` entry. */
const CODE_STACK =
  "ui-monospace, 'SF Mono', Menlo, Consolas, 'Roboto Mono', monospace";

// --- Durumi default ---------------------------------------------------------
const DURUMI_BODY = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const durumiDefault: StyleSet = {
  body:        { fontFamily: DURUMI_BODY, fontSizePx: 16, fontWeight: 400, color: null, lineHeight: 1.6 },
  h1:          { fontFamily: DURUMI_BODY, fontSizePx: 24, fontWeight: 600, color: null, lineHeight: 1.3 },
  h2:          { fontFamily: DURUMI_BODY, fontSizePx: 20, fontWeight: 600, color: null, lineHeight: 1.3 },
  h3:          { fontFamily: DURUMI_BODY, fontSizePx: 18, fontWeight: 600, color: null, lineHeight: 1.35 },
  h4:          { fontFamily: DURUMI_BODY, fontSizePx: 16, fontWeight: 600, color: null, lineHeight: 1.4 },
  h5:          { fontFamily: DURUMI_BODY, fontSizePx: 14, fontWeight: 600, color: null, lineHeight: 1.4 },
  h6:          { fontFamily: DURUMI_BODY, fontSizePx: 13, fontWeight: 600, color: null, lineHeight: 1.4 },
  blockquote:  { fontFamily: DURUMI_BODY, fontSizePx: 16, fontWeight: 400, color: null, lineHeight: 1.6 },
  code:        { fontFamily: CODE_STACK,  fontSizePx: 14, fontWeight: 400, color: null, lineHeight: 1.5 },
  tableHeader: { fontFamily: DURUMI_BODY, fontSizePx: 16, fontWeight: 700, color: null, lineHeight: 1.4 },
};

// --- Classic manuscript (NEJM / JAMA submission feel) -----------------------
// Double-spaced. Body 12pt ≈ 16px, H1 14pt ≈ 19px, H2 13pt ≈ 17px, H3 12pt ≈ 16px.
const CLASSIC_BODY = '"Times New Roman", Times, serif';
const classicManuscript: StyleSet = {
  body:        { fontFamily: CLASSIC_BODY, fontSizePx: 16, fontWeight: 400, color: null, lineHeight: 2.0 },
  h1:          { fontFamily: CLASSIC_BODY, fontSizePx: 19, fontWeight: 700, color: null, lineHeight: 2.0 },
  h2:          { fontFamily: CLASSIC_BODY, fontSizePx: 17, fontWeight: 700, color: null, lineHeight: 2.0 },
  h3:          { fontFamily: CLASSIC_BODY, fontSizePx: 16, fontWeight: 700, color: null, lineHeight: 2.0 },
  h4:          { fontFamily: CLASSIC_BODY, fontSizePx: 16, fontWeight: 700, color: null, lineHeight: 2.0 },
  h5:          { fontFamily: CLASSIC_BODY, fontSizePx: 16, fontWeight: 700, color: null, lineHeight: 2.0 },
  h6:          { fontFamily: CLASSIC_BODY, fontSizePx: 16, fontWeight: 700, color: null, lineHeight: 2.0 },
  blockquote:  { fontFamily: CLASSIC_BODY, fontSizePx: 16, fontWeight: 400, color: null, lineHeight: 2.0 },
  code:        { fontFamily: CODE_STACK,   fontSizePx: 14, fontWeight: 400, color: null, lineHeight: 1.6 },
  tableHeader: { fontFamily: CLASSIC_BODY, fontSizePx: 16, fontWeight: 700, color: null, lineHeight: 1.6 },
};

// --- Nature-style -----------------------------------------------------------
const NATURE_BODY = 'Helvetica, "Helvetica Neue", Arial, sans-serif';
const natureStyle: StyleSet = {
  body:        { fontFamily: NATURE_BODY, fontSizePx: 14, fontWeight: 400, color: null, lineHeight: 1.5 },
  h1:          { fontFamily: NATURE_BODY, fontSizePx: 22, fontWeight: 700, color: null, lineHeight: 1.3 },
  h2:          { fontFamily: NATURE_BODY, fontSizePx: 18, fontWeight: 700, color: null, lineHeight: 1.3 },
  h3:          { fontFamily: NATURE_BODY, fontSizePx: 15, fontWeight: 700, color: null, lineHeight: 1.35 },
  h4:          { fontFamily: NATURE_BODY, fontSizePx: 14, fontWeight: 700, color: null, lineHeight: 1.4 },
  h5:          { fontFamily: NATURE_BODY, fontSizePx: 13, fontWeight: 700, color: null, lineHeight: 1.4 },
  h6:          { fontFamily: NATURE_BODY, fontSizePx: 12, fontWeight: 700, color: null, lineHeight: 1.4 },
  blockquote:  { fontFamily: NATURE_BODY, fontSizePx: 14, fontWeight: 400, color: null, lineHeight: 1.5 },
  code:        { fontFamily: CODE_STACK,  fontSizePx: 13, fontWeight: 400, color: null, lineHeight: 1.5 },
  tableHeader: { fontFamily: NATURE_BODY, fontSizePx: 14, fontWeight: 700, color: null, lineHeight: 1.4 },
};

// --- Lancet-style -----------------------------------------------------------
const LANCET_BODY = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
const lancetStyle: StyleSet = {
  body:        { fontFamily: LANCET_BODY, fontSizePx: 14, fontWeight: 400, color: null, lineHeight: 1.55 },
  h1:          { fontFamily: LANCET_BODY, fontSizePx: 22, fontWeight: 700, color: null, lineHeight: 1.3 },
  h2:          { fontFamily: LANCET_BODY, fontSizePx: 19, fontWeight: 700, color: null, lineHeight: 1.3 },
  h3:          { fontFamily: LANCET_BODY, fontSizePx: 16, fontWeight: 700, color: null, lineHeight: 1.35 },
  h4:          { fontFamily: LANCET_BODY, fontSizePx: 14, fontWeight: 700, color: null, lineHeight: 1.4 },
  h5:          { fontFamily: LANCET_BODY, fontSizePx: 13, fontWeight: 700, color: null, lineHeight: 1.4 },
  h6:          { fontFamily: LANCET_BODY, fontSizePx: 12, fontWeight: 700, color: null, lineHeight: 1.4 },
  blockquote:  { fontFamily: LANCET_BODY, fontSizePx: 14, fontWeight: 400, color: null, lineHeight: 1.55 },
  code:        { fontFamily: CODE_STACK,  fontSizePx: 13, fontWeight: 400, color: null, lineHeight: 1.5 },
  tableHeader: { fontFamily: LANCET_BODY, fontSizePx: 14, fontWeight: 700, color: null, lineHeight: 1.4 },
};

// --- JKMS / Korean medical journals ----------------------------------------
const JKMS_BODY = '"Noto Serif KR", "Nanum Myeongjo", "Apple SD Gothic Neo", serif';
const jkmsKorean: StyleSet = {
  body:        { fontFamily: JKMS_BODY,  fontSizePx: 16, fontWeight: 400, color: null, lineHeight: 1.7 },
  h1:          { fontFamily: JKMS_BODY,  fontSizePx: 22, fontWeight: 700, color: null, lineHeight: 1.4 },
  h2:          { fontFamily: JKMS_BODY,  fontSizePx: 20, fontWeight: 700, color: null, lineHeight: 1.4 },
  h3:          { fontFamily: JKMS_BODY,  fontSizePx: 18, fontWeight: 700, color: null, lineHeight: 1.45 },
  h4:          { fontFamily: JKMS_BODY,  fontSizePx: 16, fontWeight: 700, color: null, lineHeight: 1.5 },
  h5:          { fontFamily: JKMS_BODY,  fontSizePx: 15, fontWeight: 700, color: null, lineHeight: 1.5 },
  h6:          { fontFamily: JKMS_BODY,  fontSizePx: 14, fontWeight: 700, color: null, lineHeight: 1.5 },
  blockquote:  { fontFamily: JKMS_BODY,  fontSizePx: 16, fontWeight: 400, color: null, lineHeight: 1.7 },
  code:        { fontFamily: CODE_STACK, fontSizePx: 14, fontWeight: 400, color: null, lineHeight: 1.6 },
  tableHeader: { fontFamily: JKMS_BODY,  fontSizePx: 16, fontWeight: 700, color: null, lineHeight: 1.5 },
};

// --- Comfortable draft ------------------------------------------------------
const COMFY_BODY = '"Atkinson Hyperlegible", "OpenDyslexic", -apple-system, sans-serif';
const comfortableDraft: StyleSet = {
  body:        { fontFamily: COMFY_BODY,  fontSizePx: 17, fontWeight: 400, color: null, lineHeight: 1.75 },
  h1:          { fontFamily: COMFY_BODY,  fontSizePx: 24, fontWeight: 700, color: null, lineHeight: 1.35 },
  h2:          { fontFamily: COMFY_BODY,  fontSizePx: 21, fontWeight: 700, color: null, lineHeight: 1.35 },
  h3:          { fontFamily: COMFY_BODY,  fontSizePx: 18, fontWeight: 700, color: null, lineHeight: 1.4 },
  h4:          { fontFamily: COMFY_BODY,  fontSizePx: 17, fontWeight: 700, color: null, lineHeight: 1.45 },
  h5:          { fontFamily: COMFY_BODY,  fontSizePx: 16, fontWeight: 700, color: null, lineHeight: 1.45 },
  h6:          { fontFamily: COMFY_BODY,  fontSizePx: 15, fontWeight: 700, color: null, lineHeight: 1.45 },
  blockquote:  { fontFamily: COMFY_BODY,  fontSizePx: 17, fontWeight: 400, color: null, lineHeight: 1.75 },
  code:        { fontFamily: CODE_STACK,  fontSizePx: 15, fontWeight: 400, color: null, lineHeight: 1.6 },
  tableHeader: { fontFamily: COMFY_BODY,  fontSizePx: 17, fontWeight: 700, color: null, lineHeight: 1.5 },
};

export const JOURNAL_PRESETS: Record<JournalPresetId, JournalPreset> = {
  'durumi-default':     { id: 'durumi-default',     i18nKey: 'durumiDefault',     styles: durumiDefault },
  'classic-manuscript': { id: 'classic-manuscript', i18nKey: 'classicManuscript', styles: classicManuscript },
  'nature-style':       { id: 'nature-style',       i18nKey: 'natureStyle',       styles: natureStyle },
  'lancet-style':       { id: 'lancet-style',       i18nKey: 'lancetStyle',       styles: lancetStyle },
  'jkms-korean':        { id: 'jkms-korean',        i18nKey: 'jkmsKorean',        styles: jkmsKorean },
  'comfortable-draft':  { id: 'comfortable-draft',  i18nKey: 'comfortableDraft',  styles: comfortableDraft },
};

/** The preset returned by the "Reset to default" button. */
export const DEFAULT_PRESET_ID: JournalPresetId = 'durumi-default';

/** Convenience accessor that always returns the canonical Durumi default. */
export function defaultStyleSet(): StyleSet {
  // Deep clone so callers can't mutate the shared constant.
  return cloneStyleSet(JOURNAL_PRESETS[DEFAULT_PRESET_ID].styles);
}

/** Look up by id; returns null when the id isn't a known preset. */
export function getPreset(id: string | null | undefined): JournalPreset | null {
  if (!id) return null;
  return (JOURNAL_PRESETS as Record<string, JournalPreset>)[id] ?? null;
}

/** Deep-clone a StyleSet. Plain JSON-safe values, so a stringify roundtrip works. */
export function cloneStyleSet(set: StyleSet): StyleSet {
  return JSON.parse(JSON.stringify(set)) as StyleSet;
}

/**
 * Runtime structural validator — checks that an unknown value matches the
 * `StyleSet` shape. Used by tests and prefs-merge to guard against corrupt
 * preferences.json.
 */
export function isValidStyleSet(value: unknown): value is StyleSet {
  if (!value || typeof value !== 'object') return false;
  for (const id of STYLE_ENTRIES) {
    const spec = (value as Record<string, unknown>)[id];
    if (!isValidStyleSpec(spec)) return false;
  }
  return true;
}

function isValidStyleSpec(value: unknown): value is StyleSpec {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.fontFamily === 'string' &&
    typeof v.fontSizePx === 'number' &&
    typeof v.fontWeight === 'number' &&
    (v.color === null || typeof v.color === 'string') &&
    typeof v.lineHeight === 'number'
  );
}
