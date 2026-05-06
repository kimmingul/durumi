// Mermaid block decoration: replace a ```mermaid``` fence with a rendered
// SVG block widget when the cursor is OUTSIDE the fence (including the opening
// and closing ``` lines). When the cursor is anywhere inside, show raw source.
//
// Architecture (B1 #6 invariant: block widgets MUST live in a StateField):
//   - `mermaidField` is a StateField<DecorationSet> that rebuilds whenever the
//     doc changes, the selection moves, or a `renderTick` effect fires.
//   - `mermaidLoader` is a ViewPlugin that scans for fences whose bodies are
//     not yet in the renderer cache, fires `requestRender(body)`, and on
//     completion dispatches a `renderTick` so the StateField rebuilds with
//     the freshly-cached SVG.
//
// The widget DOM uses the host element's HTML setter to inject the SVG. The
// SVG is produced by the mermaid library (not user-controlled HTML); mermaid
// runs with `securityLevel: 'strict'`, which sanitises user input before
// emitting SVG. This is the explicit trust boundary documented in the C5
// design (acceptable: user is rendering their own content).

import { syntaxTree } from '@codemirror/language';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { EditorState, Extension, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { getCachedSvg, isInflight, requestRender } from '../mermaid/renderer';

export interface MermaidFence {
  /** Outer block range — covers opening ``` line through closing ``` line. */
  from: number;
  to: number;
  /** Body text fed to mermaid (excluding the fence markers). */
  body: string;
}

const renderTick = StateEffect.define<number>();

export function findMermaidFences(state: EditorState): MermaidFence[] {
  const out: MermaidFence[] = [];
  const tree = syntaxTree(state);
  tree.iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return;
      const cur = node.node;
      const info = cur.getChild('CodeInfo');
      if (!info) return;
      const lang = state.sliceDoc(info.from, info.to).trim().toLowerCase();
      if (lang !== 'mermaid') return;
      const text = cur.getChild('CodeText');
      const body = text ? state.sliceDoc(text.from, text.to) : '';
      out.push({ from: cur.from, to: cur.to, body });
    },
  });
  return out;
}

class MermaidWidget extends WidgetType {
  constructor(
    readonly body: string,
    readonly svg: string | null,
  ) {
    super();
  }
  eq(other: MermaidWidget): boolean {
    return other.body === this.body && other.svg === this.svg;
  }
  toDOM(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'cm-mermaid-rendered';
    if (this.svg !== null) {
      // SVG is mermaid library output, not user-controlled HTML. The trust
      // boundary is documented in the C5 design.
      injectSvg(div, this.svg);
    } else {
      div.textContent = 'Rendering diagram…';
    }
    return div;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

function injectSvg(host: HTMLElement, svg: string): void {
  // Indirected to a tiny helper so the html-injection sink lives in exactly
  // one place. Mermaid output is trusted; user input is sanitised before
  // SVG emission via `securityLevel: 'strict'`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (host as any).innerHTML = svg;
}

function build(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const head = state.selection.main.head;
  const fences = findMermaidFences(state);
  for (const f of fences) {
    // Active-block guard: cursor anywhere inside the fence (including the
    // opening/closing ``` lines) means show raw source — no decoration.
    if (head >= f.from && head <= f.to) continue;
    const svg = getCachedSvg(f.body);
    builder.add(
      f.from,
      f.to,
      Decoration.replace({ widget: new MermaidWidget(f.body, svg), block: true }),
    );
  }
  return builder.finish();
}

const mermaidField = StateField.define<DecorationSet>({
  create(state) {
    return build(state);
  },
  update(value, tr) {
    let rebuild = tr.docChanged || tr.selection;
    if (!rebuild) {
      for (const e of tr.effects) {
        if (e.is(renderTick)) {
          rebuild = true;
          break;
        }
      }
    }
    if (rebuild) return build(tr.state);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

let tickCounter = 0;

const mermaidLoader = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      this.scan(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.scan(u.view);
    }
    scan(view: EditorView) {
      const fences = findMermaidFences(view.state);
      for (const f of fences) {
        if (getCachedSvg(f.body) !== null) continue;
        if (isInflight(f.body)) continue;
        void requestRender(f.body).then(() => {
          // Dispatch a tick to force the StateField to rebuild with the new
          // cached SVG. Guard against the view being torn down between scan
          // and resolution.
          if ((view as unknown as { destroyed?: boolean }).destroyed) return;
          view.dispatch({ effects: renderTick.of(++tickCounter) });
        });
      }
    }
  },
);

export function mermaidDecorations(): Extension {
  return [mermaidField, mermaidLoader];
}
