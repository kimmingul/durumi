import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { decorationPlugin } from './framework';
import { getActiveLineRange, hasActiveLine, shouldHideMarker } from './activeLine';

/**
 * Visualizes Markdown hard line breaks — two trailing spaces OR a trailing
 * backslash at the end of a line — as a faint `↵` glyph. The lezer parser
 * emits a `HardBreak` node spanning either marker; we replace the marker
 * itself (so the trailing whitespace doesn't take up real visual space) when
 * the caret is off the line, and otherwise show the source as-is so the user
 * can see what they typed.
 */
class HardBreakWidget extends WidgetType {
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-md-hardbreak';
    s.textContent = '↵';
    return s;
  }
  ignoreEvent() { return true; }
}

export function lineBreakDecoration(): Extension {
  return decorationPlugin({
    nodes: ['HardBreak'],
    visit(builder, { from, to, view }) {
      const state = view.state;
      // The lezer HardBreak node range includes the trailing newline, so its
      // `to` lands on the start of the next line. The shared `lineActive`
      // helper would treat that boundary as "touching" the next line — which
      // means the marker stays visible whenever the caret is on the line
      // *below*. Compute activity by line number instead, off the marker's
      // start position.
      const markerLine = state.doc.lineAt(from).number;
      const lineActive = hasActiveLine(state) && getActiveLineRange(state).number === markerLine;
      if (!shouldHideMarker(state, lineActive)) return;
      // ViewPlugin decorations may not span line breaks, so clamp to the end
      // of the marker's own line — we only replace the visible marker
      // (trailing spaces or backslash), never the newline itself.
      const lineEnd = state.doc.lineAt(from).to;
      const clamped = Math.min(to, lineEnd);
      if (clamped <= from) return;
      builder.add(from, clamped, Decoration.replace({ widget: new HardBreakWidget() }));
    },
  });
}

export const lineBreakTheme = EditorView.theme({
  '.cm-md-hardbreak': {
    opacity: '0.5',
    fontSize: '0.85em',
    marginLeft: '2px',
  },
});
