import { syntaxTree } from '@codemirror/language';
import { EditorState, Extension, Range, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { parseHeadings, buildOutlineTree, OutlineNode } from '../outline';
import { parseFrontMatter } from '../../../shared/frontMatter';
import { hasActiveLine, userActiveField } from './activeLine';

class TocWidget extends WidgetType {
  constructor(private readonly nodes: OutlineNode[]) {
    super();
  }
  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'cm-md-toc';
    if (this.nodes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cm-md-toc-empty';
      empty.textContent = '(table of contents — add some headings)';
      wrap.appendChild(empty);
      return wrap;
    }
    const title = document.createElement('div');
    title.className = 'cm-md-toc-title';
    title.textContent = 'Table of contents';
    wrap.appendChild(title);
    wrap.appendChild(renderList(this.nodes));
    return wrap;
  }
  eq(other: WidgetType) {
    if (!(other instanceof TocWidget)) return false;
    return serialise(this.nodes) === serialise(other.nodes);
  }
  ignoreEvent() {
    return false;
  }
}

function serialise(nodes: OutlineNode[]): string {
  return JSON.stringify(nodes, (k, v) => (k === 'children' && Array.isArray(v) && v.length === 0 ? undefined : v));
}

function renderList(nodes: OutlineNode[]): HTMLUListElement {
  const ul = document.createElement('ul');
  for (const node of nodes) {
    const li = document.createElement('li');
    li.className = `cm-md-toc-h${node.level}`;
    const a = document.createElement('a');
    a.textContent = node.text;
    a.href = '#';
    a.dataset.tocLine = String(node.line);
    li.appendChild(a);
    if (node.children.length > 0) {
      li.appendChild(renderList(node.children));
    }
    ul.appendChild(li);
  }
  return ul;
}

function buildToc(state: EditorState): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const tree = syntaxTree(state);
  const sel = state.selection.main;
  const active = hasActiveLine(state);
  let headings: OutlineNode[] | null = null;
  tree.iterate({
    enter(node) {
      if (node.name !== 'TocDirective') return;
      if (active && sel.from <= node.to && sel.to >= node.from) {
        // Caret on the directive line: leave the source visible so the user
        // can edit / delete it.
        return;
      }
      if (!headings) {
        const fm = parseFrontMatter(state.doc.toString());
        const body = fm.endOffset > 0 ? fm.body : state.doc.toString();
        headings = buildOutlineTree(parseHeadings(body));
      }
      const lineEnd = state.doc.lineAt(node.to).to;
      decos.push(
        Decoration.replace({
          widget: new TocWidget(headings),
          block: true,
        }).range(state.doc.lineAt(node.from).from, lineEnd),
      );
    },
  });
  return Decoration.set(decos, true);
}

const tocField = StateField.define<DecorationSet>({
  create(state) {
    return buildToc(state);
  },
  update(value, tr) {
    if (tr.docChanged || tr.selection) return buildToc(tr.state);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const tocClickHandler = EditorView.domEventHandlers({
  click(event, view) {
    const target = event.target as HTMLElement | null;
    const a = target?.closest<HTMLAnchorElement>('.cm-md-toc a[data-toc-line]');
    if (!a) return false;
    const line = Number(a.dataset.tocLine);
    if (!Number.isFinite(line) || line < 1) return false;
    event.preventDefault();
    const lineInfo = view.state.doc.line(Math.min(line, view.state.doc.lines));
    view.dispatch({
      selection: { anchor: lineInfo.from },
      effects: EditorView.scrollIntoView(lineInfo.from, { y: 'start' }),
    });
    view.focus();
    return true;
  },
});

export function tocDecoration(): Extension {
  return [userActiveField, tocField, tocClickHandler];
}

export const tocTheme = EditorView.theme({
  '.cm-md-toc': {
    display: 'block',
    padding: '8px 14px',
    margin: '8px 0',
    borderLeft: '3px solid var(--cm-accent, #6c7a89)',
    background: 'var(--cm-toc-bg, rgba(108, 122, 137, 0.05))',
    borderRadius: '0 4px 4px 0',
  },
  '.cm-md-toc-title': {
    fontWeight: 600,
    fontSize: '0.85em',
    color: 'var(--cm-frontmatter-fg, #5a6572)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '6px',
  },
  '.cm-md-toc ul': { margin: 0, paddingLeft: '14px', listStyle: 'none' },
  '.cm-md-toc li': { padding: '1px 0', fontSize: '0.95em' },
  '.cm-md-toc li a': {
    color: 'var(--cm-link, #0a66c2)',
    textDecoration: 'none',
  },
  '.cm-md-toc li a:hover': { textDecoration: 'underline' },
  '.cm-md-toc-empty': { color: '#888', fontStyle: 'italic', fontSize: '0.9em' },
});
