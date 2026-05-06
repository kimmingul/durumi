/**
 * Generates a stable, URL-friendly slug from heading text. Mirrors the
 * GitHub-style algorithm so that anchors created by the TOC and the actual
 * heading id end up identical:
 *   - Lowercase
 *   - Strip everything except letters, numbers, hyphens, underscores, and CJK.
 *   - Collapse runs of whitespace into single hyphens.
 *
 * The optional `seen` map disambiguates repeated headings by appending `-1`,
 * `-2`, ….  Pass the same map across all headings in a document.
 */
export function slugify(text: string, seen?: Map<string, number>): string {
  const base = text
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-') || 'section';
  if (!seen) return base;
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}
