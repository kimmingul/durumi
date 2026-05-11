/**
 * v0.1.10 — Smart-merge for `[@key]` insertions.
 *
 * When the user inserts `[@b]` and the caret is immediately adjacent to (or
 * inside) an existing `[@a]` cite group, we merge into `[@a; @b]` rather than
 * producing two adjacent groups `[@a][@b]`. If the inserted key already lives
 * in the adjacent group, we surface a `duplicate` outcome so the caller can
 * toast "already cited" instead of creating noise.
 *
 * The helper is pure: given `(doc, pos, key)` it produces a single edit
 * descriptor `(from, to, insert, caret)` or a `duplicate` outcome. It does
 * not know about CodeMirror, the editor view, or React — the caller adapts
 * the descriptor to whatever dispatch mechanism it uses.
 *
 * Pandoc cite shapes we recognise:
 *   `[@key]`              single
 *   `[-@key]`             author-suppressing
 *   `[@a; @b]`            grouped
 *   `[@a; @b, p. 33]`     grouped + locator (preserved)
 *
 * We do NOT touch locators or prefixes — only the bare `@key` list is
 * rewritten. That keeps the merge predictable and avoids breaking
 * already-customised cite blocks.
 */

export type CitationInsertOutcome =
  | { kind: 'replace'; from: number; to: number; insert: string; caret: number }
  | { kind: 'duplicate'; existingGroupRange: [number, number] };

/**
 * Decide how to insert `key` at `pos` in `doc`.
 *
 * Rules (in priority order):
 *   1. If `pos` falls inside (or immediately bordering) a `[@…]` group,
 *      target that group.
 *      - If `key` is already in the group: `{ kind: 'duplicate' }`.
 *      - Otherwise append `; @key` to the existing key list and return a
 *        `replace` that rewrites the whole group.
 *   2. Otherwise emit a plain `[@key]` insertion at `pos`.
 */
export function insertCitationSmart(
  doc: string,
  pos: number,
  key: string,
): CitationInsertOutcome {
  const clean = stripKey(key);
  if (clean.length === 0) {
    return { kind: 'replace', from: pos, to: pos, insert: '', caret: pos };
  }

  const adjacent = findAdjacentGroup(doc, pos);
  if (adjacent) {
    const existingKeys = parseKeysInGroup(doc, adjacent.keyListStart, adjacent.keyListEnd);
    if (existingKeys.includes(clean)) {
      return { kind: 'duplicate', existingGroupRange: [adjacent.from, adjacent.to] };
    }
    const merged = [...existingKeys, clean].map((k) => `@${k}`).join('; ');
    return {
      kind: 'replace',
      from: adjacent.keyListStart,
      to: adjacent.keyListEnd,
      insert: merged,
      // Place caret just before the closing `]` (or before the locator if
      // present — that's where the keyList ends).
      caret: adjacent.keyListStart + merged.length,
    };
  }

  const inserted = `[@${clean}]`;
  return {
    kind: 'replace',
    from: pos,
    to: pos,
    insert: inserted,
    caret: pos + inserted.length,
  };
}

/**
 * Strip a user-supplied key down to the bare token (drop a leading `@` or
 * a wrapping `[@…]` if the caller accidentally passed those). Returns the
 * empty string when nothing usable remains.
 */
function stripKey(raw: string): string {
  let k = raw.trim();
  if (k.startsWith('[@') && k.endsWith(']')) k = k.slice(2, -1);
  if (k.startsWith('@')) k = k.slice(1);
  return k.trim();
}

interface AdjacentGroup {
  /** Absolute offset of the opening `[`. */
  from: number;
  /** Absolute offset of the position right after `]`. */
  to: number;
  /** Start of the key list (after the optional `-` prefix). */
  keyListStart: number;
  /** End of the key list (before any locator / `]`). */
  keyListEnd: number;
}

/**
 * Find a `[@…]` group that `pos` is inside of or immediately adjacent to.
 * "Adjacent" means `pos === from` (just before `[`) or `pos === to` (just
 * after `]`). We deliberately use scan rather than regex over the whole
 * doc because the caller often has a multi-MB buffer and the cite syntax
 * is small enough to recognise by hand.
 */
