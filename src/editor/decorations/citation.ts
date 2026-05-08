import { syntaxTree } from '@codemirror/language';
import { EditorState, Extension, Range, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { hasActiveLine, userActiveField } from './activeLine';

/**
 * Renders citation spans as compact superscript markers when the caret is not
 * inside them, so a paragraph reads naturally. While the caret is on the
 * citation line, the source `[@key]` form is shown intact for editing.
 *
 * The numbering shown in the widget is derived from the document order of
 * citations: the first time a key appears it gets `1`, the next new key gets
 * `2`, and so on. This mirrors what the export pipeline produces, so the
 * preview and the rendered HTML agree.
 */
class CitationWidget extends WidgetType {
  constructor(private readonly numbers: string[]) {
    super();
  }
  toDOM() {
    const sup = document.createElement('sup');
    sup.className = 'cm-md-citation';
    sup.textContent = `[${this.numbers.join(',')}]`;
    return sup;
  }
  eq(other: WidgetType) {
    return (
      other instanceof CitationWidget &&
      other.numbers.length === this.numbers.length &&
      other.numbers.every((n, i) => n === this.numbers[i])
    );
  }
  ignoreEvent() {
    return false;
  }
}

interface CitationSpan {
  from: number;
  to: number;
  keys: string[];
}

function collectSpans(state: EditorState): CitationSpan[] {
  const spans: CitationSpan[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'Citation') return;
      const from = node.from;
      const to = node.to;
      const keys: string[] = [];
      let child = node.node.firstChild;
      while (child) {
        if (child.name === 'CitationKey') {
          keys.push(state.doc.sliceString(child.from, child.to));
        }
        child = child.nextSibling;
      }
      spans.push({ from, to, keys });
    },
  });
  return spans;
}

function buildDecorations(state: EditorState): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const sel = state.selection.main;
  const active = hasActiveLine(state);
  const spans = collectSpans(state);
  const numbers = new Map<string, number>();
  let next = 1;
  for (const span of spans) {
    const ns: string[] = [];
    for (const k of span.keys) {
      let n = numbers.get(k);
      if (n === undefined) {
        n = next++;
        numbers.set(k, n);
      }
      ns.push(String(n));
    }
    const cursorTouches = active && sel.from <= span.to && sel.to >= span.from;
    if (cursorTouches) continue;
    decos.push(Decoration.replace({ widget: new CitationWidget(ns) }).range(span.from, span.to));
  }
  return Decoration.set(decos, true);
}

const citationField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged || tr.selection) return buildDecorations(tr.state);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function citationDecoration(): Extension {
  return [userActiveField, citationField];
}

export const citationTheme = EditorView.theme({
  '.cm-md-citation': {
    fontSize: '0.78em',
    verticalAlign: 'super',
    padding: '0 2px',
    margin: '0 1px',
    color: 'var(--cm-link, #0a66c2)',
    background: 'var(--cm-citation-bg, rgba(10, 102, 194, 0.08))',
    borderRadius: '3px',
    cursor: 'pointer',
  },
  '.cm-md-citation:hover': {
    background: 'var(--cm-citation-bg-hover, rgba(10, 102, 194, 0.18))',
  },
});
