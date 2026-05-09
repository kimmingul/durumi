import { syntaxTree } from '@codemirror/language';
import { EditorState, Extension, Range, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { getActiveLineRange, hasActiveLine, userActiveField } from './activeLine';

/**
 * Live decorations for CriticMarkup track-changes operators.
 *
 *   {++ ins ++}    green underline     (CmInsert)
 *   {-- del --}    red strikethrough   (CmDelete)
 *   {~~ a ~> b ~~} a strike + arrow + b underline (CmSubstitution)
 *   {== mark ==}   yellow background   (CmHighlight)
 *   {>> note <<}   purple chat pill    (CmComment)
 *
 * Active-line invariant (mirrors comment.ts and citation.ts): when the caret
 * lies on any line touched by the CM range, the source is shown verbatim so
 * IME and direct-edit work. Off-line, the delimiters are hidden and the
 * inner content is rendered with the operator-specific style.
 */

class HiddenMarkWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-cm-marker-hidden';
    s.setAttribute('aria-hidden', 'true');
    return s;
  }
  ignoreEvent() { return true; }
}

class ArrowWidget extends WidgetType {
  eq(other: WidgetType) { return other instanceof ArrowWidget; }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-cm-sub-arrow';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = ' → ';
    return s;
  }
  ignoreEvent() { return true; }
}

class CommentPillWidget extends WidgetType {
  constructor(private readonly cmFrom: number, private readonly preview: string) {
    super();
  }
  eq(other: WidgetType) {
    return (
      other instanceof CommentPillWidget &&
      other.cmFrom === this.cmFrom &&
      other.preview === this.preview
    );
  }
  toDOM() {
    const btn = document.createElement('span');
    btn.className = 'cm-cm-comment-pill';
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-label', 'critic comment');
    btn.setAttribute('data-cm-from', String(this.cmFrom));
    btn.title = this.preview;
    btn.textContent = '💬';
    btn.addEventListener('mousedown', (e) => {
      // Match comment.ts: click should feel like a UI action, not text edit.
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ev = new CustomEvent('durumi:cm-focus', {
        detail: { from: this.cmFrom },
        bubbles: true,
      });
      btn.dispatchEvent(ev);
    });
    return btn;
  }
  ignoreEvent(event: Event) {
    return event.type !== 'mousedown' && event.type !== 'click';
  }
}

interface CmSpan {
  kind: 'insert' | 'delete' | 'substitution' | 'highlight' | 'comment';
  from: number;
  to: number;
  /** Open-mark range for ins/del/highlight/sub (the `{xx`). */
  openFrom: number;
  openTo: number;
  /** Close-mark range. */
  closeFrom: number;
  closeTo: number;
  /** For substitution: the old/new/arrow ranges. */
  oldFrom?: number;
  oldTo?: number;
  newFrom?: number;
  newTo?: number;
  arrowFrom?: number;
  arrowTo?: number;
  /** For comment: the body range. */
  bodyFrom?: number;
  bodyTo?: number;
  /** For comment: a small text preview for the tooltip. */
  preview?: string;
}

