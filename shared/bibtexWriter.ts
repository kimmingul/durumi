import type { BibEntry } from './bibtex';

/**
 * Serializer for `BibEntry` → BibTeX source. Inverse of `parseBibTeX`.
 *
 * Output is the conservative, biber/Pandoc-compatible shape:
 *
 *   @article{smith2024deep,
 *     author = {Smith, John and Doe, Jane},
 *     title  = {Deep learning in radiology},
 *     journal = {Nature},
 *     year   = {2024},
 *     volume = {612},
 *     pages  = {234--241},
 *     doi    = {10.1038/s41586-024-XXXXX-X}
 *   }
 *
 * Field ordering follows the canonical reading order so two entries built from
 * the same Crossref response always serialise identically (deterministic for
 * golden tests + git diffs).
 */
const FIELD_ORDER: ReadonlyArray<string> = [
  'author',
  'editor',
  'title',
  'booktitle',
  'journal',
  'year',
  'month',
  'volume',
  'number',
  'pages',
  'publisher',
  'institution',
  'school',
  'address',
  'doi',
  'url',
  'isbn',
  'issn',
  'pmid',
  'note',
  'abstract',
];

export function formatEntry(entry: BibEntry): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  lines.push(`@${entry.type}{${entry.key},`);
  for (const field of FIELD_ORDER) {
    const value = entry.fields[field];
    if (value === undefined || value.length === 0) continue;
    seen.add(field);
    lines.push(`  ${field} = {${escapeBibValue(value)}},`);
  }
  // Any non-canonical fields (preserve as-is in stable alphabetical order).
  const extras = Object.keys(entry.fields)
    .filter((k) => !seen.has(k) && entry.fields[k]!.length > 0)
    .sort();
  for (const field of extras) {
    lines.push(`  ${field} = {${escapeBibValue(entry.fields[field]!)}},`);
  }
  // Drop the trailing comma on the final field — biber tolerates it but the
  // canonical Pandoc/Zotero shape omits it.
  const last = lines.pop();
  if (last !== undefined) lines.push(last.replace(/,$/, ''));
  lines.push('}');
  return lines.join('\n');
}

/**
 * BibTeX values live inside a `{…}` brace pair. We must keep the braces
 * balanced; otherwise the next entry won't parse. We don't try to round-trip
 * LaTeX commands — the parser already strips outer braces, and Pandoc/biber
 * pass UTF-8 through untouched.
 */
export function escapeBibValue(raw: string): string {
  let out = '';
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === '\\' && i + 1 < raw.length) {
      // Preserve existing escape sequences verbatim.
      out += ch + raw[i + 1]!;
      i++;
      continue;
    }
    if (ch === '{') {
      depth++;
      out += ch;
      continue;
    }
    if (ch === '}') {
      if (depth === 0) {
        // Unbalanced closer — escape so the value stays inside its outer pair.
        out += '\\}';
        continue;
      }
      depth--;
      out += ch;
      continue;
    }
    out += ch;
  }
  // Any opener left unmatched at end-of-value gets escaped retroactively. Walk
  // the buffer and turn the trailing N unbalanced `{` into `\{` (cheap because
  // the common case has depth === 0 here and we exit immediately).
  if (depth > 0) {
    out = balanceTrailingOpeners(out, depth);
  }
  return out;
}

function balanceTrailingOpeners(s: string, unbalanced: number): string {
  // Replace from the right so we touch the *last* unmatched openers, which
  // matches the human-readable expectation for malformed input like "a{b{c".
  const chars = s.split('');
  let need = unbalanced;
  let inEscape = false;
  // Single forward pass to compute which `{` indices are unmatched.
  const stack: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (inEscape) {
      inEscape = false;
      continue;
    }
    if (chars[i] === '\\') {
      inEscape = true;
      continue;
    }
    if (chars[i] === '{') {
      stack.push(i);
    } else if (chars[i] === '}' && stack.length > 0) {
      stack.pop();
    }
  }
  const unmatchedIdx: number[] = [];
  for (let k = stack.length - 1; k >= 0 && need > 0; k--, need--) {
    unmatchedIdx.push(stack[k]!);
  }
  unmatchedIdx.sort((a, b) => b - a);
  for (const idx of unmatchedIdx) {
    chars[idx] = '\\{';
  }
  return chars.join('');
}

/**
 * Append-friendly text: caller can `existing + '\n' + serializeForAppend(e)`.
 * Always ends with a single trailing newline.
 */
export function serializeForAppend(entry: BibEntry): string {
  return formatEntry(entry) + '\n';
}
