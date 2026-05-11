/**
 * v0.1.11 Phase 3 — apply a `StyleSet` as CSS custom properties.
 *
 * The renderer mirrors the user's chosen typography into a set of CSS
 * variables on `:root` (via `document.documentElement.style.setProperty`).
 * Editor CSS (and, eventually, the export pipeline) consume them via
 * `var(--style-body-font)` etc., so the preview and any future standalone
 * export HTML share the same source of truth.
 *
 * The function is idempotent — calling it repeatedly with the same StyleSet
 * is a no-op for downstream styles. Pass `null` to clear every variable
 * (used on unmount).
 */

import {
  STYLE_ENTRIES,
  type StyleEntryId,
  type StyleSet,
  type StyleSpec,
} from './journalPresets';

/** Map a StyleEntryId to its CSS-variable prefix (`--style-<key>-…`). */
const VAR_KEYS: Record<StyleEntryId, string> = {
  body: 'body',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  blockquote: 'blockquote',
  code: 'code',
  tableHeader: 'table-header',
};

const SUFFIXES = ['font', 'size', 'weight', 'color', 'lh'] as const;

/**
 * Compute every CSS variable name this module owns. Used by tests and by
 * `clearStyleSet` to reset the document.
 */
export function styleVarNames(): string[] {
  const names: string[] = [];
  for (const entry of STYLE_ENTRIES) {
    const prefix = VAR_KEYS[entry];
    for (const suffix of SUFFIXES) {
      names.push(`--style-${prefix}-${suffix}`);
    }
  }
  return names;
}

function specToVars(prefix: string, spec: StyleSpec): Record<string, string> {
  return {
    [`--style-${prefix}-font`]: spec.fontFamily,
    [`--style-${prefix}-size`]: `${spec.fontSizePx}px`,
    [`--style-${prefix}-weight`]: String(spec.fontWeight),
    // `null` color → inherit the theme foreground via the fallback in CSS.
    [`--style-${prefix}-color`]: spec.color ?? 'inherit',
    [`--style-${prefix}-lh`]: String(spec.lineHeight),
  };
}

/**
 * Write every variable from `set` onto `target.style` (defaults to
 * `document.documentElement`). Returns the resolved target so callers can
 * compose with cleanup.
 */
export function applyStyleSet(
  set: StyleSet,
  target: HTMLElement = document.documentElement,
): HTMLElement {
  for (const entry of STYLE_ENTRIES) {
    const prefix = VAR_KEYS[entry];
    const vars = specToVars(prefix, set[entry]);
    for (const [name, value] of Object.entries(vars)) {
      target.style.setProperty(name, value);
    }
  }
  return target;
}

/**
 * Reset every style-* variable on the target. Useful in tests and on
 * unmount when the host wants to revert to plain theme defaults.
 */
export function clearStyleSet(
  target: HTMLElement = document.documentElement,
): void {
  for (const name of styleVarNames()) {
    target.style.removeProperty(name);
  }
}
