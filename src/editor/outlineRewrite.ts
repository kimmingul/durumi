/**
 * Pure helpers for the Outline drag-to-reorder feature.
 *
 * Given a markdown source string, callers identify a "section" by the
 * 1-based line number of its ATX heading. The section runs from the heading
 * line down to (but not including) the next heading at the same or higher
 * level. We can then move that section relative to another heading and
 * optionally re-level it so it nests under a new parent.
 *
 * Front matter (`---\n...\n---`) at the very top of the document is treated
 * as immovable -- moves can't push content above or below it.
 *
 * Only ATX headings (`# ` ... `###### `) are touched. Setext headings
 * (`====` / `----` underline) are not reorderable; callers should disable
 * the drag UI for them. The helpers here don't recognise setext, so a doc
 * containing them simply has no movable sections detected.
 */
import { parseFrontMatterFenced } from '../../shared/frontMatterFenced';

const ATX_HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const FENCE_RE = /^(```|~~~)/;

interface AtxHeading {
  level: number;
  /** 1-based line number in the original document. */
  line: number;
}

/** Same parser as src/editor/outline.ts, but skips lines that fall inside
 *  the front-matter region. The Outline UI shares the original parser; here
 *  we need an offset-aware list when computing section ranges. */
function parseAtxHeadings(doc: string): AtxHeading[] {
  const fm = parseFrontMatterFenced(doc);
  const fmLines = fm.raw ? fm.raw.split('\n').length - (fm.raw.endsWith('\n') ? 1 : 0) : 0;
  const lines = doc.split('\n');
  const out: AtxHeading[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (i < fmLines) continue;
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = ATX_HEADING_RE.exec(line);
    if (!m) continue;
    out.push({ level: m[1].length, line: i + 1 });
  }
  return out;
}

/**
 * Returns `[fromLine, toLine)` (1-based, half-open) covering the section
 * that begins at `headingLine`. The "to" line is the first line that is
 * NOT part of the section (i.e. the next sibling/parent heading, or
 * `lines.length + 1` when the section runs to end of doc).
 *
 * Returns `null` when `headingLine` doesn't refer to an ATX heading.
 */
export function findSectionRange(
  doc: string,
  headingLine: number,
): [number, number] | null {
  const headings = parseAtxHeadings(doc);
  const idx = headings.findIndex((h) => h.line === headingLine);
  if (idx === -1) return null;
  const head = headings[idx];
  const totalLines = doc.split('\n').length;
  for (let j = idx + 1; j < headings.length; j++) {
    if (headings[j].level <= head.level) {
      return [head.line, headings[j].line];
    }
  }
  return [head.line, totalLines + 1];
}

/**
 * Slices the section out of the doc. Returns the section block (with its
 * trailing newline preserved when one was present) and the document with
 * that block removed.
 */
export function extractSection(
  doc: string,
  range: [number, number],
): { section: string; remainder: string } {
  const lines = doc.split('\n');
  const [from, to] = range;
  // 1-based lines -> 0-based slice indices.
  const sectionLines = lines.slice(from - 1, to - 1);
  const before = lines.slice(0, from - 1);
  const after = lines.slice(to - 1);
  const section = sectionLines.join('\n');
  const remainder = [...before, ...after].join('\n');
  return { section, remainder };
}

/**
 * Re-levels every ATX heading in `section` by `delta`. Returns `null` when
 * the change would push any heading below H1 or above H6, or when the
 * first line isn't an ATX heading. Headings inside fenced code blocks are
 * left untouched.
 */
export function relevelSection(section: string, delta: number): string | null {
  if (delta === 0) return section;
  const lines = section.split('\n');
  if (lines.length === 0) return null;
  const first = ATX_HEADING_RE.exec(lines[0]);
  if (!first) return null;
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = ATX_HEADING_RE.exec(line);
    if (!m) continue;
    const newLevel = m[1].length + delta;
    if (newLevel < 1 || newLevel > 6) return null;
    lines[i] = '#'.repeat(newLevel) + line.slice(m[1].length);
  }
  return lines.join('\n');
}

export type DropPosition = 'before' | 'after' | 'inside';

/**
 * Moves the section starting at `sourceLine` so it sits relative to the
 * heading at `targetLine` according to `position`:
 *   - 'before' -> insert as a sibling above the target (matches target.level)
 *   - 'after'  -> insert as a sibling below the target's section
 *                (matches target.level)
 *   - 'inside' -> insert at the end of the target's section
 *                (target.level + 1)
 *
 * Returns `null` when:
 *   - the source or target line isn't an ATX heading,
 *   - the move is a no-op (dropping a section onto itself / inside itself),
 *   - re-leveling the section would produce a heading outside H1-H6.
 */
export function applyMove(
  doc: string,
  sourceLine: number,
  targetLine: number,
  position: DropPosition,
): string | null {
  if (sourceLine === targetLine) return null;

  const headings = parseAtxHeadings(doc);
  const source = headings.find((h) => h.line === sourceLine);
  const target = headings.find((h) => h.line === targetLine);
  if (!source || !target) return null;

  const sourceRange = findSectionRange(doc, sourceLine);
  const targetRange = findSectionRange(doc, targetLine);
  if (!sourceRange || !targetRange) return null;

  // Refuse to drop a section onto its own range.
  if (targetLine >= sourceRange[0] && targetLine < sourceRange[1]) return null;

  const desiredLevel =
    position === 'inside' ? target.level + 1 : target.level;
  if (desiredLevel < 1 || desiredLevel > 6) return null;
  const delta = desiredLevel - source.level;

  const lines = doc.split('\n');
  const sectionLines = lines.slice(sourceRange[0] - 1, sourceRange[1] - 1);
  const sectionText = sectionLines.join('\n');
  const releveled = relevelSection(sectionText, delta);
  if (releveled === null) return null;

  // Build the doc with the source block excised.
  const remainderLines = [
    ...lines.slice(0, sourceRange[0] - 1),
    ...lines.slice(sourceRange[1] - 1),
  ];

  // Compute the insertion line in `remainderLines`. Positions are relative
  // to the original doc, so we need to shift them when the source block
  // sat above the target.
  const sectionLen = sourceRange[1] - sourceRange[0]; // # of lines pulled
  const adjust = (line: number): number =>
    line >= sourceRange[1] ? line - sectionLen : line;

  let insertAt: number; // 1-based line position in remainderLines (1..N+1)
  if (position === 'before') {
    insertAt = adjust(targetRange[0]);
  } else {
    // 'after' and 'inside' both append at the end of the target's range.
    insertAt = adjust(targetRange[1]);
  }

  // Make sure we're not inserting above the front-matter region.
  const fm = parseFrontMatterFenced(doc);
  const fmLines = fm.raw ? fm.raw.split('\n').length - (fm.raw.endsWith('\n') ? 1 : 0) : 0;
  if (insertAt - 1 < fmLines) insertAt = fmLines + 1;

  // Splice the re-leveled section in.
  const insertLines = releveled.split('\n');
  const out = [
    ...remainderLines.slice(0, insertAt - 1),
    ...insertLines,
    ...remainderLines.slice(insertAt - 1),
  ];
  return out.join('\n');
}

/**
 * Detects whether the document contains any setext-style heading (a line of
 * `=` or `-` directly under a non-empty line, outside fenced code). The
 * Outline drag UI uses this to disable dragging on docs that mix styles or
 * use only setext headings.
 */
export function hasSetextHeading(doc: string): boolean {
  const lines = doc.split('\n');
  let inFence = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!/^(=+|-+)\s*$/.test(line)) continue;
    const prev = lines[i - 1];
    if (!prev || !prev.trim()) continue;
    // Setext heading underlines must follow a paragraph line; we don't try
    // to be too clever about edge cases (e.g. `---` as a horizontal rule
    // after a blank line), since the Outline parser already only returns
    // ATX headings -- this guard exists to disable drag when the user has
    // setext headings the parser ignored.
    if (ATX_HEADING_RE.test(prev)) continue;
    return true;
  }
  return false;
}
