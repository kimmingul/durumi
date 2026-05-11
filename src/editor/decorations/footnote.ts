import { syntaxTree } from '@codemirror/language';
import { EditorState, Extension, Range, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { hasActiveLine, userActiveField } from './activeLine';
import { isWysiwygMode } from '../editMode';

/**
 * Renders footnote references and definitions in live preview:
 *   - `[^id]` becomes a small superscript label, hidden source markers when
 *     the caret is elsewhere.
 *   - `[^id]: …` definition line gets a subtle left border and the leading
 *     `[^id]:` is dimmed when the caret is elsewhere.
 *
 * Click on the rendered superscript jumps the editor to the matching
 * definition (and vice versa).
 */

class FootnoteRefWidget extends WidgetType {
  constructor(private readonly label: string) {
    super();
  }
  toDOM() {
    const sup = document.createElement('sup');
    sup.className = 'cm-md-footnote-ref';
    sup.textContent = this.label;
    sup.dataset.footnoteLabel = this.label;
    sup.title = `Footnote: ${this.label}`;
    return sup;
  }
  eq(other: WidgetType) {
    return other instanceof FootnoteRefWidget && other.label === this.label;
  }
  ignoreEvent() {
    return false;
  }
}

interface FootnoteSpan {
  from: number;
  to: number;
  label: string;
  /** position of the label start in the source (for hidden marker calc) */
  labelFrom: number;
  labelTo: number;
}

function collectFootnotes(state: EditorState): {
  refs: FootnoteSpan[];
  defs: FootnoteSpan[];
} {
  const refs: FootnoteSpan[] = [];
  const defs: FootnoteSpan[] = [];
  const tree = syntaxTree(state);
  tree.iterate({
    enter(node) {
      if (node.name === 'FootnoteRef' || node.name === 'FootnoteDef') {
        const from = node.from;
        const to = node.to;
        let labelFrom = from;
        let labelTo = to;
        let labelText = '';
        const child = node.node.firstChild;
        // children: FootnoteMark, FootnoteLabel, FootnoteMark
        let cur = child;
        while (cur) {
          if (cur.name === 'FootnoteLabel') {
            labelFrom = cur.from;
            labelTo = cur.to;
            labelText = state.doc.sliceString(cur.from, cur.to);
            break;
          }
          cur = cur.nextSibling;
        }
        const span = { from, to, label: labelText, labelFrom, labelTo };
        if (node.name === 'FootnoteRef') refs.push(span);
        else defs.push(span);
      }
    },
  });
  return { refs, defs };
}

function buildDecorations(state: EditorState): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const sel = state.selection.main;
  const active = hasActiveLine(state);
  const wysiwyg = isWysiwygMode(state);
  const { refs, defs } = collectFootnotes(state);

  for (const ref of refs) {
    const cursorTouches = active && sel.from <= ref.to && sel.to >= ref.from;
    if (cursorTouches && !wysiwyg) continue;
    decos.push(
      Decoration.replace({
        widget: new FootnoteRefWidget(ref.label),
      }).range(ref.from, ref.to),
    );
  }

  for (const def of defs) {
    const startLine = state.doc.lineAt(def.from);
    decos.push(Decoration.line({ class: 'cm-md-footnote-def-line' }).range(startLine.from));
    const cursorOnLine = active && sel.from >= startLine.from && sel.from <= startLine.to;
    if (!cursorOnLine || wysiwyg) {
      // Hide the [^id]: prefix; show only " text…"
      const colonEnd = def.labelTo + 2; // `]:` after label
      decos.push(
        Decoration.replace({
          widget: new FootnoteDefMarkerWidget(def.label),
        }).range(def.from, colonEnd),
      );
    }
  }

  return Decoration.set(decos, true);
}

class FootnoteDefMarkerWidget extends WidgetType {
  constructor(private readonly label: string) {
    super();
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-md-footnote-def-marker';
    span.textContent = `[${this.label}]`;
    return span;
  }
  eq(other: WidgetType) {
    return other instanceof FootnoteDefMarkerWidget && other.label === this.label;
  }
  ignoreEvent() {
    return true;
  }
}

const footnoteField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged || tr.selection) return buildDecorations(tr.state);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const footnoteJumpHandler = EditorView.domEventHandlers({
  click(event, view) {
    const target = event.target as HTMLElement | null;
    if (!target) return false;
    const refSup = target.closest<HTMLElement>('.cm-md-footnote-ref');
    if (!refSup) return false;
    const label = refSup.dataset.footnoteLabel;
    if (!label) return false;
    const { defs } = collectFootnotes(view.state);
    const def = defs.find((d) => d.label === label);
    if (!def) return false;
    view.dispatch({
      selection: { anchor: def.from },
      effects: EditorView.scrollIntoView(def.from, { y: 'center' }),
    });
    view.focus();
    return true;
  },
});

export function footnoteDecoration(): Extension {
  return [userActiveField, footnoteField, footnoteJumpHandler];
}

export const footnoteTheme = EditorView.theme({
  '.cm-md-footnote-ref': {
    fontSize: '0.75em',
    verticalAlign: 'super',
    color: 'var(--cm-link, #0a66c2)',
    cursor: 'pointer',
    padding: '0 2px',
    borderRadius: '3px',
    background: 'var(--cm-footnote-ref-bg, rgba(10, 102, 194, 0.08))',
  },
  '.cm-md-footnote-ref:hover': {
    background: 'var(--cm-footnote-ref-bg-hover, rgba(10, 102, 194, 0.18))',
  },
  '.cm-md-footnote-def-line': {
    borderLeft: '3px solid var(--cm-accent, #6c7a89)',
    paddingLeft: '8px',
    background: 'var(--cm-footnote-def-bg, rgba(108, 122, 137, 0.04))',
  },
  '.cm-md-footnote-def-marker': {
    color: 'var(--cm-link, #0a66c2)',
    fontWeight: 600,
    marginRight: '4px',
  },
});
