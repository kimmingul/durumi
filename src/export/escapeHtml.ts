/**
 * Escape `&`, `<`, `>`, `"`, `'` for safe interpolation into HTML.
 * Use everywhere the export pipeline emits user-supplied strings.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
