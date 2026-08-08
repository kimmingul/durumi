// Lightweight fence-only front-matter scan. Lives in its own file so
// renderer hot-path callers can import it without dragging in js-yaml.
// The full `parseFrontMatter` (and `frontMatterString`, `frontMatterRange`)
// in ./frontMatter.ts re-exports this scanner and adds the YAML parse step.

export interface FrontMatterFenced {
  body: string;
  raw: string | null;
  endOffset: number;
  /** Raw YAML body text (delimiters stripped). null when there is no front matter. */
  yamlText: string | null;
  /**
   * Start offset of `yamlText` in the original source (0 when there is no
   * front matter). Lets a writer splice inside the YAML region without
   * re-deriving the fence boundaries — SPEC-V03-WORKSPACE-001 REQ-WS-044
   * keeps this module the single front-matter parsing entry point.
   */
  yamlStart: number;
}

const OPEN_RE = /^---\r?\n/;
// Closing delimiter is `---` or `...` on its own line. Pandoc accepts both.
const CLOSE_RE = /^(?:---|\.\.\.)\s*\r?\n?/m;

/**
 * Finds the `---`-delimited front-matter region without parsing the YAML
 * inside. Permissive on purpose: an unterminated opening block is treated as
 * "no front matter" so the user's keystrokes don't disappear while typing.
 */
export function parseFrontMatterFenced(source: string): FrontMatterFenced {
  const openMatch = source.match(OPEN_RE);
  if (!openMatch) {
    return { body: source, raw: null, endOffset: 0, yamlText: null, yamlStart: 0 };
  }
  const afterOpen = openMatch[0].length;
  const rest = source.slice(afterOpen);
  const closeMatch = rest.match(CLOSE_RE);
  if (!closeMatch || closeMatch.index === undefined) {
    return { body: source, raw: null, endOffset: 0, yamlText: null, yamlStart: 0 };
  }
  const yamlText = rest.slice(0, closeMatch.index);
  const closeLen = closeMatch[0].length;
  const endOffset = afterOpen + closeMatch.index + closeLen;
  const raw = source.slice(0, endOffset);
  const body = source.slice(endOffset);
  return { body, raw, endOffset, yamlText, yamlStart: afterOpen };
}
