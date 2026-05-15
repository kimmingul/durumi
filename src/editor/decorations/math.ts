// Math (KaTeX) decoration. KaTeX itself (~580 KB) is dynamic-imported by
// `../math/katexLoader.ts`; this module renders raw `$tex$` / `$$tex$$` as
// plain text until the async render lands in the cache, then a `renderTick`
// effect rebuilds the decoration with the cached HTML. Mirrors `mermaid.ts`.
//
// KaTeX's HTML output is library-generated, not user-supplied — assigning the
// rendered string to .innerHTML is safe (mirrors table.ts and mermaid.ts trust
// boundary).

import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { EditorState, Extension, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { scanBlockMath, scanInlineMath, type BlockMathRange, type InlineMathRange } from '../math/scan';
import { getCachedKatex, isKatexInflight, requestKatexRender } from '../math/katexLoader';
import { isWysiwygMode, setEditMode } from '../editMode';

const renderTick = StateEffect.define<number>();

class InlineMathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly html: string | null,
  ) {
    super();
  }
  eq(other: InlineMathWidget) {
    return other.tex === this.tex && other.html === this.html;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-math-inline';
    if (this.html !== null) {
      // Trust boundary: katex.renderToString output is library-generated.
      injectKatex(span, this.html);
    } else {
      span.textContent = `$${this.tex}$`;
    }
    return span;
  }
  ignoreEvent() {
    return false;
  }
}

class BlockMathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly html: string | null,
  ) {
    super();
  }
  eq(other: BlockMathWidget) {
    return other.tex === this.tex && other.html === this.html;
  }
  toDOM() {
    const div = document.createElement('div');
    div.className = 'cm-math-block';
    if (this.html !== null) {
      // Trust boundary: katex.renderToString output is library-generated.
      injectKatex(div, this.html);
    } else {
      div.textContent = `$$${this.tex}$$`;
    }
    return div;
  }
  ignoreEvent() {
    return false;
  }
}

function injectKatex(host: HTMLElement, html: string): void {
  // Indirected to a tiny helper so the html-injection sink lives in exactly
  // one place. KaTeX output is trusted library HTML; user input is the tex
  // source which KaTeX itself escapes before emitting HTML.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (host as any).innerHTML = html;
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
  for (const m of inlines) {
    if (!wysiwyg && inlineOverlapsActiveLine(state, m)) continue;
    const html = getCachedKatex(m.tex, false);
    builder.add(
      m.from,
      m.to,
      Decoration.replace({ widget: new InlineMathWidget(m.tex, html) }),
    );
  }
  return builder.finish();
}

const inlineMathPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildInlineDecorations(view.state);
      this.scanForRender(view);
    }
    update(update: ViewUpdate) {
      let rebuild = update.docChanged || update.selectionSet || update.viewportChanged;
      if (!rebuild) {
        for (const tr of update.transactions) {
          for (const e of tr.effects) {
            if (e.is(renderTick)) {
              rebuild = true;
              break;
            }
          }
          if (rebuild) break;
        }
      }
      if (rebuild) {
        this.decorations = buildInlineDecorations(update.view.state);
        this.scanForRender(update.view);
      }
    }
    scanForRender(view: EditorView) {
      const blocks = scanBlockMath(view.state);
      const inlines = scanInlineMath(view.state, blocks);
      for (const m of inlines) {
        if (getCachedKatex(m.tex, false) !== null) continue;
        if (isKatexInflight(m.tex, false)) continue;
        void requestKatexRender(m.tex, false).then(() => {
          if ((view as unknown as { destroyed?: boolean }).destroyed) return;
          view.dispatch({ effects: renderTick.of(++tickCounter) });
        });
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
  blocks.sort((a, b) => a.from - b.from);
  const wysiwyg = isWysiwygMode(state);
  for (const b of blocks) {
    if (!wysiwyg && blockContainsCursor(state, b)) continue;
    const html = getCachedKatex(b.tex, true);
    builder.add(
      b.from,
      b.to,
      Decoration.replace({ widget: new BlockMathWidget(b.tex, html), block: true }),
    );
  }
  return builder.finish();
}

let tickCounter = 0;

// B1 defect #6: block decorations MUST live in a StateField, not a ViewPlugin.
const blockMathField = StateField.define<DecorationSet>({
  create(state) {
    return buildBlockDecorations(state);
  },
  update(value, tr) {
    let rebuild = tr.docChanged || tr.selection;
    if (!rebuild) {
      for (const e of tr.effects) {
        if (e.is(renderTick) || e.is(setEditMode)) {
          rebuild = true;
          break;
        }
      }
    }
    if (rebuild) return buildBlockDecorations(tr.state);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const blockMathLoader = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      this.scan(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.scan(u.view);
    }
    scan(view: EditorView) {
      const blocks = scanBlockMath(view.state);
      for (const b of blocks) {
        if (getCachedKatex(b.tex, true) !== null) continue;
        if (isKatexInflight(b.tex, true)) continue;
        void requestKatexRender(b.tex, true).then(() => {
          if ((view as unknown as { destroyed?: boolean }).destroyed) return;
          view.dispatch({ effects: renderTick.of(++tickCounter) });
        });
      }
    }
  },
);

/** Active-line guard: math on the cursor's line/block remains as raw text. */
export const mathDecorations: Extension = [inlineMathPlugin, blockMathField, blockMathLoader];

// Exports for tests
export const _testing = {
  InlineMathWidget,
  BlockMathWidget,
  buildInlineDecorations,
  buildBlockDecorations,
};
