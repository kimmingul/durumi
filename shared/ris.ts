import type { BibEntry } from './bibtex';

// RIS parser: line-based, two-letter tag + " - " + value, entries terminated
// by ER tag. Used by Zotero, EndNote, RefWorks, Web of Science exports.
//
// Spec: en.wikipedia.org/wiki/RIS_(file_format)
//
// Mapping is deliberately conservative; we cover the common journal,
// chapter, and book shapes. Obscure tags (LB linker, M3 type-of-work,
// etc.) pass through unmapped rather than getting wedged into a wrong
// field.

export interface RisParseResult {
  entries: BibEntry[];
  warnings: string[];
}

export function parseRis(source: string): RisParseResult {
  const entries: BibEntry[] = [];
  const warnings: string[] = [];

  let current: RawEntry | null = null;
  let lineNo = 0;

  for (const rawLine of source.split(/\r?\n/)) {
    lineNo++;
    const line = rawLine.trimEnd();
    if (line.length === 0) continue;
    const m = /^([A-Z][A-Z0-9])\s*-\s?(.*)$/.exec(line);
    if (!m) {
      // RIS allows continuation lines (no tag prefix); append to the last
      // tag's value. EndNote and Zotero exports rely on this for long
      // abstracts.
      if (current && current.lastTag) {
        const list = current.tags.get(current.lastTag) ?? [];
        const tail = list[list.length - 1];
        if (typeof tail === 'string') {
          list[list.length - 1] = `${tail} ${line.trim()}`;
        }
        current.tags.set(current.lastTag, list);
      }
      continue;
    }
    const tag = m[1]!;
    const value = m[2]!.trim();
    if (tag === 'TY') {
      if (current) {
        warnings.push(`line ${lineNo}: TY without preceding ER; flushing previous entry`);
        entries.push(toBibEntry(current));
      }
      current = { type: value, tags: new Map(), lastTag: tag };
      continue;
    }
    if (tag === 'ER') {
      if (current) entries.push(toBibEntry(current));
      else warnings.push(`line ${lineNo}: ER without TY; ignored`);
      current = null;
      continue;
    }
    if (!current) {
      warnings.push(`line ${lineNo}: ${tag} outside of TY/ER block; ignored`);
      continue;
    }
    const list = current.tags.get(tag) ?? [];
    list.push(value);
    current.tags.set(tag, list);
    current.lastTag = tag;
  }
  if (current) {
    warnings.push('input ended without ER; flushing final entry');
    entries.push(toBibEntry(current));
  }
  return { entries, warnings };
}

interface RawEntry {
  type: string;
  tags: Map<string, string[]>;
  lastTag: string;
}

function toBibEntry(raw: RawEntry): BibEntry {
  const fields: Record<string, string> = {};
  const get = (tag: string): string | undefined => {
    const v = raw.tags.get(tag);
    return v && v.length > 0 ? v[0] : undefined;
  };
  const getMany = (tag: string): string[] | undefined => raw.tags.get(tag);

  // Authors: AU may repeat. A1, A2 are alternative author tags.
  const authors = [
    ...(getMany('AU') ?? []),
    ...(getMany('A1') ?? []),
    ...(getMany('A2') ?? []),
  ];
  if (authors.length > 0) {
    // RIS author convention is "Last, First M." -- already BibTeX-friendly.
    fields.author = authors.join(' and ');
  }

  // Editors via A3 or ED.
  const editors = [...(getMany('A3') ?? []), ...(getMany('ED') ?? [])];
  if (editors.length > 0 && !fields.author) {
    fields.editor = editors.join(' and ');
  }

  const title = get('TI') ?? get('T1') ?? get('CT');
  if (title) fields.title = title;

  // Journal / book name; different tags depending on source.
  const journal = get('JO') ?? get('JF') ?? get('J2') ?? get('JA');
  const bookTitle = get('T2') ?? get('BT');
  if (journal) fields.journal = journal;
  else if (bookTitle) fields.booktitle = bookTitle;

  const yearRaw = get('PY') ?? get('Y1') ?? get('DA');
  if (yearRaw) {
    const ym = yearRaw.match(/\d{4}/);
    if (ym) fields.year = ym[0];
  }

  if (get('VL')) fields.volume = get('VL')!;
  if (get('IS')) fields.number = get('IS')!;
  // Pages: SP+EP combine; if only SP, use it alone.
  const sp = get('SP');
  const ep = get('EP');
  if (sp && ep) fields.pages = `${sp}--${ep}`;
  else if (sp) fields.pages = sp;

  if (get('PB')) fields.publisher = get('PB')!;
  if (get('SN')) {
    const sn = get('SN')!;
    // SN holds either ISBN or ISSN; heuristic: ISSNs are 8 chars with hyphen.
    if (/^\d{4}-\d{3}[\dXx]$/.test(sn.replace(/\s/g, ''))) {
      fields.issn = sn;
    } else {
      fields.isbn = sn;
    }
  }
  if (get('DO')) fields.doi = get('DO')!;
  if (get('UR')) fields.url = get('UR')!;
  const abstract = get('AB') ?? get('N2');
  if (abstract) fields.abstract = abstract;
  // Custom citation key from ID (rare but Zotero exports include it).
  const customKey = get('ID');

  return {
    key: customKey ?? '',
    type: mapRisType(raw.type),
    fields,
  };
}

function mapRisType(ty: string): string {
  switch (ty.toUpperCase()) {
    case 'JOUR': case 'EJOUR': case 'JFULL': return 'article';
    case 'BOOK': case 'EBOOK': return 'book';
    case 'CHAP': case 'ECHAP': return 'incollection';
    case 'CONF': case 'CPAPER': return 'inproceedings';
    case 'THES': return 'phdthesis';
    case 'RPRT': return 'techreport';
    case 'GEN': case 'UNPB': return 'unpublished';
    default: return 'misc';
  }
}
