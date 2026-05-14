import { syntaxTree } from '@codemirror/language';
import { EditorState, Extension, Range, StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { hasActiveLine, userActiveField } from './activeLine';
import { isWysiwygMode } from '../editMode';

// js-yaml (~105 KB) is dynamic-imported on first encounter with a front-matter
// block. Until the parse module loads, the summary widget shows the generic
// "Front matter" label; once cached, a `renderTick` rebuilds the StateField
// and the widget displays the parsed summary. Mirrors the lazy-render pattern
// used by `mermaid.ts` and `math.ts`.
type FrontMatterModule = typeof import('../../../shared/frontMatter');
let fmModulePromise: Promise<FrontMatterModule> | null = null;
let fmModule: FrontMatterModule | null = null;
const summaryCache = new Map<string, string>();
const inflightSummaries = new Set<string>();

function loadFrontMatterModule(): Promise<FrontMatterModule> {
  if (!fmModulePromise) {
    fmModulePromise = import('../../../shared/frontMatter').then((m) => {
      fmModule = m;
      return m;
    });
  }
  return fmModulePromise;
}

const renderTick = StateEffect.define<number>();
let tickCounter = 0;

class FrontMatterSummaryWidget extends WidgetType {
  constructor(private readonly summary: string) {
    super();
  }
  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'cm-md-frontmatter-summary';
    wrap.textContent = this.summary;
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
  eq(other: WidgetType) {
    return other instanceof FrontMatterSummaryWidget && other.summary === this.summary;
  }
}

function getCachedSummary(raw: string): string {
  // Try the cache first.
  const hit = summaryCache.get(raw);
  if (hit !== undefined) return hit;
  // If js-yaml is already loaded, compute synchronously and cache.
  if (fmModule) {
    const summary = buildSummaryFromYaml(raw);
    summaryCache.set(raw, summary);
    return summary;
  }
  // Cold path: show a generic label until the parse module loads.
  return 'Front matter';
}

function buildSummaryFromYaml(raw: string): string {
  if (!fmModule) return 'Front matter';
  const fm = fmModule.parseFrontMatter(raw);
  if (!fm.data) return 'Front matter';
  const title = fmModule.frontMatterString(fm, 'title');
  const author = fmModule.frontMatterString(fm, 'author');
  const date = fmModule.frontMatterString(fm, 'date');
  const parts: string[] = [];
  if (title) parts.push(title);
  if (author) parts.push(author);
  if (date) parts.push(date);
  if (parts.length === 0) {
    const keys = Object.keys(fm.data);
    if (keys.length === 0) return 'Front matter (empty)';
    return `Front matter · ${keys.length} field${keys.length === 1 ? '' : 's'}`;
  }
  return `Front matter · ${parts.join(' — ')}`;
}

function buildDecorations(state: EditorState): DecorationSet {
  const decos: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'FrontMatter') return;
      const from = node.from;
      const lineEnd = state.doc.lineAt(node.to).to;
      const sel = state.selection.main;
      const inside =
        !isWysiwygMode(state) &&
        hasActiveLine(state) &&
        sel.from <= lineEnd &&
        sel.to >= from;
      if (inside) {
        const startLine = state.doc.lineAt(from).number;
        const endLine = state.doc.lineAt(lineEnd).number;
        for (let n = startLine; n <= endLine; n++) {
          const line = state.doc.line(n);
          decos.push(Decoration.line({ class: 'cm-md-frontmatter-line' }).range(line.from));
        }
      } else {
        const raw = state.doc.sliceString(from, node.to);
        const summary = getCachedSummary(raw);
        decos.push(
          Decoration.replace({
            widget: new FrontMatterSummaryWidget(summary),
            block: true,
          }).range(from, lineEnd),
        );
      }
      return false;
    },
  });
  return Decoration.set(decos, true);
}

const frontMatterField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
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
    if (rebuild) return buildDecorations(tr.state);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const frontMatterLoader = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      this.scan(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged) this.scan(u.view);
    }
    scan(view: EditorView) {
      // Walk the syntax tree for FrontMatter nodes; if any are present and the
      // YAML module hasn't been loaded yet, kick off the load and dispatch a
      // tick once it resolves so the summary widget can update with parsed
      // data. Cheap: tree walk is O(top-level blocks).
      const tree = syntaxTree(view.state);
      let needsLoad = false;
      const rawTexts: string[] = [];
      tree.iterate({
        enter(node) {
          if (node.name !== 'FrontMatter') return;
          const raw = view.state.doc.sliceString(node.from, node.to);
          if (summaryCache.has(raw) || inflightSummaries.has(raw)) return;
          needsLoad = true;
          rawTexts.push(raw);
        },
      });
      if (!needsLoad) return;
      for (const r of rawTexts) inflightSummaries.add(r);
      void loadFrontMatterModule().then(() => {
        if ((view as unknown as { destroyed?: boolean }).destroyed) return;
        // Pre-populate cache for the rawTexts we identified.
        for (const r of rawTexts) {
          summaryCache.set(r, buildSummaryFromYaml(r));
          inflightSummaries.delete(r);
        }
        view.dispatch({ effects: renderTick.of(++tickCounter) });
      });
    }
  },
);

export function frontMatterDecoration(): Extension {
  return [userActiveField, frontMatterField, frontMatterLoader];
}

export const frontMatterTheme = EditorView.theme({
  '.cm-md-frontmatter-summary': {
    display: 'block',
    padding: '4px 10px',
    margin: '4px 0',
    borderLeft: '3px solid var(--cm-accent, #6c7a89)',
    background: 'var(--cm-frontmatter-bg, rgba(108, 122, 137, 0.08))',
    color: 'var(--cm-frontmatter-fg, #5a6572)',
    fontSize: '0.9em',
    fontFamily: 'var(--font-ui, system-ui)',
  },
  '.cm-md-frontmatter-line': {
    background: 'var(--cm-frontmatter-bg, rgba(108, 122, 137, 0.05))',
  },
});
