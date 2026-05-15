import { syntaxTree } from '@codemirror/language';
import { EditorState, Extension, Range, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import {
  getActiveLineRange,
  hasActiveLine,
  shouldHideMarker,
  userActiveField,
} from './activeLine';
import { setEditMode } from '../editMode';

/**
 * Renders Typora-style inline marks `==highlight==`, `~subscript~`, and
 * `^superscript^` (parsed by `inlineExtras.ts`) the same way the export
 * pipeline does — so a paragraph reads naturally in live preview instead
 * of as raw `=`/`~`/`^` source. While the caret is on the containing
 * line in Typora mode the source stays visible for editing; WYSIWYG mode
 * collapses markers everywhere.
 *
 * Reuses the `.cm-md-html-{mark,sub,sup}` classes from `htmlInline.ts`
 * so `==hi==` / `<mark>hi</mark>` / `H~2~O` / `H<sub>2</sub>O` look
 * identical in the editor. No new theme is needed.
 */
class HiddenWidget extends WidgetType {
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-md-marker-hidden';
    return s;
  }
  ignoreEvent() {
    return true;
  }
}

interface MarkSpec {
  parent: string;
  mark: string;
  cls: string;
}

const SPECS: MarkSpec[] = [
  { parent: 'Highlight', mark: 'HighlightMark', cls: 'cm-md-html-mark' },
  { parent: 'Subscript', mark: 'SubscriptMark', cls: 'cm-md-html-sub' },
  { parent: 'Superscript', mark: 'SuperscriptMark', cls: 'cm-md-html-sup' },
];

const SPEC_BY_PARENT = new Map<string, MarkSpec>(SPECS.map((s) => [s.parent, s]));

function rangeTouchesActiveLine(state: EditorState, from: number, to: number): boolean {
  if (!hasActiveLine(state)) return false;
  const a = getActiveLineRange(state);
  return !(to < a.from || from > a.to);
}

function buildDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      const spec = SPEC_BY_PARENT.get(node.name);
      if (!spec) return;
      let openFrom = -1;
      let openTo = -1;
      let closeFrom = -1;
      let closeTo = -1;
      let child = node.node.firstChild;
      while (child) {
        if (child.name === spec.mark) {
          if (openFrom === -1) {
            openFrom = child.from;
            openTo = child.to;
          } else {
            closeFrom = child.from;
            closeTo = child.to;
          }
        }
        child = child.nextSibling;
      }
      if (openFrom === -1 || closeFrom === -1) return;
      const active = rangeTouchesActiveLine(state, node.from, node.to);
      const hide = shouldHideMarker(state, active);
      if (hide) {
        ranges.push(
          Decoration.replace({ widget: new HiddenWidget() }).range(openFrom, openTo),
        );
      }
      if (openTo < closeFrom) {
        ranges.push(Decoration.mark({ class: spec.cls }).range(openTo, closeFrom));
      }
      if (hide) {
        ranges.push(
          Decoration.replace({ widget: new HiddenWidget() }).range(closeFrom, closeTo),
        );
      }
    },
  });
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(ranges, true);
}

const highlightField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(value, tr) {
    let rebuild = tr.docChanged || tr.selection;
    if (!rebuild) {
      for (const e of tr.effects) {
        if (e.is(setEditMode)) {
          rebuild = true;
          break;
        }
      }
    }
    if (rebuild) return buildDecorations(tr.state);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function highlightExtras(): Extension {
  return [userActiveField, highlightField];
}
