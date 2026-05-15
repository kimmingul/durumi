import { syntaxTree } from '@codemirror/language';
import { EditorState, Extension, Range, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { hasActiveLine, userActiveField } from './activeLine';
import { isWysiwygMode, setEditMode } from '../editMode';

/**
 * Live decoration for GitHub-flavored alert callouts:
 *
 *   > [!NOTE]      > [!TIP]      > [!IMPORTANT]      > [!WARNING]      > [!CAUTION]
 *   > body...
 *
 * The export pipeline already renders these via `markdown-it-github-alerts`
 * (see `src/export/renderHtml.ts`). This decoration brings the live editor
 * preview to parity with the exported HTML so the user does not type
 * `> [!NOTE]`, see a vanilla blockquote, then discover a styled callout
 * only after exporting.
 *
 * Detection mirrors the upstream plugin's first-inline-content check —
 * the first textual line of a top-level `Blockquote` syntax node must
 * match the alert header pattern (case-insensitive). Nested blockquotes
 * are intentionally NOT promoted to alerts, matching the GitHub spec.
 */

export type AlertKind = 'note' | 'tip' | 'important' | 'warning' | 'caution';

const KIND_LABEL: Record<AlertKind, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

const KIND_ICON_PATH: Record<AlertKind, string> = {
  note: 'M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z',
  tip: 'M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z',
  important:
    'M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
  warning:
    'M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
  caution:
    'M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z',
};

const ALERT_HEADER_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i;

function isAlertKind(s: string): s is AlertKind {
  return s === 'note' || s === 'tip' || s === 'important' || s === 'warning' || s === 'caution';
}

interface AlertSpan {
  headerFrom: number;
  headerTo: number;
  firstLineNumber: number;
  lastLineNumber: number;
  kind: AlertKind;
}

/**
 * True when this `Blockquote` node sits anywhere in a chain of nested
 * blockquotes — either it has a `Blockquote` ancestor (it is itself an
 * inner layer), or it CONTAINS a nested `Blockquote` child (it is an
 * outer wrapper around `> > …` content). Either way the GitHub spec
 * says it must NOT be promoted to an alert callout: alerts only render
 * for top-level, single-level blockquotes.
 *
 * Lezer-markdown parses `> > [!NOTE]` as `Blockquote` (outer) →
 * `Blockquote` (inner) → `Paragraph`. The outer node passes a
 * parent-only ancestor check (it has no `Blockquote` parent) but is
 * NOT a single-level quote, so we also have to look DOWN for any
 * nested `Blockquote` descendant.
 */
function isNestedBlockquote(node: {
  node: { parent: unknown; firstChild: unknown };
}): boolean {
  let p = (node.node as { parent: { name: string; parent: unknown } | null }).parent;
  while (p) {
    if (p.name === 'Blockquote') return true;
    p = (p as { parent: { name: string; parent: unknown } | null }).parent as typeof p;
  }
  // Walk descendants looking for ANY nested Blockquote. The lezer tree for
  // `> > […]` puts the inner `Blockquote` as a direct child, but be defensive
  // and recurse in case future grammar changes wrap it in another node.
  type ChildNode = { name: string; firstChild: ChildNode | null; nextSibling: ChildNode | null };
  const hasBlockquoteDescendant = (n: ChildNode | null): boolean => {
    let c: ChildNode | null = n;
    while (c) {
      if (c.name === 'Blockquote') return true;
      if (hasBlockquoteDescendant(c.firstChild)) return true;
      c = c.nextSibling;
    }
    return false;
  };
  const firstChild = (node.node as { firstChild: ChildNode | null }).firstChild;
  return hasBlockquoteDescendant(firstChild);
}

function collectAlerts(state: EditorState): AlertSpan[] {
  const out: AlertSpan[] = [];
  const tree = syntaxTree(state);
  tree.iterate({
    enter(node) {
      if (node.name !== 'Blockquote') return;
      if (isNestedBlockquote(node)) return;
      const firstLine = state.doc.lineAt(node.from);
      const stripped = firstLine.text.replace(/^[ \t]*(?:>[ \t]?)+/, '');
      const m = ALERT_HEADER_RE.exec(stripped);
      if (!m) return;
      const kind = m[1].toLowerCase();
      if (!isAlertKind(kind)) return;
      const lastLine = state.doc.lineAt(node.to);
      out.push({
        headerFrom: firstLine.from,
        headerTo: firstLine.to,
        firstLineNumber: firstLine.number,
        lastLineNumber: lastLine.number,
        kind,
      });
    },
  });
  return out;
}

class AlertHeaderWidget extends WidgetType {
  constructor(private readonly kind: AlertKind) {
    super();
  }
  eq(other: WidgetType): boolean {
    return other instanceof AlertHeaderWidget && other.kind === this.kind;
  }
  toDOM(): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = `cm-md-alert-title cm-md-alert-title-${this.kind}`;
    wrapper.setAttribute('data-alert-kind', this.kind);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'cm-md-alert-icon');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', KIND_ICON_PATH[this.kind]);
    svg.appendChild(path);
    wrapper.appendChild(svg);
    const label = document.createElement('span');
    label.className = 'cm-md-alert-label';
    label.textContent = KIND_LABEL[this.kind];
    wrapper.appendChild(label);
    return wrapper;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

function buildDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const sel = state.selection.main;
  const userActive = hasActiveLine(state);
  const wysiwyg = isWysiwygMode(state);
  const alerts = collectAlerts(state);
  for (const a of alerts) {
    for (let n = a.firstLineNumber; n <= a.lastLineNumber; n++) {
      const line = state.doc.line(n);
      const isHeader = n === a.firstLineNumber;
      const cls = isHeader
        ? `cm-md-alert-line cm-md-alert-${a.kind} cm-md-alert-header cm-md-alert-header-${a.kind}`
        : `cm-md-alert-line cm-md-alert-${a.kind} cm-md-alert-body cm-md-alert-body-${a.kind}`;
      ranges.push(Decoration.line({ class: cls }).range(line.from));
    }
    const headerLine = state.doc.lineAt(a.headerFrom);
    const caretOnHeader =
      userActive && sel.from <= headerLine.to && sel.to >= headerLine.from;
    const showRaw = !wysiwyg && caretOnHeader;
    if (showRaw) continue;
    ranges.push(
      Decoration.replace({ widget: new AlertHeaderWidget(a.kind) }).range(
        a.headerFrom,
        a.headerTo,
      ),
    );
  }
  ranges.sort((x, y) => x.from - y.from || x.to - y.to);
  return Decoration.set(ranges, true);
}

