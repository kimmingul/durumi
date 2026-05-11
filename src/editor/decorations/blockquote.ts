import { Decoration } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { decorationPlugin } from './framework';
import { getActiveLineRange, hasActiveLine, shouldHideMarker } from './activeLine';
import { HiddenMarkerWidget } from './heading';

/**
 * Match leading blockquote markers on a line. Captures:
 *   1. Optional leading whitespace (for nested or indented blockquotes).
 *   2. One or more `>` characters (covers `>`, `>>`, `>>>` …).
 *   3. Required trailing space or tab — only when there is content after.
 *
 * Lines that are JUST `>` (or `> ` with nothing after) are intentionally not
 * matched, so the user always sees what they're typing on an empty quote line.
 */
const BLOCKQUOTE_MARKER_RE = /^([ \t]*)(>+)([ \t])(?=\S)/;

export function blockquoteDecoration(): Extension {
  return decorationPlugin({
    nodes: ['Blockquote'],
    visit(builder, { from, to, view, node }) {
      // Lezer-markdown nests Blockquote inside Blockquote for `>>` etc.
      // Only act on the outermost wrapper; the regex below already eats all
      // leading `>` markers as a single replacement.
      if (isNestedBlockquote(node)) return;
      const state = view.state;
      const start = state.doc.lineAt(from).number;
      const end = state.doc.lineAt(to).number;
      // The framework's `lineActive` flag is computed for the whole node range
      // (entire Blockquote block), so we can't trust it for per-line decisions
      // about marker visibility. Re-derive per line — and route through
      // `shouldHideMarker` so WYSIWYG mode hides on every line uniformly.
      const userActive = hasActiveLine(state);
      const activeLineNumber = userActive ? getActiveLineRange(state).number : -1;
      for (let n = start; n <= end; n++) {
        const line = state.doc.line(n);
        builder.add(line.from, line.from, Decoration.line({ class: 'cm-md-blockquote' }));
        if (!shouldHideMarker(state, n === activeLineNumber)) continue;
        const match = BLOCKQUOTE_MARKER_RE.exec(line.text);
        if (!match) continue;
        const replaceFrom = line.from + match[1].length;
        const replaceTo = replaceFrom + match[2].length + match[3].length;
        builder.add(
          replaceFrom,
          replaceTo,
          Decoration.replace({ widget: new HiddenMarkerWidget() }),
        );
      }
    },
  });
}

function isNestedBlockquote(node: { node: { parent: unknown } }): boolean {
  let p = (node.node as { parent: { name: string; parent: unknown } | null }).parent;
  while (p) {
    if (p.name === 'Blockquote') return true;
    p = (p as { parent: { name: string; parent: unknown } | null }).parent as typeof p;
  }
  return false;
}
