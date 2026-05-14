import yaml from 'js-yaml';
import { parseFrontMatterFenced, type FrontMatterFenced } from './frontMatterFenced';

export interface FrontMatterResult {
  /** Parsed YAML object, or null when there was no front matter or parse failed. */
  data: Record<string, unknown> | null;
  /** Document body with the front matter region removed (and the trailing newline). */
  body: string;
  /** Raw front matter region including delimiters, or null when none was present. */
  raw: string | null;
  /** End offset (exclusive) of the front matter region in the original source. 0 when none. */
  endOffset: number;
  /** Parse error message when YAML was present but invalid; null otherwise. */
  error: string | null;
}

// Re-export the fenced-only types/helpers so existing callers can pick the
// lightweight or full variant from a single module, while bundlers see the
// js-yaml dep only when the YAML-parsing entry point is reached.
export { parseFrontMatterFenced };
export type { FrontMatterFenced };

/**
 * Extracts a YAML front matter block from the very start of `source`. The
 * block must begin at offset 0 with a `---` line and end with another `---`
 * (or `...`) line. Anything else is returned as-is in `body`.
 *
 * Permissive on purpose: an unterminated opening block is treated as "no
 * front matter" so the user's keystrokes don't disappear while typing.
 *
 * **Caveat for bundle size**: this function depends on `js-yaml` (~105 KB).
 * Code that only needs the fence boundaries (body/raw/endOffset) should
 * import `parseFrontMatterFenced` from `./frontMatterFenced` directly to
 * avoid dragging YAML into eager bundles.
 */
export function parseFrontMatter(source: string): FrontMatterResult {
  const fenced = parseFrontMatterFenced(source);
  if (fenced.yamlText === null) {
    return { data: null, body: fenced.body, raw: null, endOffset: 0, error: null };
  }
  let data: Record<string, unknown> | null = null;
  let error: string | null = null;
  try {
    const parsed = yaml.load(fenced.yamlText, { schema: yaml.JSON_SCHEMA });
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    } else if (parsed === null || parsed === undefined) {
      data = {};
    } else {
      error = 'front matter must be a YAML mapping';
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  return { data, body: fenced.body, raw: fenced.raw, endOffset: fenced.endOffset, error };
}

/** Looks up a string-typed field, returning `undefined` for non-strings. */
export function frontMatterString(
  fm: FrontMatterResult | null,
  key: string,
): string | undefined {
  if (!fm?.data) return undefined;
  const v = fm.data[key];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Returns the front matter region as a [from, to) byte range in the source,
 * or null when there is no front matter. Useful for editor decorations.
 */
export function frontMatterRange(
  fm: FrontMatterResult,
): { from: number; to: number } | null {
  if (fm.endOffset === 0) return null;
  return { from: 0, to: fm.endOffset };
}
