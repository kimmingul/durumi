/**
 * Escape `&`, `<`, `>`, `"`, `'` for safe interpolation into HTML.
 * Use everywhere the export pipeline (or any HTML emitter in `shared/`)
 * inlines user-supplied strings into tag bodies or attributes.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
