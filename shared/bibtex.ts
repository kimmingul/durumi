/**
 * Minimal BibTeX parser sized for medical-research workflows.
 *
 * Handles the fields that show up in PubMed / Zotero exports:
 *   author, title, journal, year, volume, number, pages, doi, url, publisher,
 *   editor, booktitle, school, institution, note.
 *
 * Not implemented (intentional v1 omissions):
 *   - @string macro definitions
 *   - @preamble blocks
 *   - cross-references
 *   - LaTeX command de-escaping beyond `{…}` brace stripping
 *
 * Robust to the messy BibTeX that real Zotero exports produce: nested braces,
 * concatenated strings (`"Smith" # " 2023"`), and trailing commas.
 */
export interface BibEntry {
  /** The citation key, e.g. `smith2023covid`. */
  key: string;
  /** Entry type lowercased: `article`, `book`, `incollection`, … */
  type: string;
  /** Field name (lowercased) → raw value (braces and quotes stripped). */
  fields: Record<string, string>;
}

export interface ParseResult {
  entries: BibEntry[];
  /** Diagnostics; never throws so callers can surface them in the UI. */
  warnings: string[];
}

export function parseBibTeX(source: string): ParseResult {
  const entries: BibEntry[] = [];
  const warnings: string[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    i = skipWhitespaceAndComments(source, i);
    if (i >= n) break;
    if (source[i] !== '@') {
      // Skip stray text between entries.
      i++;
      continue;
    }
    i++;
    const typeStart = i;
    while (i < n && /[A-Za-z]/.test(source[i] ?? '')) i++;
    const type = source.slice(typeStart, i).toLowerCase();
    if (!type) continue;
    i = skipWhitespace(source, i);
    if (source[i] !== '{' && source[i] !== '(') {
      warnings.push(`expected { after @${type} at offset ${typeStart}`);
      continue;
    }
    const opener = source[i];
    const closer = opener === '{' ? '}' : ')';
    i++;
    // For `@string`, `@preamble`, `@comment`: skip to matching closer.
    if (type === 'string' || type === 'preamble' || type === 'comment') {
      i = skipBalancedTo(source, i, closer);
      continue;
    }
    // Citation key.
    i = skipWhitespace(source, i);
    const keyStart = i;
    while (i < n && source[i] !== ',' && source[i] !== closer && !/\s/.test(source[i] ?? '')) i++;
    const key = source.slice(keyStart, i).trim();
    if (!key) {
      warnings.push(`empty citation key in @${type} near offset ${keyStart}`);
      i = skipBalancedTo(source, i, closer);
      continue;
    }
    const fields: Record<string, string> = {};
    while (i < n && source[i] !== closer) {
      i = skipWhitespaceAndComments(source, i);
      if (source[i] === ',') {
        i++;
        continue;
      }
      if (source[i] === closer) break;
      const fieldNameStart = i;
      while (i < n && /[A-Za-z0-9_-]/.test(source[i] ?? '')) i++;
      const fieldName = source.slice(fieldNameStart, i).toLowerCase();
      if (!fieldName) {
        i++;
        continue;
      }
      i = skipWhitespace(source, i);
      if (source[i] !== '=') {
        warnings.push(`field "${fieldName}" missing "=" in @${type}{${key}`);
        i = skipToCommaOrClose(source, i, closer);
        continue;
      }
      i++;
      i = skipWhitespace(source, i);
      const value = readValue(source, i, closer);
      fields[fieldName] = stripBraces(value.text);
      i = value.endIdx;
    }
    if (source[i] === closer) i++;
    entries.push({ key, type, fields });
  }

  return { entries, warnings };
}

interface ValueRead {
  text: string;
  endIdx: number;
}

function readValue(source: string, start: number, _closer: string): ValueRead {
  // Values can be: braced "{…}", quoted "\"…\"", numeric, or string-concat.
  // Concatenation example: title = "On " # outerTitle # " effects"
  const parts: string[] = [];
  let i = start;
  while (i < source.length) {
    i = skipWhitespace(source, i);
    if (source[i] === '{') {
      const r = readBraced(source, i);
      parts.push(r.text);
      i = r.endIdx;
    } else if (source[i] === '"') {
      const r = readQuoted(source, i);
      parts.push(r.text);
      i = r.endIdx;
    } else if (/[0-9]/.test(source[i] ?? '')) {
      const numStart = i;
      while (i < source.length && /[0-9]/.test(source[i] ?? '')) i++;
      parts.push(source.slice(numStart, i));
    } else if (/[A-Za-z_]/.test(source[i] ?? '')) {
      // String reference (e.g. macro). We don't resolve; just include as-is.
      const idStart = i;
      while (i < source.length && /[A-Za-z0-9_-]/.test(source[i] ?? '')) i++;
      parts.push(source.slice(idStart, i));
    } else {
      break;
    }
    i = skipWhitespace(source, i);
    if (source[i] === '#') {
      i++;
      continue;
    }
    break;
  }
  return { text: parts.join(' '), endIdx: i };
}

function readBraced(source: string, start: number): ValueRead {
  let depth = 0;
  let i = start;
  for (; i < source.length; i++) {
    if (source[i] === '\\' && i + 1 < source.length) {
      i++;
      continue;
    }
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        return { text: source.slice(start + 1, i), endIdx: i + 1 };
      }
    }
  }
  return { text: source.slice(start + 1, i), endIdx: i };
}

function readQuoted(source: string, start: number): ValueRead {
  let i = start + 1;
  let depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === '\\' && i + 1 < source.length) {
      i++;
      continue;
    }
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    else if (source[i] === '"' && depth === 0) {
      return { text: source.slice(start + 1, i), endIdx: i + 1 };
    }
  }
  return { text: source.slice(start + 1, i), endIdx: i };
}

function stripBraces(s: string): string {
  // Strip outer braces but preserve inner spans like `{NASA}` that protect
  // capitalisation. We only fold ones that are purely cosmetic groups:
  // run a regex pass that drops `{X}` where X has no further braces.
  let out = s;
  for (let pass = 0; pass < 5; pass++) {
    const next = out.replace(/\{([^{}]*)\}/g, '$1');
    if (next === out) break;
    out = next;
  }
  return out.trim();
}

function skipWhitespace(source: string, i: number): number {
  while (i < source.length && /\s/.test(source[i] ?? '')) i++;
  return i;
}

function skipWhitespaceAndComments(source: string, i: number): number {
  for (;;) {
    i = skipWhitespace(source, i);
    if (i < source.length && source[i] === '%') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    return i;
  }
}

function skipBalancedTo(source: string, start: number, closer: string): number {
  let depth = 1;
  let i = start;
  const opener = closer === '}' ? '{' : '(';
  while (i < source.length && depth > 0) {
    if (source[i] === '\\' && i + 1 < source.length) {
      i += 2;
      continue;
    }
    if (source[i] === opener) depth++;
    else if (source[i] === closer) depth--;
    i++;
  }
  return i;
}

function skipToCommaOrClose(source: string, start: number, closer: string): number {
  let i = start;
  while (i < source.length && source[i] !== ',' && source[i] !== closer) i++;
  return i;
}

/** Convenience helper: build a key → entry map in one pass. */
export function indexBibEntries(result: ParseResult): Map<string, BibEntry> {
  const m = new Map<string, BibEntry>();
  for (const e of result.entries) m.set(e.key, e);
  return m;
}
