import type { EditorView } from '@codemirror/view';
import type { EditorState, Line } from '@codemirror/state';

/**
 * Shared list-toggle helpers used by the Document-mode toolbar buttons.
 *
 * Pre-v0.2.19 the toolbar's bullet / numbered / task handlers all operated on
 * `view.state.doc.lineAt(head)` only, so a multi-line selection silently
 * applied the prefix to the FIRST line and left the rest untouched.
 *
 * v0.2.19 fixes this:
 *   1. The selection is expanded line-wise (start of first line to end of
 *      last line) so a selection that starts/ends mid-line still covers the
 *      full line range.
 *   2. Every line in that range is visited; for each line we decide whether
 *      to add, swap, or remove the prefix.
 *   3. All edits land in a single `view.dispatch` so the change is one undo
 *      step.
 *
 * Numbered-list continuity (bug #3): when the toolbar applies `1. ` we first
 * scan upward from the first selected line to check whether the previous
 * non-blank line is already a numbered item — if so we continue from
 * `prev + 1` instead of restarting at `1`. The multi-line case then numbers
 * the remaining lines consecutively from there.
 *
 * Toggle-off rule: a contiguous selection where EVERY non-blank line
 * already carries the target marker removes the marker from each line
 * (matching Typora / VS Code behaviour). A mixed selection adds the marker
 * to the lines that lack it AND normalises lines that carry a different
 * list type.
 *
 * Blank lines are skipped (no prefix added, no removal needed), which
 * matches every other markdown editor we surveyed.
 */

const BULLET_RE = /^([-*+])(\s+)/;
const ORDERED_RE = /^(\d+)([.)])(\s+)/;
const TASK_RE = /^([-*+])(\s+)\[[ xX]\](\s+)/;

interface SelectionLines {
  lines: Line[];
}

function collectSelectedLines(state: EditorState): SelectionLines {
  const { from, to } = state.selection.main;
  const firstLine = state.doc.lineAt(from);
  // Caret on a line break that BEGINS the next line shouldn't pull that line
  // in when the selection ends exactly at line.from (the boundary belongs to
  // the previous line in user intuition).
  const lastLine =
    to > from && to === state.doc.lineAt(to).from
      ? state.doc.lineAt(to - 1)
      : state.doc.lineAt(to);
  const lines: Line[] = [];
  for (let n = firstLine.number; n <= lastLine.number; n += 1) {
    lines.push(state.doc.line(n));
  }
  return { lines };
}

/** Walks upward from `line` to find the previous non-blank line; null if top. */
function previousNonBlank(state: EditorState, line: Line): Line | null {
  for (let n = line.number - 1; n >= 1; n -= 1) {
    const candidate = state.doc.line(n);
    if (candidate.text.trim().length > 0) return candidate;
  }
  return null;
}

/** Strip any of the supported list prefixes; returns the prefix length removed. */
function stripAnyListPrefix(text: string): { stripped: string; removedLen: number } {
  const task = TASK_RE.exec(text);
  if (task) {
    const len = task[0].length;
    return { stripped: text.slice(len), removedLen: len };
  }
  const ordered = ORDERED_RE.exec(text);
  if (ordered) {
    const len = ordered[0].length;
    return { stripped: text.slice(len), removedLen: len };
  }
  const bullet = BULLET_RE.exec(text);
  if (bullet) {
    const len = bullet[0].length;
    return { stripped: text.slice(len), removedLen: len };
  }
  return { stripped: text, removedLen: 0 };
}

interface LineChange {
  from: number;
  to: number;
  insert: string;
}

function lineChange(line: Line, replaceLen: number, insert: string): LineChange {
  return { from: line.from, to: line.from + replaceLen, insert };
}

/** True when every non-blank line already matches `regex`. */
function allMatch(lines: Line[], regex: RegExp): boolean {
  let nonBlank = 0;
  for (const line of lines) {
    if (line.text.trim().length === 0) continue;
    nonBlank += 1;
    if (!regex.test(line.text)) return false;
  }
  return nonBlank > 0;
}

/**
 * True when every line in the selection is blank — used to detect the
 * "user clicked the toolbar button on an empty doc / blank line"
 * special case. v0.2.20 — fixes the v0.2.19 regression where the
 * toolbar bullet / numbered / task buttons did nothing on a blank line
 * because `allBlank` was skipped silently. We now seed the marker on
 * the (only, blank) line so the user sees the prefix appear and can
 * start typing the item text.
 */
function allBlank(lines: Line[]): boolean {
  return lines.every((line) => line.text.trim().length === 0);
}

/**
 * Toggle a `- ` bullet on every line in the selection.
 *
 * - All non-blank lines already bullets ⇒ remove the bullet from each.
 * - Otherwise ⇒ replace any existing prefix (numbered, task) with `- `
 *   and add `- ` to plain lines.
 * - All lines blank (e.g. empty doc, blank line) ⇒ seed `- ` on the
 *   first line so the toolbar button is meaningful from any caret
 *   position (v0.2.20 hot-fix for the toolbar-on-blank-line e2e tests
 *   that have been red since v0.2.19).
 */
