import { syntaxTree } from '@codemirror/language';
import { Decoration, EditorView, keymap } from '@codemirror/view';
import {
  type EditorState,
  type Extension,
  Prec,
  RangeSetBuilder,
} from '@codemirror/state';
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common';
import { shouldHideMarker, getActiveLineRange, hasActiveLine } from './decorations/activeLine';
import { currentEditMode } from './editMode';

/**
 * v0.2.24 — atomic-widget UX for inline marks (Bold first; Italic /
 * Strike / Highlight / Code / Sub / Sup follow in later PRs).
 *
 * Mirror of atomicMedia.ts for the uniform inline-mark shape:
 * `<open><label><close>` where open/close are 1- or 2-char markers
 * that emphasis.ts already replaces with `cm-md-marker-hidden` widgets
 * (so the markers are visually invisible). Without atomicity:
 *   - Arrow keys creep across the hidden markers one char at a time.
 *   - Clicking "just after the bold" places caret inside or past the
 *     hidden `**`. Default Backspace then nicks one of the markers,
 *     breaks the `StrongEmphasis` parse, and re-exposes raw `**text*`.
 *
 * Two CM6 facets, same shape as atomicMedia.ts:
 *   1. EditorView.atomicRanges — registers the two marker ranges so
 *      cursor motion / mouse placement / selection extension treat
 *      each `**` (or `__`) as a single unit. Label between stays
 *      editable so typing inside `**bold**` works normally.
 *   2. Prec.high keymap intercepting Backspace / Delete at the three
 *      boundary positions (matches Link in atomicMedia.ts):
 *         backward: pos === node.to, pos === closeStart, pos === openEnd
 *         forward:  pos === node.from, pos === closeStart
 *      Returns false otherwise so default char-delete proceeds.
 *
 * Three-gate contract: atomic only applies when the markers would
 * actually be hidden in the rendered view (Principle §6). atomicMedia
 * is missing the Markdown-mode gate as a latent bug; this module
 * adds it explicitly via shouldApplyAtomic.
 */

interface InlineMarkSpec {
  /** Lezer node name. */
  nodeName: string;
  /** Number of source chars in each opening/closing marker. */
  markerLen: number;
  /** Valid head/tail literals. Head must equal tail (CommonMark contract). */
  validMarkers: readonly string[];
}

const BOLD_SPEC: InlineMarkSpec = {
  nodeName: 'StrongEmphasis',
  markerLen: 2,
  validMarkers: ['**', '__'],
};

const ITALIC_SPEC: InlineMarkSpec = {
  nodeName: 'Emphasis',
  markerLen: 1,
  validMarkers: ['*', '_'],
};

const INLINE_MARK_SPECS: readonly InlineMarkSpec[] = [BOLD_SPEC, ITALIC_SPEC];

/** Ancestor names that suppress markdown emphasis parsing (Principle §3). */
const CODE_ISLAND_NODE_NAMES: ReadonlySet<string> = new Set([
  'FencedCode',
  'CodeBlock',
  'InlineCode',
  'FrontMatter',
  'MathBlock',
  'InlineMath',
]);

interface InlineMarkBounds {
  from: number;
  to: number;
  openEnd: number; // from + markerLen
  closeStart: number; // to - markerLen
}

function inlineMarkBounds(
  node: SyntaxNode,
  spec: InlineMarkSpec,
  doc: string,
): InlineMarkBounds | null {
  const len = spec.markerLen;
  if (node.to - node.from < len * 2) return null;
  const head = doc.slice(node.from, node.from + len);
  const tail = doc.slice(node.to - len, node.to);
  if (!spec.validMarkers.includes(head)) return null;
  // CommonMark: an emphasis run must use the SAME delimiter on both
  // sides. Lezer's grammar already enforces this for emitted
  // StrongEmphasis nodes, but pinning it here keeps the contract
  // explicit and survives future parser drift.
  if (head !== tail) return null;
  return {
    from: node.from,
    to: node.to,
    openEnd: node.from + len,
    closeStart: node.to - len,
  };
}

function lineActiveFor(state: EditorState, nodeFrom: number, nodeTo: number): boolean {
  if (!hasActiveLine(state)) return false;
  const active = getActiveLineRange(state);
  return !(nodeTo < active.from || nodeFrom > active.to);
}

