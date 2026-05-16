import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { SyntaxNodeRef } from '@lezer/common';
import { decorationPlugin } from './framework';
import { shouldHideMarker } from './activeLine';
import { setEditMode } from '../editMode';

const HEADING_NODES = [
  'ATXHeading1', 'ATXHeading2', 'ATXHeading3',
  'ATXHeading4', 'ATXHeading5', 'ATXHeading6',
  // Setext (`===` / `---` underline) form. Less common in modern files but
  // still part of the CommonMark spec and Typora's reference.
  'SetextHeading1', 'SetextHeading2',
];
const LEVEL: Record<string, number> = {
  ATXHeading1: 1, ATXHeading2: 2, ATXHeading3: 3,
  ATXHeading4: 4, ATXHeading5: 5, ATXHeading6: 6,
  SetextHeading1: 1, SetextHeading2: 2,
};

export class HiddenMarkerWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-md-marker-hidden';
    return span;
  }
  ignoreEvent() { return true; }
}

/** Find the `HeaderMark` child of a SetextHeading node — the underline run. */
function findSetextUnderlineRange(node: SyntaxNodeRef): { from: number; to: number } | null {
  let cur = node.node.firstChild;
  while (cur) {
    if (cur.name === 'HeaderMark') return { from: cur.from, to: cur.to };
    cur = cur.nextSibling;
  }
  return null;
}

export function headingDecoration(): Extension {
  return decorationPlugin({
    nodes: HEADING_NODES,
    // Mode-only transactions (e.g. flipping Document <-> Live via the menu
    // with no doc/selection change) must still rebuild so the Setext under-
    // line hide updates immediately. Mirrors the v0.2.8 setEditMode listener
    // pattern from citation.ts / htmlInline.ts / criticMarkup.ts etc.
    rebuildOn: [setEditMode],
    visit(builder, { from, to, nodeName, lineActive, doc, node, view }) {
      const level = LEVEL[nodeName] ?? 1;
      const isSetext = nodeName.startsWith('Setext');
      if (nodeName.startsWith('ATX')) {
        const markerLen = level + 1;
        const head = doc.slice(from, from + markerLen);
        const shouldHide = shouldHideMarker(view.state, lineActive) && /^#+ $/.test(head);
        if (shouldHide) {
          builder.add(
            from,
            from + markerLen,
            Decoration.replace({ widget: new HiddenMarkerWidget() }),
          );
        }
      }
      // Heading-text mark (applies to both ATX and Setext, spans the full
      // node — for Setext that includes the underline run, which CSS scopes
      // appropriately). Added BEFORE Setext line/replace to preserve the
      // RangeSetBuilder `from`-ascending invariant — `from` (0) precedes
      // the underline line's start.
      builder.add(from, to, Decoration.mark({ class: `cm-md-h${level}` }));
      // Setext underline collapse.
      // The lezer-markdown parser already disambiguates Setext-vs-HR at
      // parse time: a `---` standing alone after a blank line is a
      // `HorizontalRule` node, NOT `SetextHeading2`. So if we got here,
      // the underline we hide belongs to a confirmed heading and the HR
      // rendering path is unaffected (verified by
      // `tests/editor/setextHeading.test.ts`).
      if (isSetext && shouldHideMarker(view.state, lineActive)) {
        const underline = findSetextUnderlineRange(node);
        if (underline) {
          const underlineLine = view.state.doc.lineAt(underline.from);
          // Two decorations cooperate to collapse the underline line:
          //   1) Decoration.line tagging the line wrapper for CSS
          //      `display:none` so the line takes no visual space; and
          //   2) Decoration.replace over the `=========` run so the
          //      underline characters are absent from any rendered
          //      fallback (also keeps copy-from-DOM clean).
          builder.add(
            underlineLine.from,
            underlineLine.from,
            Decoration.line({ class: 'cm-md-setext-underline-hidden' }),
          );
          builder.add(
            underline.from,
            underline.to,
            Decoration.replace({ widget: new HiddenMarkerWidget() }),
          );
        }
      }
    },
  });
}

export const setextHeadingTheme = EditorView.theme({
  // Collapse the underline line entirely when the heading is rendered as a
  // single styled line. The line is still part of the document — caret can
  // arrow into it, which flips `lineActive` true and re-shows the source.
  '.cm-md-setext-underline-hidden': {
    display: 'none',
  },
});