function findAdjacentGroup(doc: string, pos: number): AdjacentGroup | null {
  if (pos < 0 || pos > doc.length) return null;

  // Probe a small window around `pos` so we don't scan the whole doc.
  // The longest plausible cite group is ~200 chars; we widen to 512 to
  // be safe (multi-key groups with locators).
  const RADIUS = 512;
  const lo = Math.max(0, pos - RADIUS);
  const hi = Math.min(doc.length, pos + RADIUS);

  // Walk left from `pos - 1` (i.e. the character immediately to the left
  // of the caret) looking for an unbalanced `[`.
  let openIdx = -1;
  for (let i = pos - 1; i >= lo; i--) {
    const ch = doc[i];
    if (ch === ']') {
      // The `]` is to our left — if it's right before pos we may still be
      // "immediately after" a group; check that explicitly below.
      if (i === pos - 1) {
        // pos is right after a `]` — look further left for its `[`.
        const groupEnd = i + 1;
        const groupStart = findMatchingOpen(doc, i);
        if (groupStart >= 0) {
          const g = makeGroup(doc, groupStart, groupEnd);
          if (g) return g;
        }
      }
      break;
    }
    if (ch === '[') {
      openIdx = i;
      break;
    }
    // Newlines terminate a cite group in practice — bail.
    if (ch === '\n') break;
  }
  if (openIdx >= 0) {
    // Look right for the matching `]`.
    for (let j = openIdx + 1; j < hi; j++) {
      const ch = doc[j];
      if (ch === ']') {
        if (pos <= j + 1 && pos >= openIdx) {
          return makeGroup(doc, openIdx, j + 1);
        }
        break;
      }
      if (ch === '\n' || ch === '[') break;
    }
  }

  // Also handle the "caret immediately before `[`" case — pos === openIdx.
  if (pos < doc.length && doc[pos] === '[') {
    for (let j = pos + 1; j < hi; j++) {
      const ch = doc[j];
      if (ch === ']') return makeGroup(doc, pos, j + 1);
      if (ch === '\n' || ch === '[') break;
    }
  }
  return null;
}

function findMatchingOpen(doc: string, closeIdx: number): number {
  // Walk left until we hit `[` (no nesting in Pandoc cites).
  const lo = Math.max(0, closeIdx - 512);
  for (let i = closeIdx - 1; i >= lo; i--) {
    if (doc[i] === '[') return i;
    if (doc[i] === '\n' || doc[i] === ']') return -1;
  }
  return -1;
}

/**
 * Build an `AdjacentGroup` if the bracket pair at `[from, to)` actually
 * looks like a Pandoc cite group (`[@…]` or `[-@…]`).
 */
function makeGroup(doc: string, from: number, to: number): AdjacentGroup | null {
  const inner = doc.slice(from + 1, to - 1);
  // Recognise `@key` (optionally preceded by `-`) at the start. Anything
  // else (footnote `^…`, link `text](url)`, image `!…`) is not a cite.
  let cursor = 0;
  if (inner[cursor] === '-') cursor += 1;
  if (inner[cursor] !== '@') return null;

  const keyListStartInInner = cursor;
  // Walk the key list: `@key` segments separated by `;` (with optional
  // whitespace). We stop at the first `,` (locator) or end-of-bracket.
  let i = cursor;
  while (i < inner.length) {
    const ch = inner[i];
    if (ch === ',') break;
    i += 1;
  }
  // Trim trailing whitespace before the locator.
  let keyListEndInInner = i;
  while (keyListEndInInner > keyListStartInInner && /\s/.test(inner[keyListEndInInner - 1] ?? '')) {
    keyListEndInInner -= 1;
  }
  return {
    from,
    to,
    keyListStart: from + 1 + keyListStartInInner,
    keyListEnd: from + 1 + keyListEndInInner,
  };
}

/**
 * Pull the bare key tokens out of a `@a; @b; @c` segment. Order is
 * preserved so the merged group keeps its visual ordering.
 */
function parseKeysInGroup(doc: string, start: number, end: number): string[] {
  const slice = doc.slice(start, end);
  // Drop the optional leading `-` (author-suppression sticks to the FIRST
  // key but we treat it as part of the prefix when re-emitting; for the
  // duplicate-check we just want bare keys).
  const cleaned = slice.replace(/^-/, '');
  const out: string[] = [];
  for (const segment of cleaned.split(';')) {
    const m = segment.trim().match(/^@([^\s,]+)/);
    if (m && m[1]) out.push(m[1]);
  }
  return out;
}
