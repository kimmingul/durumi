// Phase 3.3 (v0.2.6) — per-table line styling.
//
// Tables in Durumi can carry per-line border styling (top rule, header
// separator, body row separators, vertical column separators, bottom
// rule) plus cell padding. The metadata travels with the markdown source
// in one of two equivalent wire formats so the document remains portable:
//
//   1. Pandoc attribute block — a one-line `{.durumi-table ...}` block
//      placed immediately above the table. Pandoc passes the class and
//      data-* attributes through to its HTML/LaTeX output natively.
//
//   2. Inline HTML wrapper — a `<div class="durumi-table" data-...>`
//      element wrapping the markdown table. Works in any renderer that
//      enables raw HTML (markdown-it `html: true`, pandoc by default).
//
// Both formats use the SAME `data-*` attribute names so the parser /
// serializer logic is shared.
//
// This file is a pure module (no React, no DOM). Vitest covers it.

export type BorderStyleName = 'solid' | 'dashed' | 'dotted' | 'double' | 'none';

export interface BorderSpec {
  /** CSS width, e.g. "1px", "2px", "0". */
  width?: string;
  /** CSS border-style. */
  style?: BorderStyleName;
  /** CSS color (name, `#hex`, or `var(--token)`). */
  color?: string;
}

/**
 * The full per-table style. Every field is optional; absent fields fall
 * back to Durumi's defaults (resolved via `defaultStyle()` or the CSS
 * variable fallbacks in `global.css`).
 */
export interface TableStyle {
  topRule?: BorderSpec;
  headerSeparator?: BorderSpec;
  rowRules?: BorderSpec;
  verticalRules?: BorderSpec;
  bottomRule?: BorderSpec;
  /** e.g. "8px". Applied as cell `padding`. */
  cellPadding?: string;
}

/** Result of parsing a table's surrounding wire format. */
export interface TableStyleSerialized {
  source: 'pandoc' | 'html' | 'none';
  style: TableStyle;
}

// ─── defaults / presets ──────────────────────────────────────────────────

/**
 * Durumi default: markdown's traditional appearance — header separator
 * only, no vertical rules, no body row separators. Matches what every
 * other markdown viewer produces from a plain `| a | b |\n| --- | --- |`
 * table.
 */
export function defaultStyle(): TableStyle {
  return {
    headerSeparator: { width: '1px', style: 'solid', color: 'var(--border)' },
    cellPadding: '8px',
  };
}

export const presets: {
  none: () => TableStyle;
  default: () => TableStyle;
  booktabs: () => TableStyle;
  grid: () => TableStyle;
} = {
  none: () => ({
    topRule: { width: '0', style: 'none' },
    headerSeparator: { width: '0', style: 'none' },
    rowRules: { width: '0', style: 'none' },
    verticalRules: { width: '0', style: 'none' },
    bottomRule: { width: '0', style: 'none' },
    cellPadding: '8px',
  }),
  default: defaultStyle,
  booktabs: () => ({
    topRule: { width: '2px', style: 'solid', color: '#000000' },
    headerSeparator: { width: '1px', style: 'solid', color: '#000000' },
    rowRules: { width: '0', style: 'none' },
    verticalRules: { width: '0', style: 'none' },
    bottomRule: { width: '2px', style: 'solid', color: '#000000' },
    cellPadding: '8px',
  }),
  grid: () => ({
    topRule: { width: '1px', style: 'solid', color: 'var(--border)' },
    headerSeparator: { width: '1px', style: 'solid', color: 'var(--border)' },
    rowRules: { width: '1px', style: 'solid', color: 'var(--border)' },
    verticalRules: { width: '1px', style: 'solid', color: 'var(--border)' },
    bottomRule: { width: '1px', style: 'solid', color: 'var(--border)' },
    cellPadding: '8px',
  }),
};

/**
 * Are two TableStyle objects observationally identical? Used to detect
 * "user reset to default" so we can drop the wire-format overhead.
 */
export function styleEquals(a: TableStyle, b: TableStyle): boolean {
  return (
    borderEquals(a.topRule, b.topRule) &&
    borderEquals(a.headerSeparator, b.headerSeparator) &&
    borderEquals(a.rowRules, b.rowRules) &&
    borderEquals(a.verticalRules, b.verticalRules) &&
    borderEquals(a.bottomRule, b.bottomRule) &&
    (a.cellPadding ?? undefined) === (b.cellPadding ?? undefined)
  );
}

function borderEquals(a: BorderSpec | undefined, b: BorderSpec | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    (a.width ?? undefined) === (b.width ?? undefined) &&
    (a.style ?? undefined) === (b.style ?? undefined) &&
    (a.color ?? undefined) === (b.color ?? undefined)
  );
}