function collectSpans(state: EditorState): CmSpan[] {
  const out: CmSpan[] = [];
  const doc = state.doc;
  syntaxTree(state).iterate({
    enter(node) {
      const n = node.name;
      if (
        n !== 'CmInsert' &&
        n !== 'CmDelete' &&
        n !== 'CmSubstitution' &&
        n !== 'CmHighlight' &&
        n !== 'CmComment'
      ) {
        return;
      }
      let openFrom = node.from;
      let openTo = node.from + 3;
      let closeFrom = node.to - 3;
      let closeTo = node.to;
      let oldFrom: number | undefined;
      let oldTo: number | undefined;
      let newFrom: number | undefined;
      let newTo: number | undefined;
      let arrowFrom: number | undefined;
      let arrowTo: number | undefined;
      let bodyFrom: number | undefined;
      let bodyTo: number | undefined;
      let firstMarkSeen = false;
      let child = node.node.firstChild;
      while (child) {
        if (
          child.name === 'CmInsertMark' ||
          child.name === 'CmDeleteMark' ||
          child.name === 'CmSubMark' ||
          child.name === 'CmHighlightMark' ||
          child.name === 'CmCommentMark'
        ) {
          if (!firstMarkSeen) {
            openFrom = child.from;
            openTo = child.to;
            firstMarkSeen = true;
          } else {
            closeFrom = child.from;
            closeTo = child.to;
          }
        } else if (child.name === 'CmSubOld') {
          oldFrom = child.from;
          oldTo = child.to;
        } else if (child.name === 'CmSubNew') {
          newFrom = child.from;
          newTo = child.to;
        } else if (child.name === 'CmSubArrow') {
          arrowFrom = child.from;
          arrowTo = child.to;
        } else if (child.name === 'CmCommentBody') {
          bodyFrom = child.from;
          bodyTo = child.to;
        }
        child = child.nextSibling;
      }
      const span: CmSpan = {
        kind:
          n === 'CmInsert' ? 'insert'
          : n === 'CmDelete' ? 'delete'
          : n === 'CmSubstitution' ? 'substitution'
          : n === 'CmHighlight' ? 'highlight'
          : 'comment',
        from: node.from,
        to: node.to,
        openFrom, openTo,
        closeFrom, closeTo,
        oldFrom, oldTo, newFrom, newTo, arrowFrom, arrowTo,
        bodyFrom, bodyTo,
      };
      if (span.kind === 'comment' && bodyFrom !== undefined && bodyTo !== undefined) {
        const text = doc.sliceString(bodyFrom, bodyTo).trim();
        span.preview = text.length > 80 ? text.slice(0, 79) + '…' : text;
      }
      out.push(span);
    },
  });
  return out;
}

function rangeTouchesActiveLine(state: EditorState, from: number, to: number): boolean {
  if (!hasActiveLine(state)) return false;
  const a = getActiveLineRange(state);
  return !(to < a.from || from > a.to);
}

function buildDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const spans = collectSpans(state);
  for (const span of spans) {
    const cursorTouches = rangeTouchesActiveLine(state, span.from, span.to);
    if (cursorTouches) {
      // Active line: source visible. Apply a faint background to make the
      // span discoverable, but do not hide marks.
      ranges.push(
        Decoration.mark({ class: `cm-cm-active cm-cm-active-${span.kind}` }).range(
          span.from,
          span.to,
        ),
      );
      continue;
    }
    if (span.kind === 'comment') {
      // Replace the entire `{>> ... <<}` with a single pill widget.
      ranges.push(
        Decoration.replace({
          widget: new CommentPillWidget(span.from, span.preview ?? ''),
        }).range(span.from, span.to),
      );
      continue;
    }
    if (span.kind === 'substitution') {
      // Hide the opening `{~~`, mark old as strike, replace `~>` with arrow,
      // mark new as underline, hide closing `~~}`.
      ranges.push(
        Decoration.replace({ widget: new HiddenMarkWidget() }).range(
          span.openFrom,
          span.openTo,
        ),
      );
      if (span.oldFrom !== undefined && span.oldTo !== undefined) {
        ranges.push(
          Decoration.mark({ class: 'cm-cm-sub-old' }).range(span.oldFrom, span.oldTo),
        );
      }
      if (span.arrowFrom !== undefined && span.arrowTo !== undefined) {
        ranges.push(
          Decoration.replace({ widget: new ArrowWidget() }).range(
            span.arrowFrom,
            span.arrowTo,
          ),
        );
      }
      if (span.newFrom !== undefined && span.newTo !== undefined) {
        ranges.push(
          Decoration.mark({ class: 'cm-cm-sub-new' }).range(span.newFrom, span.newTo),
        );
      }
      ranges.push(
        Decoration.replace({ widget: new HiddenMarkWidget() }).range(
          span.closeFrom,
          span.closeTo,
        ),
      );
      continue;
    }
    // insert / delete / highlight: hide the marks, mark the inner.
    ranges.push(
      Decoration.replace({ widget: new HiddenMarkWidget() }).range(
        span.openFrom,
        span.openTo,
      ),
    );
    ranges.push(
      Decoration.mark({ class: `cm-cm-${span.kind}` }).range(span.openTo, span.closeFrom),
    );
    ranges.push(
      Decoration.replace({ widget: new HiddenMarkWidget() }).range(
        span.closeFrom,
        span.closeTo,
      ),
    );
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(ranges, true);
}

