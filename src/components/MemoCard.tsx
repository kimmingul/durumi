import { useEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import type { Comment } from '@shared/comments';
import { useMemoSync } from '../hooks/useMemoSync';
import { t, useLanguage } from '../i18n/t';

interface MemoCardProps {
  memo: Comment;
  view: EditorView | null;
  /** Vertical offset in CSS px from the panel's top, anchored to the memo line. */
  topPx: number;
  focused: boolean;
  onFocusHandled: () => void;
}

const KNOWN_TAGS = ['ai', 'todo', 'reviewer', 'stats'] as const;
type KnownTag = (typeof KNOWN_TAGS)[number];

function tagClassFragment(tag: string | null): string {
  if (!tag) return 'untagged';
  return (KNOWN_TAGS as readonly string[]).includes(tag) ? tag : 'other';
}

/**
 * Card for a single `%% memo %%`. Owns its local form state and pushes
 * changes back to the source via `useMemoSync` (300 ms debounce).
 *
 * Tag UI: a native `<select>` with the canonical four chips, a "no tag"
 * option, and a "custom…" escape hatch that prompts for a free-form tag.
 *
 * Delete: dispatches a transaction that removes `[memo.from, memo.to]`. For
 * block memos that occupied a line on their own we also consume one trailing
 * newline so the document doesn't keep a blank line where the block stood —
 * matches what `stripComments` does in the export pipeline.
 */
export function MemoCard({ memo, view, topPx, focused, onFocusHandled }: MemoCardProps) {
  useLanguage();
  const [body, setBody] = useState<string>(memo.text);
  const [tag, setTag] = useState<string | null>(memo.tag);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // When the underlying memo changes (someone edited the source), pull the
  // new values into local state.
  useEffect(() => {
    setBody(memo.text);
    setTag(memo.tag);
  }, [memo.from, memo.to, memo.text, memo.tag]);

  // Two-way binding to the editor source.
  useMemoSync({ view, memo, localBody: body, localTag: tag });

  // Auto-grow the textarea to fit content.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [body]);

  // Pulse + scroll into view when focused.
  useEffect(() => {
    if (!focused) return;
    const el = cardRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    el.classList.add('cm-memo-card-pulse');
    const id = setTimeout(() => {
      el.classList.remove('cm-memo-card-pulse');
      onFocusHandled();
    }, 800);
    return () => clearTimeout(id);
  }, [focused, onFocusHandled]);

  function handleTagChange(value: string) {
    if (value === '__custom__') {
      const raw = window.prompt(t('memo.card.customTagPrompt'), tag ?? '');
      if (raw === null) return; // cancelled
      const trimmed = raw.trim().replace(/^@+/, '');
      setTag(trimmed.length > 0 ? trimmed.toLowerCase() : null);
      return;
    }
    if (value === '__none__') {
      setTag(null);
      return;
    }
    setTag(value);
  }

  function handleDelete() {
    if (!view) return;
    const src = view.state.doc.toString();
    let to = memo.to;
    if (memo.block && src[to] === '\n') to += 1;
    view.dispatch({
      changes: { from: memo.from, to, insert: '' },
      userEvent: 'delete.memo',
    });
  }

  const tagClass = tagClassFragment(tag);
  // Build the dropdown's selected value: known tags map to themselves; an
  // arbitrary custom tag still selects "__custom__" semantically but we want
  // the dropdown to display it as the "custom (current)" entry.
  const isKnown = tag !== null && (KNOWN_TAGS as readonly string[]).includes(tag);
  const selectValue = tag === null ? '__none__' : isKnown ? tag : '__custom_current__';

  return (
    <div
      ref={cardRef}
      className={`cm-memo-card cm-memo-card-${tagClass}`}
      style={{ position: 'absolute', left: 0, right: 0, top: `${topPx}px` }}
      data-memo-from={memo.from}
    >
      <div className="cm-memo-card-header">
        <select
          className={`cm-memo-card-tag cm-memo-card-tag-${tagClass}`}
          value={selectValue}
          onChange={(e) => handleTagChange(e.target.value)}
          aria-label="memo tag"
        >
          {(KNOWN_TAGS as readonly KnownTag[]).map((k) => (
            <option key={k} value={k}>{`@${k}`}</option>
          ))}
          {!isKnown && tag !== null && (
            <option value="__custom_current__">{`@${tag}`}</option>
          )}
          <option value="__none__">{t('memo.card.tagPlaceholder')}</option>
          <option value="__custom__">{t('memo.card.customTag')}</option>
        </select>
        <span className="cm-memo-card-line">L{memo.line}</span>
        <button
          type="button"
          className="cm-memo-card-delete"
          onClick={handleDelete}
          title={t('memo.card.delete')}
          aria-label={t('memo.card.delete')}
        >
          ✕
        </button>
      </div>
      <textarea
        ref={textareaRef}
        className="cm-memo-card-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={1}
        placeholder={t('memo.card.bodyPlaceholder')}
        spellCheck={false}
      />
    </div>
  );
}
