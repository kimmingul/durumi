import katex from 'katex';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { EditorState, Extension, RangeSetBuilder, StateField } from '@codemirror/state';
import { scanBlockMath, scanInlineMath, type BlockMathRange, type InlineMathRange } from '../math/scan';
import { isWysiwygMode } from '../editMode';

/**
 * Inline math widget. Renders `$tex$` as a `<span>` containing KaTeX HTML.
 * KaTeX's HTML output is library-generated, not user-supplied, so assigning
 * the rendered string to .innerHTML is safe (mirrors table.ts pattern).
 */
class InlineMathWidget extends WidgetType {
  constructor(readonly tex: string) {
    super();
  }
  eq(other: InlineMathWidget) {
    return other.tex === this.tex;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-math-inline';
    try {
      // Source: katex.renderToString — library-generated HTML, not user input.
      span.innerHTML = katex.renderToString(this.tex, { throwOnError: false, displayMode: false });
    } catch {
      span.textContent = `$${this.tex}$`;
    }
    return span;
  }
  ignoreEvent() {
    return false;
  }
}

/**
 * Block math widget. Renders `$$tex$$` as a centered `<div>` display.
 * KaTeX's HTML output is library-generated, not user-supplied, so assigning
 * the rendered string to .innerHTML is safe.
 */
class BlockMathWidget extends WidgetType {
  constructor(readonly tex: string) {
    super();
  }
  eq(other: BlockMathWidget) {
    return other.tex === this.tex;
  }
  toDOM() {
    const div = document.createElement('div');
    div.className = 'cm-math-block';
    try {
      // Source: katex.renderToString — library-generated HTML, not user input.
      div.innerHTML = katex.renderToString(this.tex, { throwOnError: false, displayMode: true });
    } catch {
      div.textContent = `$$${this.tex}$$`;
    }
    return div;
  }
  ignoreEvent() {
    return false;
  }
}

function inlineOverlapsActiveLine(state: EditorState, m: InlineMathRange): boolean {
  const line = state.doc.lineAt(state.selection.main.head);
  return m.to > line.from && m.from < line.to;
}

function buildInlineDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const blocks = scanBlockMath(state);
  const inlines = scanInlineMath(state, blocks);
  const wysiwyg = isWysiwygMode(state);
  // matchAll yields matches in document order, so `from` is non-decreasing.
  for (const m of inlines) {
    if (!wysiwyg && inlineOverlapsActiveLine(state, m)) continue;
    builder.add(
      m.from,
      m.to,
      Decoration.replace({ widget: new InlineMathWidget(m.tex) }),
    );
  }
  return builder.finish();
}

const inlineMathPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildInlineDecorations(view.state);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildInlineDecorations(update.view.state);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

function blockContainsCursor(state: EditorState, b: BlockMathRange): boolean {
  const head = state.selection.main.head;
  return head >= b.from && head <= b.to;
}

function buildBlockDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const blocks = scanBlockMath(state);
  // Sort defensively (matchAll already returns document order).
  blocks.sort((a, b) => a.from - b.from);
  const wysiwyg = isWysiwygMode(state);
  for (const b of blocks) {
    if (!wysiwyg && blockContainsCursor(state, b)) continue;
    builder.add(
      b.from,
      b.to,
      Decoration.replace({ widget: new BlockMathWidget(b.tex), block: true }),
    );
  }
  return builder.finish();
}

// B1 defect #6: block decorations MUST live in a StateField, not a ViewPlugin.
const blockMathField = StateField.define<DecorationSet>({
  create(state) {
    return buildBlockDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged || tr.selection) {
      return buildBlockDecorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Active-line guard: math on the cursor's line/block remains as raw text. */
export const mathDecorations: Extension = [inlineMathPlugin, blockMathField];

// Exports for tests
export const _testing = {
  InlineMathWidget,
  BlockMathWidget,
  buildInlineDecorations,
  buildBlockDecorations,
};