export function toggleBulletList(view: EditorView): boolean {
  const { lines } = collectSelectedLines(view.state);
  if (lines.length === 0) return false;
  if (allBlank(lines)) {
    const first = lines[0]!;
    view.dispatch({
      changes: { from: first.from, to: first.from, insert: '- ' },
      selection: { anchor: first.from + 2 },
    });
    return true;
  }
  const changes: LineChange[] = [];
  if (allMatch(lines, BULLET_RE)) {
    for (const line of lines) {
      if (line.text.trim().length === 0) continue;
      const m = BULLET_RE.exec(line.text);
      if (!m) continue;
      changes.push(lineChange(line, m[0].length, ''));
    }
  } else {
    for (const line of lines) {
      if (line.text.trim().length === 0) continue;
      const { removedLen } = stripAnyListPrefix(line.text);
      changes.push(lineChange(line, removedLen, '- '));
    }
  }
  if (changes.length === 0) return false;
  view.dispatch({ changes });
  return true;
}

/**
 * Toggle a numbered (`1. `) marker on every line in the selection.
 *
 * - All non-blank lines already numbered ⇒ remove every numbered prefix.
 * - Otherwise ⇒ number the lines consecutively. Starting number defaults
 *   to 1 unless the previous non-blank line above the selection is itself
 *   a numbered item, in which case we continue from `prev + 1` (bug #3).
 */
export function toggleNumberedList(view: EditorView): boolean {
  const { lines } = collectSelectedLines(view.state);
  if (lines.length === 0) return false;
  if (allBlank(lines)) {
    // v0.2.20 — seed `1. ` on the (only, blank) line so the toolbar
    // button works from any caret position. Mirrors the bullet seed
    // above.
    const first = lines[0]!;
    let n = 1;
    const prev = previousNonBlank(view.state, first);
    if (prev) {
      const prevMatch = ORDERED_RE.exec(prev.text);
      if (prevMatch && prevMatch[1] !== undefined) {
        const next = Number(prevMatch[1]) + 1;
        if (Number.isFinite(next) && next >= 1) n = next;
      }
    }
    const insert = `${n}. `;
    view.dispatch({
      changes: { from: first.from, to: first.from, insert },
      selection: { anchor: first.from + insert.length },
    });
    return true;
  }
  const changes: LineChange[] = [];
  if (allMatch(lines, ORDERED_RE)) {
    for (const line of lines) {
      if (line.text.trim().length === 0) continue;
      const m = ORDERED_RE.exec(line.text);
      if (!m) continue;
      changes.push(lineChange(line, m[0].length, ''));
    }
  } else {
    let n = 1;
    // Numbering continuity: peek at the previous non-blank line above the
    // first selected line. If it's a numbered item, continue from `prev+1`.
    const first = lines[0]!;
    const prev = previousNonBlank(view.state, first);
    if (prev) {
      const prevMatch = ORDERED_RE.exec(prev.text);
      if (prevMatch && prevMatch[1] !== undefined) {
        const next = Number(prevMatch[1]) + 1;
        if (Number.isFinite(next) && next >= 1) n = next;
      }
    }
    for (const line of lines) {
      if (line.text.trim().length === 0) continue;
      const { removedLen } = stripAnyListPrefix(line.text);
      changes.push(lineChange(line, removedLen, `${n}. `));
      n += 1;
    }
  }
  if (changes.length === 0) return false;
  view.dispatch({ changes });
  return true;
}

/**
 * Toggle a `- [ ] ` checklist marker on every line in the selection.
 *
 * - All non-blank lines already task items ⇒ strip the `- [ ] ` / `- [x] `
 *   prefix from each (drops back to plain text, not a bare bullet — matches
 *   user intent of "remove the checklist").
 * - Lines that already have a bullet but no checkbox ⇒ insert `[ ] ` after
 *   the bullet marker (keeps the bullet, adds the checkbox).
 * - Plain lines ⇒ prepend `- [ ] `.
 * - Numbered-list lines ⇒ swap the numbered prefix for `- [ ] `.
 */
export function toggleTaskList(view: EditorView): boolean {
  const { lines } = collectSelectedLines(view.state);
  if (lines.length === 0) return false;
  if (allBlank(lines)) {
    // v0.2.20 — seed `- [ ] ` on the (only, blank) line so the toolbar
    // task button works from any caret position. Mirrors the bullet /
    // numbered seeds above.
    const first = lines[0]!;
    view.dispatch({
      changes: { from: first.from, to: first.from, insert: '- [ ] ' },
      selection: { anchor: first.from + 6 },
    });
    return true;
  }
  const changes: LineChange[] = [];
  if (allMatch(lines, TASK_RE)) {
    for (const line of lines) {
      if (line.text.trim().length === 0) continue;
      const m = TASK_RE.exec(line.text);
      if (!m) continue;
      changes.push(lineChange(line, m[0].length, ''));
    }
  } else {
    for (const line of lines) {
      if (line.text.trim().length === 0) continue;
      if (TASK_RE.test(line.text)) continue;
      const bullet = BULLET_RE.exec(line.text);
      if (bullet) {
        const offset = bullet[0].length;
        changes.push({
          from: line.from + offset,
          to: line.from + offset,
          insert: '[ ] ',
        });
        continue;
      }
      const { removedLen } = stripAnyListPrefix(line.text);
      changes.push(lineChange(line, removedLen, '- [ ] '));
    }
  }
  if (changes.length === 0) return false;
  view.dispatch({ changes });
  return true;
}
