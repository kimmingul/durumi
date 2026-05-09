import { syntaxTree } from '@codemirror/language';
import { EditorState, Extension, Range, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { getActiveLineRange, hasActiveLine, userActiveField } from './activeLine';

/**
 * Live decoration for `%%` memos. Both inline and block forms get a colored
 * sticky-note style; `%%` markers and the optional `@tag` are hidden behind
 * a chip widget when the caret is off the line so a paragraph reads cleanly,
 * but the source becomes visible the moment the caret lands on the run.
 *
 * The chip widget colors itself per known tag (`@ai`, `@todo`, `@reviewer`,
 * `@stats`) — see the theme's CSS variables — and falls back to a neutral
 * style for arbitrary tags or untagged memos.
 */
class HiddenMarkerWidget extends WidgetType {
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-md-marker-hidden';
    return s;
  }
  ignoreEvent() { return true; }
}

class CommentTagChipWidget extends WidgetType {
  constructor(private readonly tag: string) {
    super();
  }
  eq(other: WidgetType) {
    return other instanceof CommentTagChipWidget && other.tag === this.tag;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = `cm-md-comment-chip cm-md-comment-chip-${tagClassFragment(this.tag)}`;
    span.textContent = `@${this.tag}`;
    return span;
  }
  ignoreEvent() { return false; }
}

const KNOWN_TAGS = new Set(['ai', 'todo', 'reviewer', 'stats']);

function tagClassFragment(tag: string): string {
  return KNOWN_TAGS.has(tag) ? tag : 'other';
}

interface CommentSpan {
  from: number;
  to: number;
  tagFrom: number | null;
  tagTo: number | null;
  tagText: string | null;
  /** Range of the opening `%%` marker. */
  openFrom: number;
  openTo: number;
  /** Range of the closing `%%` marker. */
  closeFrom: number;
  closeTo: number;
  block: boolean;
}