function isInsideCodeIsland(node: SyntaxNode): boolean {
  let p: SyntaxNode | null = node.parent;
  while (p) {
    if (CODE_ISLAND_NODE_NAMES.has(p.name)) return true;
    p = p.parent;
  }
  return false;
}

/**
 * Combined gate. Returns true only when the inline mark's markers
 * would actually be hidden by emphasis.ts in the current render:
 *
 *   - Markdown (Source) mode strips liveDecorations entirely, so
 *     emphasis.ts does not run and `**` markers are visible. Atomic
 *     ranges installed from the syntax tree alone would freeze caret
 *     motion across raw markdown — wrong.
 *   - Typora (Live) mode hides markers only on inactive lines.
 *   - WYSIWYG (Document) mode hides on every line.
 */
function shouldApplyAtomic(state: EditorState, lineActive: boolean): boolean {
  if (currentEditMode(state) === 'markdown') return false;
  return shouldHideMarker(state, lineActive);
}

function buildAtomicRanges(view: EditorView): ReturnType<RangeSetBuilder<Decoration>['finish']> {
  const builder = new RangeSetBuilder<Decoration>();
  const state = view.state;
  const doc = state.doc.toString();
  for (const range of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: range.from,
      to: range.to,
      enter(node: SyntaxNodeRef) {
        const spec = INLINE_MARK_SPECS.find((s) => s.nodeName === node.name);
        if (!spec) return;
        if (isInsideCodeIsland(node.node)) return;
        const bounds = inlineMarkBounds(node.node, spec, doc);
        if (!bounds) return;
        const active = lineActiveFor(state, bounds.from, bounds.to);
        if (!shouldApplyAtomic(state, active)) return;
        builder.add(bounds.from, bounds.openEnd, Decoration.mark({}));
        builder.add(bounds.closeStart, bounds.to, Decoration.mark({}));
      },
    });
  }
  return builder.finish();
}

interface InlineMarkTarget {
  from: number;
  to: number;
}

function findInlineMarkAtEdge(
  state: EditorState,
  pos: number,
  direction: 'backward' | 'forward',
): InlineMarkTarget | null {
  const doc = state.doc.toString();
  let result: InlineMarkTarget | null = null;
  syntaxTree(state).iterate({
    from: Math.max(0, pos - 1),
    to: Math.min(state.doc.length, pos + 1),
    enter(node: SyntaxNodeRef) {
      if (result) return false;
      const spec = INLINE_MARK_SPECS.find((s) => s.nodeName === node.name);
      if (!spec) return;
      if (isInsideCodeIsland(node.node)) return;
      const bounds = inlineMarkBounds(node.node, spec, doc);
      if (!bounds) return;
      const active = lineActiveFor(state, bounds.from, bounds.to);
      if (!shouldApplyAtomic(state, active)) return;
      if (direction === 'backward') {
        if (pos === bounds.to || pos === bounds.closeStart || pos === bounds.openEnd) {
          result = { from: bounds.from, to: bounds.to };
        }
      } else if (direction === 'forward') {
        if (pos === bounds.from || pos === bounds.closeStart) {
          result = { from: bounds.from, to: bounds.to };
        }
      }
      return undefined;
    },
  });
  return result;
}

function deleteInlineMarkBackward(view: EditorView): boolean {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  const target = findInlineMarkAtEdge(view.state, sel.head, 'backward');
  if (!target) return false;
  view.dispatch({
    changes: { from: target.from, to: target.to },
    selection: { anchor: target.from },
    userEvent: 'delete.backward',
  });
  return true;
}

function deleteInlineMarkForward(view: EditorView): boolean {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  const target = findInlineMarkAtEdge(view.state, sel.head, 'forward');
  if (!target) return false;
  view.dispatch({
    changes: { from: target.from, to: target.to },
    selection: { anchor: target.from },
    userEvent: 'delete.forward',
  });
  return true;
}

export function atomicInlineMarksExtension(): Extension {
  return [
    EditorView.atomicRanges.of(buildAtomicRanges),
    Prec.high(
      keymap.of([
        { key: 'Backspace', run: deleteInlineMarkBackward },
        { key: 'Delete', run: deleteInlineMarkForward },
      ]),
    ),
  ];
}

export const __test = { findInlineMarkAtEdge, inlineMarkBounds };
