import { syntaxTree } from '@codemirror/language';
import { Compartment, EditorState, Extension, Range, StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

/**
 * Focus Mode and Typewriter Mode, mirroring Typora's behaviour.
 *
 * Focus Mode dims every block in the editor except the one containing the
 * caret. Implemented with line decorations: each line outside the active
 * block gets `cm-focus-dim`; the active block's lines get `cm-focus-active`.
 *
 * Typewriter Mode keeps the caret line vertically centred. Implemented with
 * a ViewPlugin that listens for selection changes and dispatches a
 * `scrollIntoView({ y: "center" })` effect.
 */

export const setFocusMode = StateEffect.define<boolean>();
export const setTypewriterMode = StateEffect.define<boolean>();

export const focusModeField = StateField.define<boolean>({
  create() {
    return false;
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setFocusMode)) return e.value;
    }
    return value;
  },
});

export const typewriterModeField = StateField.define<boolean>({
  create() {
    return false;
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setTypewriterMode)) return e.value;
    }
    return value;
  },
});

function activeBlockRange(state: EditorState): { from: number; to: number } | null {
  const sel = state.selection.main;
  // Walk up from the caret position until we hit a block-level node.
  const tree = syntaxTree(state);
  let node = tree.resolveInner(sel.head, 1);
  while (node.parent && !isBlock(node.name)) {
    node = node.parent;
  }
  if (isBlock(node.name)) return { from: node.from, to: node.to };
  // Fallback: the caret line.
  const line = state.doc.lineAt(sel.head);
  return { from: line.from, to: line.to };
}

function isBlock(name: string): boolean {
  return (
    name === 'Paragraph' ||
    name === 'ATXHeading1' ||
    name === 'ATXHeading2' ||
    name === 'ATXHeading3' ||
    name === 'ATXHeading4' ||
    name === 'ATXHeading5' ||
    name === 'ATXHeading6' ||
    name === 'SetextHeading1' ||
    name === 'SetextHeading2' ||
    name === 'BulletList' ||
    name === 'OrderedList' ||
    name === 'ListItem' ||
    name === 'Blockquote' ||
    name === 'FencedCode' ||
    name === 'CodeBlock' ||
    name === 'Table' ||
    name === 'FrontMatter' ||
    name === 'TocDirective'
  );
}

const focusDecorationField = StateField.define<DecorationSet>({
  create(state) {
    return computeFocusDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(setFocusMode))) {
      return computeFocusDecorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function computeFocusDecorations(state: EditorState): DecorationSet {
  if (!state.field(focusModeField, false)) return Decoration.none;
  const block = activeBlockRange(state);
  if (!block) return Decoration.none;
  const decos: Range<Decoration>[] = [];
  const totalLines = state.doc.lines;
  const activeFromLine = state.doc.lineAt(block.from).number;
  const activeToLine = state.doc.lineAt(block.to).number;
  for (let n = 1; n <= totalLines; n++) {
    const line = state.doc.line(n);
    if (n >= activeFromLine && n <= activeToLine) {
      decos.push(Decoration.line({ class: 'cm-focus-active' }).range(line.from));
    } else {
      decos.push(Decoration.line({ class: 'cm-focus-dim' }).range(line.from));
    }
  }
  return Decoration.set(decos, true);
}

const typewriterPlugin = ViewPlugin.fromClass(
  class {
    update(u: ViewUpdate) {
      const state = u.view.state;
      if (!state.field(typewriterModeField, false)) return;
      if (!u.selectionSet && !u.docChanged) return;
      const head = state.selection.main.head;
      // Defer to the next frame so layout is stable before we measure.
      requestAnimationFrame(() => {
        if (!u.view.state.field(typewriterModeField, false)) return;
        u.view.dispatch({
          effects: EditorView.scrollIntoView(head, { y: 'center' }),
        });
      });
    }
  },
);

const viewModesTheme = EditorView.theme({
  '.cm-focus-dim': {
    opacity: '0.3',
    transition: 'opacity 200ms',
  },
  '.cm-focus-active': {
    opacity: '1',
  },
});

export function viewModes(): Extension {
  return [focusModeField, typewriterModeField, focusDecorationField, typewriterPlugin, viewModesTheme];
}

export const viewModesCompartment = new Compartment();