const alertsField = StateField.define<DecorationSet>({
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

export function alertsDecoration(): Extension {
  return [userActiveField, alertsField];
}

/**
 * Per-kind line styling (background + coloured `border-left`) AND
 * per-kind header widget colour. The `border-left` rules use
 * `!important` because every alert line ALSO carries the
 * `.cm-md-blockquote` class from `blockquoteDecoration()` (which
 * `index.ts` registers ahead of `alertsDecoration()` and which sets a
 * neutral 3px gray `border-left` from `src/styles/global.css`). Without
 * `!important` the cascade would let the global blockquote rule win
 * (same specificity, declared after the editor-theme rule), painting
 * every alert line gray and erasing the kind colour. Marking the alert
 * border `!important` guarantees the kind colour is the visible one;
 * the alert side is the meaningful semantic, the blockquote side is the
 * default fallback for non-alert quotes only.
 */
export const alertsTheme = EditorView.theme({
  '.cm-md-alert-line': {
    paddingLeft: '0.4em',
  },
  '.cm-md-alert-icon': {
    display: 'inline-block',
    verticalAlign: 'text-bottom',
    fill: 'currentColor',
    marginRight: '0.45em',
  },
  '.cm-md-alert-title': {
    display: 'inline-flex',
    alignItems: 'center',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontSize: '0.9em',
  },
  '.cm-md-alert-label': {
    lineHeight: '1',
  },
  '.cm-md-alert-note': {
    borderLeft: '4px solid #0969da !important',
    background: 'rgba(9, 105, 218, 0.06)',
  },
  '.cm-md-alert-tip': {
    borderLeft: '4px solid #1a7f37 !important',
    background: 'rgba(26, 127, 55, 0.06)',
  },
  '.cm-md-alert-important': {
    borderLeft: '4px solid #8250df !important',
    background: 'rgba(130, 80, 223, 0.06)',
  },
  '.cm-md-alert-warning': {
    borderLeft: '4px solid #9a6700 !important',
    background: 'rgba(154, 103, 0, 0.06)',
  },
  '.cm-md-alert-caution': {
    borderLeft: '4px solid #cf222e !important',
    background: 'rgba(207, 34, 46, 0.06)',
  },
  '.cm-md-alert-title-note': { color: '#0969da' },
  '.cm-md-alert-title-tip': { color: '#1a7f37' },
  '.cm-md-alert-title-important': { color: '#8250df' },
  '.cm-md-alert-title-warning': { color: '#9a6700' },
  '.cm-md-alert-title-caution': { color: '#cf222e' },
});
