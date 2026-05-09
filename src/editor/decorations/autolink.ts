import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { SyntaxNodeRef } from '@lezer/common';
import { decorationPlugin } from './framework';

/**
 * Renders three URL-bearing constructs the editor previously left as raw text:
 *   - `<https://…>` autolinks (lezer `Autolink`)
 *   - bare URLs inside paragraph text that the GFM parser linkifies (`URL`
 *     nodes whose parent is a Paragraph rather than a Link/LinkReference)
 *
 * For autolinks we hide the angle-bracket markers when the line is inactive,
 * so the URL reads like a clickable link in live preview but the source stays
 * editable when the caret is on it. Bare URLs only get a styling mark — the
 * source is the same as the rendered output, no marker hiding needed.
 */
class HiddenMarkerWidget extends WidgetType {
  toDOM() { const s = document.createElement('span'); s.className = 'cm-md-marker-hidden'; return s; }
  ignoreEvent() { return true; }
}

const URL_PARENT_HOSTS = new Set(['Autolink', 'Link', 'LinkReference', 'Image']);

function isWrappedUrl(node: SyntaxNodeRef): boolean {
  const parent = node.node.parent;
  if (!parent) return false;
  return URL_PARENT_HOSTS.has(parent.name);
}

export function autolinkDecoration(): Extension {
  return decorationPlugin({
    nodes: ['Autolink', 'URL'],
    visit(builder, { from, to, lineActive, nodeName, node }) {
      if (nodeName === 'URL') {
        // Only top-level (linkified bare) URLs — children of Autolink/Link/etc.
        // are decorated by the parent's visitor.
        if (isWrappedUrl(node)) return;
        builder.add(from, to, Decoration.mark({ class: 'cm-md-autolink' }));
        return;
      }
      // Autolink: `<URL>` — three children: LinkMark `<`, URL, LinkMark `>`.
      const open = from;       // position of `<`
      const close = to - 1;    // position of `>`
      const inner = { from: open + 1, to: close };
      if (!lineActive) {
        builder.add(open, inner.from, Decoration.replace({ widget: new HiddenMarkerWidget() }));
      }
      if (inner.to > inner.from) {
        builder.add(inner.from, inner.to, Decoration.mark({ class: 'cm-md-autolink' }));
      }
      if (!lineActive) {
        builder.add(inner.to, to, Decoration.replace({ widget: new HiddenMarkerWidget() }));
      }
    },
  });
}

export const autolinkTheme = EditorView.theme({
  '.cm-md-autolink': {
    color: 'var(--cm-link, #0a66c2)',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
});
