import { syntaxTree } from '@codemirror/language';
import { EditorState, Extension, Range, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { parseFrontMatter, frontMatterString } from '../../../shared/frontMatter';
import { hasActiveLine, userActiveField } from './activeLine';

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

function buildSummary(raw: string): string {
  const fm = parseFrontMatter(raw);
  if (!fm.data) return 'Front matter';
  const title = frontMatterString(fm, 'title');
  const author = frontMatterString(fm, 'author');
  const date = frontMatterString(fm, 'date');
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
      const inside = hasActiveLine(state) && sel.from <= lineEnd && sel.to >= from;
      if (inside) {
        const startLine = state.doc.lineAt(from).number;
        const endLine = state.doc.lineAt(lineEnd).number;
        for (let n = startLine; n <= endLine; n++) {
          const line = state.doc.line(n);
          decos.push(Decoration.line({ class: 'cm-md-frontmatter-line' }).range(line.from));
        }
      } else {
        const raw = state.doc.sliceString(from, node.to);
        const summary = buildSummary(raw);
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
    if (tr.docChanged || tr.selection) return buildDecorations(tr.state);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function frontMatterDecoration(): Extension {
  return [userActiveField, frontMatterField];
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