function collectComments(state: EditorState): CommentSpan[] {
  const out: CommentSpan[] = [];
  const doc = state.doc;
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'Comment' && node.name !== 'CommentBlock') return;
      const block = node.name === 'CommentBlock';
      let openFrom = node.from;
      let openTo = node.from;
      let closeFrom = node.to;
      let closeTo = node.to;
      let tagFrom: number | null = null;
      let tagTo: number | null = null;
      let tagText: string | null = null;
      let child = node.node.firstChild;
      const marks: Array<{ from: number; to: number }> = [];
      while (child) {
        if (child.name === 'CommentMark') {
          marks.push({ from: child.from, to: child.to });
        } else if (child.name === 'CommentTag') {
          tagFrom = child.from;
          tagTo = child.to;
          const raw = doc.sliceString(child.from, child.to).trim();
          // Strip leading `@` and any trailing `:`.
          tagText = raw.replace(/^@/, '').replace(/:$/, '').toLowerCase();
        }
        child = child.nextSibling;
      }
      if (marks.length >= 2) {
        openFrom = marks[0].from;
        openTo = marks[0].to;
        closeFrom = marks[marks.length - 1].from;
        closeTo = marks[marks.length - 1].to;
      } else if (marks.length === 1) {
        // Unbalanced — only an opening mark. Skip rendering.
        return;
      }
      out.push({
        from: node.from,
        to: node.to,
        tagFrom,
        tagTo,
        tagText,
        openFrom,
        openTo,
        closeFrom,
        closeTo,
        block,
      });
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
    const tagClass = span.tagText ? tagClassFragment(span.tagText) : 'untagged';
    const baseClass = `cm-md-comment cm-md-comment-${tagClass}`;
    if (cursorTouches) {
      // Source mode — keep markers + tag visible, just dim them and color
      // the body so the user knows what they're editing.
      ranges.push(Decoration.mark({ class: 'cm-md-comment-mark' }).range(span.openFrom, span.openTo));
      if (span.tagFrom !== null && span.tagTo !== null) {
        ranges.push(Decoration.mark({ class: `cm-md-comment-tag-source cm-md-comment-tag-${tagClass}` }).range(span.tagFrom, span.tagTo));
      }
      ranges.push(Decoration.mark({ class: 'cm-md-comment-mark' }).range(span.closeFrom, span.closeTo));
      const bodyFrom = span.tagTo ?? span.openTo;
      const bodyTo = span.closeFrom;
      if (bodyTo > bodyFrom) {
        ranges.push(Decoration.mark({ class: baseClass }).range(bodyFrom, bodyTo));
      }
      continue;
    }
    // Off-line: hide opening `%%`, replace tag with a colored chip widget,
    // mark the body, hide closing `%%`.
    ranges.push(
      Decoration.replace({ widget: new HiddenMarkerWidget() }).range(span.openFrom, span.openTo),
    );
    if (span.tagFrom !== null && span.tagTo !== null && span.tagText) {
      ranges.push(
        Decoration.replace({ widget: new CommentTagChipWidget(span.tagText) }).range(span.tagFrom, span.tagTo),
      );
    }
    const bodyFrom = span.tagTo ?? span.openTo;
    const bodyTo = span.closeFrom;
    if (bodyTo > bodyFrom) {
      ranges.push(Decoration.mark({ class: baseClass }).range(bodyFrom, bodyTo));
    }
    ranges.push(
      Decoration.replace({ widget: new HiddenMarkerWidget() }).range(span.closeFrom, span.closeTo),
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
    if (tr.docChanged || tr.selection) return buildDecorations(tr.state);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function commentDecoration(): Extension {
  return [userActiveField, commentField];
}

export const commentTheme = EditorView.theme({
  '.cm-md-comment': {
    background: 'var(--cm-comment-bg, rgba(255, 235, 130, 0.35))',
    borderRadius: '3px',
    padding: '0 2px',
  },
  '.cm-md-comment-mark': {
    color: 'var(--cm-comment-mark, rgba(120, 110, 0, 0.55))',
    opacity: '0.6',
  },
  '.cm-md-comment-tag-source': {
    fontWeight: '600',
  },
  // Tag-specific tints: ai = blue, todo = orange, reviewer = green, stats = purple, other = gray.
  '.cm-md-comment-ai': {
    background: 'var(--cm-comment-ai-bg, rgba(64, 124, 220, 0.18))',
  },
  '.cm-md-comment-tag-ai': {
    color: 'var(--cm-comment-ai-fg, #2553a0)',
  },
  '.cm-md-comment-todo': {
    background: 'var(--cm-comment-todo-bg, rgba(228, 137, 36, 0.20))',
  },
  '.cm-md-comment-tag-todo': {
    color: 'var(--cm-comment-todo-fg, #a55c15)',
  },
  '.cm-md-comment-reviewer': {
    background: 'var(--cm-comment-reviewer-bg, rgba(46, 160, 67, 0.20))',
  },
  '.cm-md-comment-tag-reviewer': {
    color: 'var(--cm-comment-reviewer-fg, #1f7a35)',
  },
  '.cm-md-comment-stats': {
    background: 'var(--cm-comment-stats-bg, rgba(140, 80, 200, 0.20))',
  },
  '.cm-md-comment-tag-stats': {
    color: 'var(--cm-comment-stats-fg, #6a3f9c)',
  },
  '.cm-md-comment-other, .cm-md-comment-untagged': {
    background: 'var(--cm-comment-bg, rgba(180, 180, 180, 0.20))',
  },
  '.cm-md-comment-tag-other': {
    color: 'var(--cm-comment-other-fg, #555)',
  },
  '.cm-md-comment-chip': {
    fontFamily: 'var(--cm-mono, ui-monospace, monospace)',
    fontSize: '0.78em',
    padding: '0 5px',
    borderRadius: '8px',
    marginRight: '3px',
    fontWeight: '600',
    background: 'var(--cm-comment-chip-bg, rgba(180, 180, 180, 0.30))',
    color: 'var(--cm-comment-chip-fg, #444)',
    cursor: 'default',
  },
  '.cm-md-comment-chip-ai': {
    background: 'rgba(64, 124, 220, 0.25)',
    color: '#1c3e7a',
  },
  '.cm-md-comment-chip-todo': {
    background: 'rgba(228, 137, 36, 0.30)',
    color: '#7a420f',
  },
  '.cm-md-comment-chip-reviewer': {
    background: 'rgba(46, 160, 67, 0.30)',
    color: '#15522a',
  },
  '.cm-md-comment-chip-stats': {
    background: 'rgba(140, 80, 200, 0.25)',
    color: '#4d2a78',
  },
});
