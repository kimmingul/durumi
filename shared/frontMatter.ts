import yaml from 'js-yaml';

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

const OPEN_RE = /^---\r?\n/;
// Closing delimiter is `---` or `...` on its own line. Pandoc accepts both.
const CLOSE_RE = /^(?:---|\.\.\.)\s*\r?\n?/m;

/**
 * Extracts a YAML front matter block from the very start of `source`. The
 * block must begin at offset 0 with a `---` line and end with another `---`
 * (or `...`) line. Anything else is returned as-is in `body`.
 *
 * Permissive on purpose: an unterminated opening block is treated as "no
 * front matter" so the user's keystrokes don't disappear while typing.
 */
export function parseFrontMatter(source: string): FrontMatterResult {
  const openMatch = source.match(OPEN_RE);
  if (!openMatch) {
    return { data: null, body: source, raw: null, endOffset: 0, error: null };
  }
  const afterOpen = openMatch[0].length;
  const rest = source.slice(afterOpen);
  const closeMatch = rest.match(CLOSE_RE);
  if (!closeMatch || closeMatch.index === undefined) {
    return { data: null, body: source, raw: null, endOffset: 0, error: null };
  }
  const yamlText = rest.slice(0, closeMatch.index);
  const closeLen = closeMatch[0].length;
  const endOffset = afterOpen + closeMatch.index + closeLen;
  const raw = source.slice(0, endOffset);
  const body = source.slice(endOffset);
  let data: Record<string, unknown> | null = null;
  let error: string | null = null;
  try {
    const parsed = yaml.load(yamlText, { schema: yaml.JSON_SCHEMA });
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
  return { data, body, raw, endOffset, error };
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
