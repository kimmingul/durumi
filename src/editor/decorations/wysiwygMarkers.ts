import { Range } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { isWysiwygMode, setEditMode } from '../editMode';
import { getActiveLineRange, hasActiveLine } from './activeLine';

/**
 * v0.1.11 — WYSIWYG mode active-line marker hider.
 *
 * In WYSIWYG mode all the other decoration plugins still skip the active
 * line for `Decoration.replace` (the IME-safety invariant), so the active
 * line normally exposes raw markdown markers. This plugin layers on top:
 * it scans only the active line for inline markdown punctuation and adds
 * `Decoration.mark({ class: 'cm-md-marker-hidden' })`. The text stays in
 * the DOM (`Decoration.mark` does NOT replace nodes); a CSS rule with
 * `display: none` hides it from rendering. Cursor positions remain valid
 * because the underlying document text is untouched.
 *
 * Block widgets (image, math, mermaid) are intentionally NOT hidden here.
 * Showing their source on the active line is the user's editing affordance.
 * Future Phase 4 work can introduce a click-to-edit overlay.
 *
 * Patterns covered:
 *   - ATX heading leader: `^#{1,6}\s`
 *   - Blockquote prefix: `^>+\s?`
 *   - List markers: `^\s*(?:[-*+]|\d+\.)\s`
 *   - Inline emphasis: `**`, `__`, `*`, `_`, `~~`
 *   - Inline code backticks: `` ` ``
 */
export function wysiwygMarkerHider(): ViewPlugin<{ decorations: DecorationSet }> {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = computeMarkers(view);
      }

      update(u: ViewUpdate) {
        if (
          u.docChanged ||
          u.selectionSet ||
          u.transactions.some((tr) => tr.effects.some((e) => e.is(setEditMode)))
        ) {
          this.decorations = computeMarkers(u.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

function computeMarkers(view: EditorView): DecorationSet {
  const state = view.state;
  if (!isWysiwygMode(state)) return Decoration.none;
  if (!hasActiveLine(state)) return Decoration.none;
  const line = getActiveLineRange(state);
  const text = state.doc.sliceString(line.from, line.to);
  const ranges = findMarkerRanges(text, line.from);
  if (ranges.length === 0) return Decoration.none;
  const marks: Range<Decoration>[] = ranges
    .filter(([from, to]) => from < to)
    .map(([from, to]) => Decoration.mark({ class: 'cm-md-marker-hidden' }).range(from, to));
  return Decoration.set(marks, /* sort */ true);
}

/**
 * Pure scan exposed for tests. Returns marker ranges relative to the
 * document (so `lineFrom` is added to each match's local offset).
 */
export function findMarkerRanges(lineText: string, lineFrom: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];

  const heading = lineText.match(/^(#{1,6})\s/);
  if (heading) {
    ranges.push([lineFrom, lineFrom + heading[0].length]);
  }

  const quote = lineText.match(/^(>+)\s?/);
  if (quote) {
    ranges.push([lineFrom, lineFrom + quote[0].length]);
  }

  const list = lineText.match(/^(\s*)([-*+]|\d+\.)\s/);
  if (list) {
    const start = lineFrom + list[1].length;
    ranges.push([start, start + list[2].length + 1]);
  }

  // Inline emphasis / strike / code markers. Order matters: try the
  // longer two-char sequences first so `**` isn't split into two `*`.
  const inlineMarker = /(\*\*|__|~~|\*|_|`)/g;
  for (const m of lineText.matchAll(inlineMarker)) {
    if (m.index === undefined) continue;
    ranges.push([lineFrom + m.index, lineFrom + m.index + m[0].length]);
  }

  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return mergeOverlapping(ranges);
}

function mergeOverlapping(ranges: Array<[number, number]>): Array<[number, number]> {
  if (ranges.length <= 1) return ranges;
  const merged: Array<[number, number]> = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    const cur = ranges[i];
    if (cur[0] <= last[1]) {
      last[1] = Math.max(last[1], cur[1]);
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

export const wysiwygMarkerTheme = EditorView.theme({
  '.cm-md-marker-hidden': {
    display: 'none',
  },
});
