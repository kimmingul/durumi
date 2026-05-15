import { syntaxTree } from '@codemirror/language';
import { EditorState, Extension, Range, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { getActiveLineRange, hasActiveLine, shouldHideMarker, userActiveField } from './activeLine';
import { setEditMode } from '../editMode';

/**
 * Renders raw inline HTML tags that have an obvious visual semantic
 * (`<sub>`, `<sup>`, `<mark>`, `<kbd>`, `<u>`) the same way the export pipeline
 * does, so a paragraph like `H<sub>2</sub>O` reads naturally in live preview
 * instead of as the literal angle-bracket source. While the caret is on the
 * containing line we leave the source visible for editing.
 *
 * Lezer-markdown emits each `<…>` as an `HTMLTag` inline node. We pair opens
 * with closes via a per-tag-name stack — paragraph-bound, but we don't need
 * stricter scoping because mismatched HTML inside a single paragraph is
 * already malformed and the parser will surface it to the user.
 */
class HiddenWidget extends WidgetType {
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-md-marker-hidden';
    return s;
  }
  ignoreEvent() { return true; }
}

const STYLED_TAGS = new Set(['sub', 'sup', 'mark', 'kbd', 'u']);
const TAG_RE = /^<\/?([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?\s*\/?>$/;

interface TagInstance {
  from: number;
  to: number;
  name: string;
  isClose: boolean;
}

function parseTag(text: string): { name: string; isClose: boolean } | null {
  const m = text.match(TAG_RE);
  if (!m) return null;
  return { name: (m[1] ?? '').toLowerCase(), isClose: text.startsWith('</') };
}

function rangeTouchesActiveLine(state: EditorState, from: number, to: number): boolean {
  if (!hasActiveLine(state)) return false;
  const a = getActiveLineRange(state);
  return !(to < a.from || from > a.to);
}

function buildDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const doc = state.doc;
  const tags: TagInstance[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'HTMLTag') return;
      const text = doc.sliceString(node.from, node.to);
      const parsed = parseTag(text);
      if (!parsed || !STYLED_TAGS.has(parsed.name)) return;
      tags.push({ from: node.from, to: node.to, ...parsed });
    },
  });

  // Stack-match within document order. Misnested tags simply fail to pair and
  // are left untouched, which is the safest behavior for malformed input.
  const stacks = new Map<string, TagInstance[]>();
  const pairs: Array<{ open: TagInstance; close: TagInstance }> = [];
  for (const tag of tags) {
    if (!tag.isClose) {
      const arr = stacks.get(tag.name) ?? [];
      arr.push(tag);
      stacks.set(tag.name, arr);
    } else {
      const arr = stacks.get(tag.name);
      const open = arr?.pop();
      if (open) pairs.push({ open, close: tag });
    }
  }

  for (const { open, close } of pairs) {
    if (open.to > close.from) continue;
    const cls = `cm-md-html-${open.name}`;
    const active = rangeTouchesActiveLine(state, open.from, close.to);
    const hide = shouldHideMarker(state, active);
    if (hide) {
      ranges.push(Decoration.replace({ widget: new HiddenWidget() }).range(open.from, open.to));
    }
    if (open.to < close.from) {
      ranges.push(Decoration.mark({ class: cls }).range(open.to, close.from));
    }
    if (hide) {
      ranges.push(Decoration.replace({ widget: new HiddenWidget() }).range(close.from, close.to));
    }
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(ranges, true);
}

const htmlInlineField = StateField.define<DecorationSet>({
  create(state) { return buildDecorations(state); },
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

export function htmlInlineDecoration(): Extension {
  return [userActiveField, htmlInlineField];
}

export const htmlInlineTheme = EditorView.theme({
  '.cm-md-html-sub': { verticalAlign: 'sub', fontSize: '0.78em' },
  '.cm-md-html-sup': { verticalAlign: 'super', fontSize: '0.78em' },
  '.cm-md-html-mark': {
    background: 'var(--cm-mark-bg, #fff59d)',
    color: 'var(--cm-mark-fg, #000)',
    padding: '0 2px',
    borderRadius: '2px',
  },
  '.cm-md-html-kbd': {
    fontFamily: 'var(--cm-mono, monospace)',
    fontSize: '0.85em',
    border: '1px solid rgba(127,127,127,0.4)',
    borderBottomWidth: '2px',
    borderRadius: '3px',
    padding: '0 4px',
    background: 'rgba(127,127,127,0.08)',
  },
  '.cm-md-html-u': { textDecoration: 'underline' },
});
