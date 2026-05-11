import { Decoration, WidgetType } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { SyntaxNodeRef } from '@lezer/common';
import { decorationPlugin } from './framework';
import { isWysiwygMode } from '../editMode';
import { shouldHideMarker } from './activeLine';

/**
 * Walk the `Link` node's children for a `URL` — i.e. the URL part of a
 * real `[label](url)` inline link. Tentative shortcut links like
 * `[Your Department]` parse as Link too but lack a URL child; in WYSIWYG
 * mode we suppress the `cm-md-link` styling on those so the brackets and
 * label render as plain literal text (matching the v0.1.12 strict-literal
 * intent — only deliberate `[label](url)` constructs look like links).
 */
function linkHasUrl(node: SyntaxNodeRef): boolean {
  let cur = node.node.firstChild;
  while (cur) {
    if (cur.name === 'URL') return true;
    cur = cur.nextSibling;
  }
  return false;
}

/**
 * Renders Markdown link syntax in three flavors:
 *   - inline   `[text](url)` / `[text](url "title")`
 *   - reference `[text][id]`
 *   - shortcut `[id]`           (when a `[id]: url` definition exists)
 *
 * We walk the lezer `Link` node's children to find the leading `[` and the
 * matching `]` that closes the visible label, then collapse everything outside
 * the label into hidden markers when the caret is off the line. Going through
 * the parser (instead of regex on the raw text) is what makes escaped
 * brackets `\]` and reference forms work correctly — lezer-markdown emits an
 * `Escape` node for the former so a stray `]` inside the label never confuses
 * the bracket finder.
 */
class HiddenMarkerWidget extends WidgetType {
  toDOM() { const s = document.createElement('span'); s.className = 'cm-md-marker-hidden'; return s; }
  ignoreEvent() { return true; }
}

interface LinkBounds {
  openBracket: number;
  closeBracket: number;
}

function findLabelBrackets(node: SyntaxNodeRef, doc: string): LinkBounds | null {
  // First two LinkMark children of the Link node are `[` and the matching `]`.
  // Children that are LinkMark with content other than `[`/`]` (e.g. `(`, `)`,
  // `:`) only appear AFTER the closing `]`, so a left-to-right scan is safe.
  let openBracket: number | null = null;
  let cur = node.node.firstChild;
  while (cur) {
    if (cur.name === 'LinkMark') {
      const ch = doc[cur.from];
      if (openBracket === null) {
        if (ch === '[') openBracket = cur.from;
      } else if (ch === ']') {
        return { openBracket, closeBracket: cur.from };
      }
    }
    cur = cur.nextSibling;
  }
  return null;
}

export function linkDecoration(): Extension {
  return decorationPlugin({
    nodes: ['Link'],
    visit(builder, { from, to, lineActive, doc, node, view }) {
      const bounds = findLabelBrackets(node, doc);
      if (!bounds) return;
      const { openBracket, closeBracket } = bounds;
      const textFrom = openBracket + 1;
      const textTo = closeBracket;
      const hide = shouldHideMarker(view.state, lineActive);
      if (hide) {
        if (openBracket > from) {
          builder.add(from, openBracket, Decoration.replace({ widget: new HiddenMarkerWidget() }));
        }
        builder.add(openBracket, textFrom, Decoration.replace({ widget: new HiddenMarkerWidget() }));
      }
      if (textTo > textFrom) {
        // v0.1.12 — suppress link styling in WYSIWYG mode unless this is
        // a real `[label](url)`. Tentative shortcut `[Text]` constructs
        // (no URL child) should look like plain literal text. Real
        // inline links keep their Word-style colour + underline.
        const wysiwyg = isWysiwygMode(view.state);
        if (!wysiwyg || linkHasUrl(node)) {
          builder.add(textFrom, textTo, Decoration.mark({ class: 'cm-md-link' }));
        }
      }
      if (hide && to > closeBracket) {
        builder.add(closeBracket, to, Decoration.replace({ widget: new HiddenMarkerWidget() }));
      }
    },
  });
}

/**
 * Reference definitions (`[id]: url "optional title"`) are normally on their
 * own line and the user usually wants to see them. We only apply a soft mark
 * so they stand out a little, without hiding the source.
 */
export function linkReferenceDecoration(): Extension {
  return decorationPlugin({
    nodes: ['LinkReference'],
    visit(builder, { from, to }) {
      builder.add(from, to, Decoration.mark({ class: 'cm-md-link-ref' }));
    },
  });
}
