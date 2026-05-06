/**
 * Computes word, character and reading-time stats for a markdown source.
 *
 * Counting strategy: strip the parts that are noise to a reader (front
 * matter, fenced code blocks, link/image syntax, heading hashes, list
 * markers, table pipes, footnote brackets) before splitting on whitespace.
 *
 * The numbers do not aim for byte-exact parity with Typora — its algorithm
 * is undocumented — but for stable, reasonable counts that match what most
 * journals consider a "word".
 */
export interface WordStats {
  words: number;
  chars: number;
  /** Characters excluding all whitespace. */
  charsNoSpaces: number;
  /** Reading time in minutes (rounded up to at least 1). */
  readingMinutes: number;
}

const WORDS_PER_MINUTE = 230;

const FRONT_MATTER_RE = /^---\r?\n[\s\S]*?\n(?:---|\.\.\.)\s*\r?\n?/;
const FENCED_CODE_RE = /(^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n\2\s*(?=\n|$)/g;
const INLINE_CODE_RE = /`[^`]*`/g;
const IMAGE_RE = /!\[([^\]]*)\]\([^)]*\)/g;
const LINK_RE = /\[([^\]]+)\]\([^)]*\)/g;
const HTML_TAG_RE = /<[^>]+>/g;
const HEADING_RE = /^[ \t]*#{1,6}\s+/gm;
const LIST_MARKER_RE = /^[ \t]*(?:[-*+]|\d+[.)])\s+/gm;
const BLOCKQUOTE_RE = /^[ \t]*>\s?/gm;
const TABLE_PIPE_RE = /\|/g;
const FOOTNOTE_REF_RE = /\[\^[^\]]+\]/g;
const FOOTNOTE_DEF_RE = /^\[\^[^\]]+\]:\s*/gm;
const TASK_BOX_RE = /^[ \t]*[-*+]\s+\[[ xX]\]\s+/gm;

export function computeWordStats(source: string): WordStats {
  let text = source;
  text = text.replace(FRONT_MATTER_RE, '');
  text = text.replace(FENCED_CODE_RE, '\n');
  text = text.replace(IMAGE_RE, '$1');
  text = text.replace(LINK_RE, '$1');
  text = text.replace(INLINE_CODE_RE, ' ');
  text = text.replace(HTML_TAG_RE, '');
  text = text.replace(TASK_BOX_RE, '');
  text = text.replace(HEADING_RE, '');
  text = text.replace(LIST_MARKER_RE, '');
  text = text.replace(BLOCKQUOTE_RE, '');
  text = text.replace(FOOTNOTE_DEF_RE, '');
  text = text.replace(FOOTNOTE_REF_RE, '');
  text = text.replace(TABLE_PIPE_RE, ' ');

  const words = text
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);

  const chars = source.length;
  const charsNoSpaces = source.replace(/\s+/g, '').length;
  const readingMinutes = Math.max(1, Math.ceil(words.length / WORDS_PER_MINUTE));

  return {
    words: words.length,
    chars,
    charsNoSpaces,
    readingMinutes,
  };
}
