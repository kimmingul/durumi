import { syntaxTree } from '@codemirror/language';
import { Decoration, EditorView, keymap } from '@codemirror/view';
import { type EditorState, type Extension, RangeSetBuilder } from '@codemirror/state';
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common';
import { shouldHideMarker } from './decorations/activeLine';
import { getActiveLineRange, hasActiveLine } from './decorations/activeLine';

/**
 * v0.2.23 — atomic-widget UX for Image and Link nodes.
 *
 * Backing problem: the live-preview decorations replace `![](url)` and
 * `[label](url)` with widgets, but the underlying markdown source is
 * still character-addressable. Without intervention:
 *   - Clicking on the image places the caret somewhere inside the
 *     hidden source string. Arrow keys creep across `![](url)` one
 *     character at a time even though the user sees a single image.
 *   - Backspace next to the rendered widget deletes ONE source char
 *     (usually the closing `)`), breaking the markdown so the parser
 *     stops producing the node — and now the user sees the raw
 *     `![](url)` text where their image used to be.
 *
 * This module restores the "widget behaves as one thing" contract via
 * two CM6 facets:
 *
 *   1. `EditorView.atomicRanges` — registers the widget's backing range
 *      so cursor motion, mouse placement, and selection extension all
 *      treat it as a single unit. The cursor can land at either edge of
 *      the range, never inside.
 *
 *      For Image: the entire `Image` node range is atomic.
 *      For Link (real `[label](url)`): only the HIDDEN prefix `[` and
 *      the hidden suffix `](url)` are atomic — the label between them
 *      stays editable so users can type into and rename the visible
 *      text without selecting+retyping.
 *
 *   2. A keymap that intercepts Backspace / Delete when the caret is at
 *      a widget edge and removes the entire node in one dispatch.
 *      `atomicRanges` is consulted by cursor-motion commands but NOT by
 *      `deleteCharBackward` / `deleteCharForward` in `@codemirror/commands`,
 *      so without this keymap a Backspace at the right edge of an atomic
 *      range would still snip one source character.
 *
 * Mode gate: both pieces only kick in when the decoration would
 * actually hide the markers (`shouldHideMarker`). In Typora mode on the
 * active line the source is visible — atomicity there would surprise
 * the user mid-edit, so we let default cursor / delete behavior through.
 */

interface LinkBounds {
  openBracket: number;
  closeBracket: number;
}

/** Mirror image.ts/link.ts: the Image's URL child must exist for the widget to render. */
function imageHasUrl(node: SyntaxNode): boolean {
  let cur = node.firstChild;
  while (cur) {
    if (cur.name === 'URL') return true;
    cur = cur.nextSibling;
  }
  return false;
}

/** Mirror link.ts — return null for shortcut/reference links that lack a URL child. */
function linkBounds(node: SyntaxNode, doc: string): LinkBounds | null {
  let openBracket: number | null = null;
  let closeBracket: number | null = null;
  let hasUrl = false;
  let cur = node.firstChild;
  while (cur) {
    if (cur.name === 'LinkMark') {
      const ch = doc[cur.from];
      if (openBracket === null) {
        if (ch === '[') openBracket = cur.from;
      } else if (closeBracket === null && ch === ']') {
        closeBracket = cur.from;
      }
    } else if (cur.name === 'URL') {
      hasUrl = true;
    }
    cur = cur.nextSibling;
  }
  if (!hasUrl || openBracket === null || closeBracket === null) return null;
  return { openBracket, closeBracket };
}

function lineActiveFor(state: EditorState, nodeFrom: number, nodeTo: number): boolean {
  if (!hasActiveLine(state)) return false;
  const active = getActiveLineRange(state);
  return !(nodeTo < active.from || nodeFrom > active.to);
}

/**
 * `EditorView.atomicRanges` provider — see facet semantics above.
 * Returns a `RangeSet` whose values are unused; only the from/to of
 * each range matters to the cursor-motion logic.
 */