const criticMarkupField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged || tr.selection) return buildDecorations(tr.state);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function criticMarkupDecoration(): Extension {
  return [userActiveField, criticMarkupField];
}

export const criticMarkupTheme = EditorView.theme({
  '.cm-cm-insert': {
    color: 'var(--cm-cm-insert, #1a7f37)',
    textDecoration: 'underline',
    textDecorationColor: 'var(--cm-cm-insert, #1a7f37)',
  },
  '.cm-cm-delete': {
    color: 'var(--cm-cm-delete, #d1242f)',
    textDecoration: 'line-through',
    textDecorationColor: 'var(--cm-cm-delete, #d1242f)',
  },
  '.cm-cm-sub-old': {
    color: 'var(--cm-cm-sub-old, #b08800)',
    textDecoration: 'line-through',
    textDecorationColor: 'var(--cm-cm-sub-old, #b08800)',
  },
  '.cm-cm-sub-new': {
    color: 'var(--cm-cm-sub-new, #1a7f37)',
    textDecoration: 'underline',
    textDecorationColor: 'var(--cm-cm-sub-new, #1a7f37)',
  },
  '.cm-cm-sub-arrow': {
    color: 'var(--cm-cm-sub-arrow, #6a6a6a)',
    fontWeight: 600,
    padding: '0 2px',
  },
  '.cm-cm-highlight': {
    background: 'var(--cm-cm-highlight, rgba(255, 200, 50, 0.55))',
    borderRadius: '2px',
    padding: '0 1px',
  },
  '.cm-cm-comment-pill': {
    display: 'inline-block',
    fontSize: '0.85em',
    padding: '0 4px',
    marginLeft: '2px',
    borderRadius: '8px',
    cursor: 'pointer',
    userSelect: 'none',
    background: 'var(--cm-cm-comment-bg, rgba(106, 63, 156, 0.22))',
    color: 'var(--cm-cm-comment, #6a3f9c)',
    verticalAlign: 'middle',
  },
  '.cm-cm-comment-pill:hover': {
    filter: 'brightness(0.95)',
  },
  '.cm-cm-active': {
    background: 'var(--cm-cm-active-bg, rgba(150, 150, 150, 0.10))',
    borderRadius: '3px',
  },
  '.cm-cm-active-insert': {
    background: 'var(--cm-cm-active-insert-bg, rgba(26, 127, 55, 0.10))',
  },
  '.cm-cm-active-delete': {
    background: 'var(--cm-cm-active-delete-bg, rgba(209, 36, 47, 0.10))',
  },
  '.cm-cm-active-substitution': {
    background: 'var(--cm-cm-active-sub-bg, rgba(176, 136, 0, 0.10))',
  },
  '.cm-cm-active-highlight': {
    background: 'var(--cm-cm-active-hl-bg, rgba(255, 200, 50, 0.20))',
  },
  '.cm-cm-active-comment': {
    background: 'var(--cm-cm-active-comment-bg, rgba(106, 63, 156, 0.10))',
  },
  '.cm-cm-marker-hidden': {
    display: 'inline-block',
    width: 0,
    height: 0,
    overflow: 'hidden',
  },
});
