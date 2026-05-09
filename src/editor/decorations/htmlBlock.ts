import { Decoration, EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { decorationPlugin } from './framework';

/**
 * Styles raw HTML blocks (`<div>…</div>`, `<table>`, etc.) and HTML comments
 * (`<!-- … -->`) so they're visually distinguishable from regular Markdown
 * source in the live editor. We don't try to actually render the HTML inline —
 * that's the job of the export pipeline. Here we just mark the source so it
 * looks like the technical block it is, and dim comments since they don't
 * contribute to the rendered document.
 *
 * Lezer-markdown emits a `HTMLBlock` for any block-level raw HTML run and a
 * `CommentBlock` for `<!-- … -->`. Single-line block HTML still produces these
 * nodes, so the decoration covers both shapes.
 */
export function htmlBlockDecoration(): Extension {
  return decorationPlugin({
    nodes: ['HTMLBlock', 'CommentBlock'],
    visit(builder, { from, to, nodeName }) {
      const cls = nodeName === 'CommentBlock' ? 'cm-md-html-comment' : 'cm-md-html-block';
      builder.add(from, to, Decoration.mark({ class: cls }));
    },
  });
}

export const htmlBlockTheme = EditorView.theme({
  '.cm-md-html-block': {
    fontFamily: 'var(--cm-mono, monospace)',
    fontSize: '0.92em',
    background: 'rgba(127,127,127,0.06)',
    borderRadius: '3px',
  },
  '.cm-md-html-comment': {
    opacity: '0.55',
    fontStyle: 'italic',
  },
});
