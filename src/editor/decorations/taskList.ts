import { syntaxTree } from '@codemirror/language';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { Extension, RangeSetBuilder } from '@codemirror/state';
import { getActiveLineRange } from './activeLine';

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly from: number, readonly to: number) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.from === this.from && other.to === this.to;
  }
  toDOM(view: EditorView) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'cm-task-checkbox';
    input.checked = this.checked;
    input.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      const next = this.checked ? '[ ]' : '[x]';
      view.dispatch({ changes: { from: this.from, to: this.to, insert: next } });
    });
    return input;
  }
  ignoreEvent() {
    return false;
  }
}

export function taskListDecoration(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.selectionSet) {
          this.decorations = build(u.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const active = getActiveLineRange(view.state);
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'TaskMarker') return;
        const text = view.state.sliceDoc(node.from, node.to);
        if (text !== '[ ]' && text !== '[x]') return;
        const lineStart = view.state.doc.lineAt(node.from).from;
        const lineEnd = view.state.doc.lineAt(node.to).to;
        const lineActive = !(lineEnd < active.from || lineStart > active.to);
        if (lineActive) return;
        const checked = text === '[x]';
        builder.add(
          node.from,
          node.to,
          Decoration.replace({ widget: new CheckboxWidget(checked, node.from, node.to) }),
        );
      },
    });
  }
  return builder.finish();
}
