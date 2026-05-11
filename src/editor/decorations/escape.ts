import { Decoration, WidgetType } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { decorationPlugin } from './framework';
import { shouldHideMarker } from './activeLine';

/**
 * lezer-markdown emits an `Escape` node for `\X` sequences (the two characters
 * `\*`, `\_`, `\\`, etc.). Without a decoration the leading backslash stays
 * visible in the rendered view, so a user typing `\*literal\*` sees the slashes
 * even when they are off the line.
 *
 * - Typora mode: hide `\` only on inactive lines (matches the rest of the
 *   active-line invariant).
 * - WYSIWYG mode: hide `\` on every line so the user sees a uniformly clean
 *   rendering — this is what makes the v0.1.12 escape filter end-to-end
 *   round-trip work (filter writes `\X`, escape decoration hides the `\`).
 */
class HiddenWidget extends WidgetType {
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-md-marker-hidden';
    return s;
  }
  ignoreEvent() { return true; }
}

export function escapeDecoration(): Extension {
  return decorationPlugin({
    nodes: ['Escape'],
    visit(builder, { from, to, lineActive, view }) {
      if (!shouldHideMarker(view.state, lineActive)) return;
      if (to - from < 2) return;
      builder.add(from, from + 1, Decoration.replace({ widget: new HiddenWidget() }));
    },
  });
}