/**
 * Is this style observationally identical to the Durumi default? When
 * true the writer drops the attrs block / wrapper entirely so the
 * markdown source stays clean.
 */
export function isDefaultStyle(style: TableStyle): boolean {
  return styleEquals(style, defaultStyle());
}

// ─── value parsers (shared by pandoc + html paths) ───────────────────────

const VALID_STYLES: ReadonlySet<BorderStyleName> = new Set([
  'solid',
  'dashed',
  'dotted',
  'double',
  'none',
]);

/**
 * Parse a CSS-like shorthand `"<width> <style> <color>"` into a BorderSpec.
 * Order is flexible: width is the first token containing digits, style is
 * the first token that matches a known style-name, color is whatever is
 * left. Returns null if nothing meaningful parsed.
 */
export function parseBorderShorthand(raw: string): BorderSpec | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Special-case "none" by itself.
  if (trimmed.toLowerCase() === 'none') return { style: 'none', width: '0' };
  // Tokenize on whitespace. We don't try to handle commas in color
  // functions like `rgb(0, 0, 0)` — keep authoring simple.
  const tokens = trimmed.split(/\s+/);
  let width: string | undefined;
  let style: BorderStyleName | undefined;
  const colorParts: string[] = [];
  for (const tok of tokens) {
    const lower = tok.toLowerCase();
    if (!width && /^[0-9]/.test(lower)) {
      width = lower;
      continue;
    }
    if (!style && VALID_STYLES.has(lower as BorderStyleName)) {
      style = lower as BorderStyleName;
      continue;
    }
    colorParts.push(tok);
  }
  const color = colorParts.length > 0 ? colorParts.join(' ') : undefined;
  const out: BorderSpec = {};
  if (width !== undefined) out.width = width;
  if (style !== undefined) out.style = style;
  if (color !== undefined) out.color = color;
  return Object.keys(out).length === 0 ? null : out;
}

export function serializeBorder(spec: BorderSpec): string {
  const parts: string[] = [];
  if (spec.width !== undefined) parts.push(spec.width);
  if (spec.style !== undefined) parts.push(spec.style);
  if (spec.color !== undefined) parts.push(spec.color);
  return parts.join(' ');
}

/**
 * Resolve a BorderSpec to a CSS shorthand value the renderer can use
 * directly in `border-top`, `border-bottom`, etc. Missing fields fall
 * back to sensible defaults so the value is always syntactically valid.
 */
export function borderToCss(spec: BorderSpec | undefined): string {
  if (!spec) return '';
  const width = spec.width ?? '1px';
  const style = spec.style ?? 'solid';
  const color = spec.color ?? 'currentColor';
  if (style === 'none' || width === '0') return '0';
  return `${width} ${style} ${color}`;
}

// ─── pandoc attr block ──────────────────────────────────────────────────

// Matches a Pandoc-style attribute block whose first class is `durumi-table`.
// Accepts the line trimmed (no surrounding whitespace).
const PANDOC_ATTR_LINE_RE = /^\{[^{}]*\.durumi-table[^{}]*\}$/;

/** Cheap predicate: does this line look like a Pandoc attr block? */
export function isPandocAttrLine(line: string): boolean {
  return PANDOC_ATTR_LINE_RE.test(line.trim());
}

/** Same predicate for the HTML wrapper opening tag (single-line). */
export function isHtmlWrapperOpenLine(line: string): boolean {
  return /^<div\s+[^>]*class\s*=\s*["'][^"']*\bdurumi-table\b[^"']*["'][^>]*>$/.test(
    line.trim(),
  );
}

export function isHtmlWrapperCloseLine(line: string): boolean {
  return /^<\/div>$/.test(line.trim());
}

/**
 * Parse the *contents* of a `{...}` block (the line MINUS the braces).
 * Returns the parsed style or null on shape mismatch.
 */
export function parsePandocAttrs(inner: string): TableStyle | null {
  // Trim braces if the caller forgot to strip them.
  let s = inner.trim();
  if (s.startsWith('{') && s.endsWith('}')) s = s.slice(1, -1).trim();
  // Require the class anchor.
  if (!/\.durumi-table\b/.test(s)) return null;
  return parseDataAttributePairs(s);
}

/**
 * Parse the data attributes from an HTML opening tag. Accepts the full
 * `<div ...>` markup so callers can pass the raw line from the doc.
 */