function buildAtomicRanges(view: EditorView): ReturnType<RangeSetBuilder<Decoration>['finish']> {
  const builder = new RangeSetBuilder<Decoration>();
  const state = view.state;
  const doc = state.doc.toString();
  for (const range of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: range.from,
      to: range.to,
      enter(node: SyntaxNodeRef) {
        if (node.name === 'Image') {
          if (!imageHasUrl(node.node)) return;
          const active = lineActiveFor(state, node.from, node.to);
          if (!shouldHideMarker(state, active)) return;
          builder.add(node.from, node.to, Decoration.mark({}));
        } else if (node.name === 'Link') {
          const bounds = linkBounds(node.node, doc);
          if (!bounds) return;
          const active = lineActiveFor(state, node.from, node.to);
          if (!shouldHideMarker(state, active)) return;
          // Hidden prefix: from .. (openBracket + 1) — the leading `[` and
          // anything before it inside the Link node. Hidden suffix:
          // closeBracket .. to — covers `](url)` / `](url "title")` and
          // any trailing chars the parser folded into the node.
          if (bounds.openBracket + 1 > node.from) {
            builder.add(node.from, bounds.openBracket + 1, Decoration.mark({}));
          }
          if (node.to > bounds.closeBracket) {
            builder.add(bounds.closeBracket, node.to, Decoration.mark({}));
          }
        }
      },
    });
  }
  return builder.finish();
}

interface MediaTarget {
  from: number;
  to: number;
}

/**
 * Look for an Image or Link node whose deletion-relevant edge sits at
 * `pos`. Direction `'backward'` is for Backspace (cursor wants to
 * delete the thing before it); `'forward'` is for Delete.
 *
 * For an Image, "edge" is the corresponding side of the whole node.
 * For a Link, we also accept positions immediately INSIDE the visible
 * label (just after `[` on the left, just before `]` on the right) —
 * those are where the cursor lands after atomicRanges snaps it out of
 * the hidden brackets. Without those checks a user pressing Backspace
 * at the start of the label would just delete the `[` and break the
 * markdown.
 */
function findMediaAtEdge(
  state: EditorState,
  pos: number,
  direction: 'backward' | 'forward',
): MediaTarget | null {
  const doc = state.doc.toString();
  // Iterate a small window around `pos` — `tree.iterate` reports every
  // node that overlaps the range, including nodes whose `to` is >= pos
  // and whose `from` is <= pos. A 2-char window catches Image/Link
  // boundaries flanking the caret without scanning the whole doc.
  let result: MediaTarget | null = null;
  syntaxTree(state).iterate({
    from: Math.max(0, pos - 1),
    to: Math.min(state.doc.length, pos + 1),
    enter(node) {
      if (result) return false;
      if (node.name === 'Image') {
        if (!imageHasUrl(node.node)) return;
        const active = lineActiveFor(state, node.from, node.to);
        if (!shouldHideMarker(state, active)) return;
        if (direction === 'backward' && pos === node.to) {
          result = { from: node.from, to: node.to };
        } else if (direction === 'forward' && pos === node.from) {
          result = { from: node.from, to: node.to };
        }
      } else if (node.name === 'Link') {
        const bounds = linkBounds(node.node, doc);
        if (!bounds) return;
        const active = lineActiveFor(state, node.from, node.to);
        if (!shouldHideMarker(state, active)) return;
        if (direction === 'backward') {
          // Cursor at the right edge of the whole link OR at the start
          // of the label (i.e. just after the hidden `[`). Either way,
          // the user's next deletion would land inside the hidden part
          // and break the markdown — collapse to a whole-node delete.
          if (pos === node.to || pos === bounds.openBracket + 1) {
            result = { from: node.from, to: node.to };
          }
        } else if (direction === 'forward') {
          if (pos === node.from || pos === bounds.closeBracket) {
            result = { from: node.from, to: node.to };
          }
        }
      }
      return undefined;
    },
  });
  return result;
}

function deleteMediaBackward(view: EditorView): boolean {
  const sel = view.state.selection.main;
  if (!sel.empty) return false; // selection delete is already correct
  const target = findMediaAtEdge(view.state, sel.head, 'backward');
  if (!target) return false;
  view.dispatch({
    changes: { from: target.from, to: target.to },
    selection: { anchor: target.from },
    userEvent: 'delete.backward',
  });
  return true;
}

function deleteMediaForward(view: EditorView): boolean {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  const target = findMediaAtEdge(view.state, sel.head, 'forward');
  if (!target) return false;
  view.dispatch({
    changes: { from: target.from, to: target.to },
    selection: { anchor: target.from },
    userEvent: 'delete.forward',
  });
  return true;
}

export function atomicMediaExtension(): Extension {
  return [
    EditorView.atomicRanges.of(buildAtomicRanges),
    // High-priority keymap so we run BEFORE the default Backspace/Delete
    // from `@codemirror/commands`. Returning `false` falls through to the
    // default when the caret isn't at a media edge, so non-widget edits
    // are unaffected.
    keymap.of([
      { key: 'Backspace', run: deleteMediaBackward },
      { key: 'Delete', run: deleteMediaForward },
    ]),
  ];
}

// Test seam — exposed so the unit suite can drive the lookup logic
// without bringing up a full EditorView.
export const __test = { findMediaAtEdge };
