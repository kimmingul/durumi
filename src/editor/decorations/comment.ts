import { syntaxTree } from '@codemirror/language';
import { EditorState, Extension, Range, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { getActiveLineRange, hasActiveLine, userActiveField } from './activeLine';
import { isWysiwygMode, setEditMode } from '../editMode';

/**
 * Live decoration for `%%` memos.
 *
 * v0.1.3 redesign: the body of a memo is no longer rendered inline in the
 * editor. Instead, when the caret is OFF the memo's line(s) we collapse the
 * whole `%% … %%` range to zero width and drop a small color-coded chat icon
 * (💬) at the end of the line. Editing happens in the right-side memo panel
 * (see `MemoPanel.tsx`); clicking the icon focuses the matching card.
 *
 * The active-line invariant is preserved: when the caret lands on a memo line,
 * the source text becomes visible again — non-negotiable for IME safety and
 * for letting power users still edit the markdown directly.
 */
class ZeroWidthWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-md-marker-hidden';
    s.setAttribute('aria-hidden', 'true');
    return s;
  }
  ignoreEvent() { return true; }
}

class ChatIconWidget extends WidgetType {
  constructor(
    private readonly tag: string | null,
    private readonly memoFrom: number,
  ) {
    super();
  }
  eq(other: WidgetType) {
    return (
      other instanceof ChatIconWidget &&
      other.tag === this.tag &&
      other.memoFrom === this.memoFrom
    );
  }
  toDOM() {
    const tagClass = tagClassFragment(this.tag);
    const btn = document.createElement('span');
    btn.className = `cm-memo-chat-icon cm-memo-chat-icon-${tagClass}`;
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-label', this.tag ? `memo @${this.tag}` : 'memo');
    btn.setAttribute('data-memo-from', String(this.memoFrom));
    btn.textContent = '💬';
    btn.addEventListener('mousedown', (e) => {
      // Stop CodeMirror from re-positioning the caret to the line-end where
      // the icon sits — we want the click to feel like a UI action, not a
      // text-edit selection.
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ev = new CustomEvent('durumi:memo-focus', {
        detail: { from: this.memoFrom },
        bubbles: true,
      });
      btn.dispatchEvent(ev);
    });
    return btn;
  }
  ignoreEvent(event: Event) {
    // Allow click to reach our handler.
    return event.type !== 'mousedown' && event.type !== 'click';
  }
}

const KNOWN_TAGS = new Set(['ai', 'todo', 'reviewer', 'stats']);

function tagClassFragment(tag: string | null): string {
  if (!tag) return 'untagged';
  return KNOWN_TAGS.has(tag) ? tag : 'other';
}

interface CommentSpan {
  from: number;
  to: number;
  tagText: string | null;
  block: boolean;
}

function collectComments(state: EditorState): CommentSpan[] {
  const out: CommentSpan[] = [];
  const doc = state.doc;
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'Comment' && node.name !== 'CommentBlock') return;
      const block = node.name === 'CommentBlock';
      let tagText: string | null = null;
      let child = node.node.firstChild;
      let markCount = 0;
      while (child) {
        if (child.name === 'CommentMark') markCount++;
        else if (child.name === 'CommentTag') {
          const raw = doc.sliceString(child.from, child.to).trim();
          tagText = raw.replace(/^@/, '').replace(/:$/, '').toLowerCase();
        }
        child = child.nextSibling;
      }
      if (markCount < 2) return;
      out.push({ from: node.from, to: node.to, tagText, block });
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
  const spans = collectComments(state);
  for (const span of spans) {
    const cursorTouches = rangeTouchesActiveLine(state, span.from, span.to);
    const tagClass = tagClassFragment(span.tagText);
    if (cursorTouches && !isWysiwygMode(state)) {
      // Active line: render the source as-is, just give the range a faint
      // highlight so the user sees the memo they're editing. No replace, no
      // chat icon — they're inside the markdown.
      ranges.push(
        Decoration.mark({ class: `cm-memo-active cm-memo-active-${tagClass}` }).range(
          span.from,
          span.to,
        ),
      );
      continue;
    }
    // Off-line: hide the whole `%% … %%` range with a single zero-width
    // replacement, then drop a chat icon at the line-end (after the closing
    // `%%`). For block-form memos this means the icon lands at the end of
    // the closing-`%%` line.
    ranges.push(
      Decoration.replace({ widget: new ZeroWidthWidget(), block: false }).range(
        span.from,
        span.to,
      ),
    );
    ranges.push(
      Decoration.widget({
        widget: new ChatIconWidget(span.tagText, span.from),
        side: 1,
      }).range(span.to),
    );
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(ranges, true);
}

const commentField = StateField.define<DecorationSet>({
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

export function commentDecoration(): Extension {
  return [userActiveField, commentField];
}

export const commentTheme = EditorView.theme({
  '.cm-memo-chat-icon': {
    display: 'inline-block',
    fontSize: '0.85em',
    padding: '0 4px',
    marginLeft: '4px',
    borderRadius: '8px',
    cursor: 'pointer',
    userSelect: 'none',
    background: 'var(--cm-memo-chat-other-bg, rgba(180, 180, 180, 0.25))',
    verticalAlign: 'middle',
  },
  '.cm-memo-chat-icon:hover': {
    filter: 'brightness(0.95)',
  },
  '.cm-memo-chat-icon-ai': {
    background: 'var(--cm-memo-chat-ai-bg, rgba(64, 124, 220, 0.25))',
  },
  '.cm-memo-chat-icon-todo': {
    background: 'var(--cm-memo-chat-todo-bg, rgba(228, 137, 36, 0.30))',
  },
  '.cm-memo-chat-icon-reviewer': {
    background: 'var(--cm-memo-chat-reviewer-bg, rgba(46, 160, 67, 0.30))',
  },
  '.cm-memo-chat-icon-stats': {
    background: 'var(--cm-memo-chat-stats-bg, rgba(140, 80, 200, 0.25))',
  },
  '.cm-memo-chat-icon-other, .cm-memo-chat-icon-untagged': {
    background: 'var(--cm-memo-chat-other-bg, rgba(180, 180, 180, 0.25))',
  },
  '.cm-memo-active': {
    background: 'var(--cm-memo-active-bg, rgba(255, 235, 130, 0.25))',
    borderRadius: '3px',
  },
  '.cm-memo-active-ai': {
    background: 'var(--cm-memo-active-ai-bg, rgba(64, 124, 220, 0.15))',
  },
  '.cm-memo-active-todo': {
    background: 'var(--cm-memo-active-todo-bg, rgba(228, 137, 36, 0.18))',
  },
  '.cm-memo-active-reviewer': {
    background: 'var(--cm-memo-active-reviewer-bg, rgba(46, 160, 67, 0.18))',
  },
  '.cm-memo-active-stats': {
    background: 'var(--cm-memo-active-stats-bg, rgba(140, 80, 200, 0.18))',
  },
});