export function parseHtmlWrapper(divHtml: string): TableStyle | null {
  // Match the opening `<div ... >` only.
  const m = divHtml.match(/<div\b([^>]*)>/i);
  if (!m) return null;
  const attrs = m[1] ?? '';
  if (!/class\s*=\s*["'][^"']*\bdurumi-table\b/i.test(attrs)) return null;
  // Pull each data-* attribute via a small attribute scan.
  return parseDataAttributePairs(attrs);
}

/**
 * Walk a string for `data-foo="bar"` (or single-quoted) pairs. Used by
 * both the pandoc and html parsers — same attribute names in both
 * formats so the logic is shared.
 */
function parseDataAttributePairs(input: string): TableStyle {
  const style: TableStyle = {};
  const re = /data-([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    const rawKey = match[1];
    if (!rawKey) continue;
    const key = rawKey.toLowerCase();
    const value = (match[2] ?? match[3] ?? '').trim();
    applyDataAttr(style, key, value);
  }
  return style;
}

function applyDataAttr(style: TableStyle, key: string, value: string): void {
  switch (key) {
    case 'top-rule': {
      const v = parseBorderShorthand(value);
      if (v) style.topRule = v;
      return;
    }
    case 'header-separator':
    case 'header-rule': {
      const v = parseBorderShorthand(value);
      if (v) style.headerSeparator = v;
      return;
    }
    case 'row-rules': {
      const v = parseBorderShorthand(value);
      if (v) style.rowRules = v;
      return;
    }
    case 'vert-rules':
    case 'vertical-rules': {
      const v = parseBorderShorthand(value);
      if (v) style.verticalRules = v;
      return;
    }
    case 'bottom-rule': {
      const v = parseBorderShorthand(value);
      if (v) style.bottomRule = v;
      return;
    }
    case 'cell-pad':
    case 'cell-padding': {
      if (value.length > 0) style.cellPadding = value;
      return;
    }
  }
}

/**
 * Produce a Pandoc-style attribute block for the given style. Returns the
 * full `{.durumi-table ...}` line (one-liner; no surrounding newlines).
 *
 * Empty styles still emit `{.durumi-table}` — callers that want to omit
 * the block entirely should check `isDefaultStyle(style)` first.
 */
export function serializePandocAttrs(style: TableStyle): string {
  const parts: string[] = ['.durumi-table'];
  appendAttrs(style, parts, (k, v) => `data-${k}="${v}"`);
  return `{${parts.join(' ')}}`;
}

/**
 * Wrap a markdown table source in an HTML `<div class="durumi-table" ...>`
 * block. The result is multi-line:
 *
 *   <div class="durumi-table" data-...>
 *
 *   <table markdown>
 *
 *   </div>
 *
 * The blank lines inside the wrapper let markdown-it / pandoc re-enter
 * markdown parsing for the table content (HTML blocks otherwise consume
 * their children as raw HTML, not markdown).
 */
export function serializeHtmlWrapper(style: TableStyle, tableMd: string): string {
  const attrs: string[] = ['class="durumi-table"'];
  appendAttrs(style, attrs, (k, v) => `data-${k}="${v}"`);
  // Normalize the table source to be the inner block — trim leading and
  // trailing whitespace so we control the line discipline.
  const inner = tableMd.replace(/^\s+/, '').replace(/\s+$/, '');
  return `<div ${attrs.join(' ')}>\n\n${inner}\n\n</div>`;
}

function appendAttrs(
  style: TableStyle,
  out: string[],
  fmt: (key: string, value: string) => string,
): void {
  if (style.topRule) out.push(fmt('top-rule', serializeBorder(style.topRule)));
  if (style.headerSeparator)
    out.push(fmt('header-separator', serializeBorder(style.headerSeparator)));
  if (style.rowRules) out.push(fmt('row-rules', serializeBorder(style.rowRules)));
  if (style.verticalRules)
    out.push(fmt('vert-rules', serializeBorder(style.verticalRules)));
  if (style.bottomRule) out.push(fmt('bottom-rule', serializeBorder(style.bottomRule)));
  if (style.cellPadding !== undefined) out.push(fmt('cell-pad', style.cellPadding));
}

/**
 * Resolve a style to the CSS custom-property map the editor / export
 * pipelines apply to a table's root element. Missing fields fall through
 * to the global defaults via `unset` so the page-level CSS variables win.
 */
export function styleToCssVars(style: TableStyle): Record<string, string> {
  const out: Record<string, string> = {};
  if (style.topRule) out['--durumi-table-top-rule'] = borderToCss(style.topRule);
  if (style.headerSeparator)
    out['--durumi-table-header-separator'] = borderToCss(style.headerSeparator);
  if (style.rowRules) out['--durumi-table-row-rules'] = borderToCss(style.rowRules);
  if (style.verticalRules)
    out['--durumi-table-vert-rules'] = borderToCss(style.verticalRules);
  if (style.bottomRule) out['--durumi-table-bottom-rule'] = borderToCss(style.bottomRule);
  if (style.cellPadding !== undefined) out['--durumi-table-cell-pad'] = style.cellPadding;
  return out;
}
