import { useEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import type { Comment } from '@shared/comments';
import { memoIdFor } from '@shared/memoSidecar';
import { useMemoSync } from '../hooks/useMemoSync';
import { useMemoMeta } from '../hooks/useMemoMeta';
import { useMemoSidecarStore } from '../store/memoSidecarStore';
import { relativeTime } from '../utils/relativeTime';
import { t, useLanguage } from '../i18n/t';

interface MemoCardProps {
  memo: Comment;
  view: EditorView | null;
  /**
   * Vertical offset in CSS px from the panel's top, anchored to the memo line.
   * When `null`, positioning is left to natural flex flow (used by the
   * group-by views that don't preserve line-aligned positioning).
   */
  topPx: number | null;
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
 * v0.1.4 additions:
 *  - author chip + relative time in the header
 *  - resolved checkbox alongside delete
 *  - inline reply thread + Reply/Send/Cancel composer
 *  - body strikethrough + reduced opacity when resolved
 *
 * Tag UI: a native `<select>` with the canonical four chips, a "no tag"
 * option, and a "custom…" escape hatch that prompts for a free-form tag.
 *
 * Delete: dispatches a transaction that removes `[memo.from, memo.to]`. For
 * block memos that occupied a line on their own we also consume one trailing
 * newline so the document doesn't keep a blank line where the block stood —
 * matches what `stripComments` does in the export pipeline.
 *
 * Body-edit ID migration: the action layer (the editor's own re-parse loop +
 * `App.tsx`'s `pruneOrphans` effect) handles editor-side typing. The card's
 * own debounced flush would change the memo body underneath us, so right
 * before we send the source change we compute the new id and migrate the
 * sidecar entry inline so thread/resolved/author survive the edit.
 */
export function MemoCard({ memo, view, topPx, focused, onFocusHandled }: MemoCardProps) {
  useLanguage();
  const [body, setBody] = useState<string>(memo.text);
  const [tag, setTag] = useState<string | null>(memo.tag);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const cardRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const meta = useMemoMeta(memo);
  const id = memoIdFor(memo);
  const markResolved = useMemoSidecarStore((s) => s.markResolved);
  const addReply = useMemoSidecarStore((s) => s.addReply);
  const removeReply = useMemoSidecarStore((s) => s.removeReply);
  const migrateId = useMemoSidecarStore((s) => s.migrateId);

  // When the underlying memo changes (someone edited the source), pull the
  // new values into local state.
  useEffect(() => {
    setBody(memo.text);
    setTag(memo.tag);
  }, [memo.from, memo.to, memo.text, memo.tag]);

  // Two-way binding to the editor source.
  useMemoSync({ view, memo, localBody: body, localTag: tag });

  // When the local edit settles into a different memo body, migrate the
  // sidecar entry so author/thread/resolved survive the renumber.
  useEffect(() => {
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    if (trimmed === memo.text && tag === memo.tag) return;
    const newId = memoIdFor({ text: trimmed, tag });
    if (newId === id) return;
    // The actual source flush is debounced by useMemoSync; mirror it here.
    const handle = window.setTimeout(() => {
      migrateId(id, newId);
    }, 350);
    return () => window.clearTimeout(handle);
  }, [body, tag, id, memo.text, memo.tag, migrateId]);

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

  function handleSendReply() {
    const trimmed = replyText.trim();
    if (trimmed.length === 0) return;
    addReply(id, trimmed);
    setReplyText('');
    setReplyOpen(false);
  }

  function handleCancelReply() {
    setReplyText('');
    setReplyOpen(false);
  }

  const tagClass = tagClassFragment(tag);
  // Build the dropdown's selected value: known tags map to themselves; an
  // arbitrary custom tag still selects "__custom__" semantically but we want
  // the dropdown to display it as the "custom (current)" entry.
  const isKnown = tag !== null && (KNOWN_TAGS as readonly string[]).includes(tag);
  const selectValue = tag === null ? '__none__' : isKnown ? tag : '__custom_current__';

  const positioning: React.CSSProperties =
    topPx === null
      ? { position: 'relative' }
      : { position: 'absolute', left: 0, right: 0, top: `${topPx}px` };

  return (
    <div
      ref={cardRef}
      className={`cm-memo-card cm-memo-card-${tagClass}${meta.resolved ? ' cm-memo-card-resolved' : ''}`}
      style={positioning}
      data-memo-from={memo.from}
      data-memo-id={id}
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
        <span className="cm-memo-card-author" title={meta.createdAt}>
          {meta.createdBy}
        </span>
        {meta.createdAt && (
          <span className="cm-memo-card-time" title={meta.createdAt}>
            · {relativeTime(meta.createdAt)}
          </span>
        )}
        <span className="cm-memo-card-line">L{memo.line}</span>
        <label
          className="cm-memo-card-resolved-toggle"
          title={meta.resolved ? t('memo.card.resolved') : t('memo.card.unresolved')}
        >
          <input
            type="checkbox"
            checked={meta.resolved}
            onChange={(e) => markResolved(id, e.target.checked)}
            aria-label={meta.resolved ? t('memo.card.resolved') : t('memo.card.unresolved')}
            data-testid="memo-card-resolved"
          />
        </label>
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
        className={`cm-memo-card-body${meta.resolved ? ' cm-memo-card-body-resolved' : ''}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={1}
        placeholder={t('memo.card.bodyPlaceholder')}
        spellCheck={false}
      />
      {meta.thread.length > 0 && (
        <ul className="cm-memo-card-thread" data-testid="memo-card-thread">
          {meta.thread.map((entry) => (
            <li key={entry.id} className="cm-memo-card-thread-item">
              <div className="cm-memo-card-thread-head">
                <span className="cm-memo-card-thread-author">{entry.author}</span>
                <span className="cm-memo-card-thread-time" title={entry.createdAt}>
                  · {relativeTime(entry.createdAt)}
                </span>
                <button
                  type="button"
                  className="cm-memo-card-thread-delete"
                  onClick={() => removeReply(id, entry.id)}
                  aria-label={t('memo.card.deleteReply')}
                  title={t('memo.card.deleteReply')}
                >
                  ×
                </button>
              </div>
              <div className="cm-memo-card-thread-text">{entry.text}</div>
            </li>
          ))}
        </ul>
      )}
      {replyOpen ? (
        <div className="cm-memo-card-reply">
          <textarea
            className="cm-memo-card-reply-input"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={t('memo.card.reply.placeholder')}
            rows={2}
            data-testid="memo-card-reply-input"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSendReply();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancelReply();
              }
            }}
          />
          <div className="cm-memo-card-reply-actions">
            <button
              type="button"
              className="cm-memo-card-reply-send"
              onClick={handleSendReply}
              disabled={replyText.trim().length === 0}
              data-testid="memo-card-reply-send"
            >
              {t('memo.card.reply.send')}
            </button>
            <button
              type="button"
              className="cm-memo-card-reply-cancel"
              onClick={handleCancelReply}
            >
              {t('memo.card.reply.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="cm-memo-card-reply-open"
          onClick={() => setReplyOpen(true)}
          data-testid="memo-card-reply-open"
        >
          {t('memo.card.reply.button')}
        </button>
      )}
    </div>
  );
}
