import { useEffect, useMemo, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import type { Comment } from '@shared/comments';
import { memoIdFor, type MemoMeta } from '@shared/memoSidecar';
import type { MemoGroupBy } from '@shared/ipc-contract';
import { useDocComments } from '../hooks/useDocComments';
import { useMemoPanelStore } from '../store/memoPanelStore';
import { useMemoSidecarStore } from '../store/memoSidecarStore';
import { MemoCard } from './MemoCard';
import { t, useLanguage } from '../i18n/t';

interface MemoPanelProps {
  view: EditorView | null;
  content: string;
  visible: boolean;
  onClose: () => void;
}

interface MemoGroup {
  key: string;
  label: string;
  memos: Comment[];
}

/**
 * Right-side memo column. Shows one card per `%% memo %%` in the document.
 *
 * Rendering modes (driven by the group-by dropdown):
 *  - "line" (default): cards are absolutely positioned, line-aligned to the
 *    source via `view.coordsAtPos(memo.from)`. Matches v0.1.3 behavior.
 *  - "tag" / "author" / "status": cards stack in natural flex flow under
 *    section dividers; line alignment is dropped because it can't survive
 *    arbitrary reordering.
 *
 * Visibility logic lives in `App.tsx` (auto-show when ≥1 memo + manual
 * override). This component just renders or returns null based on `visible`.
 */
export function MemoPanel({ view, content, visible, onClose }: MemoPanelProps) {
  useLanguage();
  const memos = useDocComments(content);
  const width = useMemoPanelStore((s) => s.width);
  const setWidth = useMemoPanelStore((s) => s.setWidth);
  const focusedFrom = useMemoPanelStore((s) => s.focusedFrom);
  const setFocusedFrom = useMemoPanelStore((s) => s.setFocusedFrom);
  const sidecar = useMemoSidecarStore((s) => s.sidecar);

  // Panel-local UI state that's persisted via prefs (initial values come from
  // `prefs.memoPanel`; updates write back through the same channel).
  const [groupBy, setGroupBy] = useState<MemoGroupBy>('line');
  const [hideResolved, setHideResolved] = useState(true);

  // Force a re-render when the editor scrolls or selection changes so card
  // positions track. We don't store the layout state — we recompute on each
  // render via `view.coordsAtPos`.
  const [, setLayoutTick] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const stackRef = useRef<HTMLDivElement | null>(null);

  // Pull initial groupBy + hideResolved from prefs once on mount.
  useEffect(() => {
    let cancelled = false;
    void window.api.prefsGet().then((prefs) => {
      if (cancelled) return;
      if (prefs.memoPanel?.groupBy) setGroupBy(prefs.memoPanel.groupBy);
      if (typeof prefs.memoPanel?.hideResolvedDefault === 'boolean') {
        setHideResolved(prefs.memoPanel.hideResolvedDefault);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Recompute card positions when the editor scrolls/resizes/has selection
  // changes — anything that would shift `coordsAtPos` results.
  useEffect(() => {
    if (!view) return;
    const recompute = () => setLayoutTick((n) => n + 1);
    const scroller = view.scrollDOM;
    scroller.addEventListener('scroll', recompute, { passive: true });
    window.addEventListener('resize', recompute);
    // CodeMirror dispatches a `geometry` measure event after layout; subscribe
    // via a plain interval as a safety net (cheap, only while panel mounted).
    const id = window.setInterval(recompute, 250);
    return () => {
      scroller.removeEventListener('scroll', recompute);
      window.removeEventListener('resize', recompute);
      window.clearInterval(id);
    };
  }, [view]);

  // Persist width — debounced inline.
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void window.api.prefsSet({ memoPanel: { width, hideResolvedDefault: hideResolved, groupBy } });
    }, 500);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [width, hideResolved, groupBy]);

  // Drag-to-resize from the LEFT edge (panel grows toward the editor).
  const dragStartX = useRef<number | null>(null);
  const dragStartWidth = useRef<number>(width);
  function onResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragStartX.current = e.clientX;
    dragStartWidth.current = width;
    const onMove = (ev: MouseEvent) => {
      if (dragStartX.current == null) return;
      const dx = ev.clientX - dragStartX.current;
      // Dragging LEFT (dx negative) widens the right-side panel.
      setWidth(dragStartWidth.current - dx);
    };
    const onUp = () => {
      dragStartX.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Apply the hide-resolved filter once for both rendering paths.
  const visibleMemos = useMemo(() => {
    if (!hideResolved) return memos;
    return memos.filter((m) => !sidecar.memos[memoIdFor(m)]?.resolved);
  }, [memos, hideResolved, sidecar]);

  // Build groups for non-line modes. Sorted within group by line number to
  // keep a stable reading order.
  const groups: MemoGroup[] = useMemo(() => {
    if (groupBy === 'line' || visibleMemos.length === 0) return [];
    return groupMemos(visibleMemos, groupBy, sidecar.memos);
  }, [groupBy, visibleMemos, sidecar]);

  if (!visible) return null;

  // Compute each card's vertical position for "line" mode. Cards stack
  // vertically; if two memos resolve to overlapping slots, push the later
  // one down by the previous card's measured height (we use a 64 px
  // conservative minimum so we don't have to mount-then-measure on first
  // paint).
  const MIN_CARD_GAP = 8;
  const MIN_CARD_HEIGHT = 64;
  const stackTopOffset = stackRef.current?.getBoundingClientRect().top ?? 0;
  let prevBottom = -Infinity;
  const positions = visibleMemos.map((memo) => {
    let top = 0;
    if (view) {
      const coords = view.coordsAtPos(memo.from);
      if (coords) {
        top = Math.max(0, Math.round(coords.top - stackTopOffset));
      }
    }
    if (top < prevBottom + MIN_CARD_GAP) top = prevBottom + MIN_CARD_GAP;
    prevBottom = top + MIN_CARD_HEIGHT;
    return top;
  });

  return (
    <>
      <div
        className="cm-memo-panel-resizer"
        onMouseDown={onResizeMouseDown}
        role="separator"
        aria-orientation="vertical"
      />
      <aside
        ref={panelRef}
        className="cm-memo-panel"
        style={{ width: `${width}px` }}
        aria-label={t('memo.panel.title')}
      >
        <div className="cm-memo-panel-header">
          <span className="cm-memo-panel-title">{t('memo.panel.title')}</span>
          <span className="cm-memo-panel-count">{visibleMemos.length}</span>
          <button
            type="button"
            className="cm-memo-panel-close"
            onClick={onClose}
            title={t('memo.panel.close')}
            aria-label={t('memo.panel.close')}
          >
            ×
          </button>
        </div>
        <div className="cm-memo-panel-controls">
          <label className="cm-memo-panel-groupby">
            <span className="cm-memo-panel-groupby-label">
              {t('memo.panel.groupBy.label')}
            </span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as MemoGroupBy)}
              data-testid="memo-panel-groupby"
            >
              <option value="line">{t('memo.panel.groupBy.line')}</option>
              <option value="tag">{t('memo.panel.groupBy.tag')}</option>
              <option value="author">{t('memo.panel.groupBy.author')}</option>
              <option value="status">{t('memo.panel.groupBy.status')}</option>
            </select>
          </label>
          <label className="cm-memo-panel-hideresolved">
            <input
              type="checkbox"
              checked={hideResolved}
              onChange={(e) => setHideResolved(e.target.checked)}
              data-testid="memo-panel-hide-resolved"
            />
            <span>{t('memo.panel.hideResolved')}</span>
          </label>
        </div>
        <div className="cm-memo-panel-body" ref={stackRef}>
          {visibleMemos.length === 0 ? (
            <div className="cm-memo-panel-empty">{t('memo.panel.empty')}</div>
          ) : groupBy === 'line' ? (
            visibleMemos.map((memo, idx) => (
              <MemoCard
                key={`${memo.from}-${memo.to}`}
                memo={memo}
                view={view}
                topPx={positions[idx]}
                focused={focusedFrom === memo.from}
                onFocusHandled={() => setFocusedFrom(null)}
              />
            ))
          ) : (
            groups.map((group) => (
              <section
                key={group.key}
                className="cm-memo-panel-group"
                data-testid={`memo-panel-group-${group.key}`}
              >
                <header className="cm-memo-panel-group-header">
                  <span className="cm-memo-panel-group-label">{group.label}</span>
                  <span className="cm-memo-panel-group-count">{group.memos.length}</span>
                </header>
                <div className="cm-memo-panel-group-cards">
                  {group.memos.map((memo) => (
                    <MemoCard
                      key={`${memo.from}-${memo.to}`}
                      memo={memo}
                      view={view}
                      topPx={null}
                      focused={focusedFrom === memo.from}
                      onFocusHandled={() => setFocusedFrom(null)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </aside>
    </>
  );
}

/**
 * Build the group list for `groupBy ∈ {tag, author, status}`. Sort within
 * each group by line number for a stable reading order; sort groups
 * themselves by label so the panel doesn't shuffle on every keystroke.
 */
function groupMemos(
  memos: readonly Comment[],
  groupBy: MemoGroupBy,
  metas: Record<string, MemoMeta>,
): MemoGroup[] {
  const buckets = new Map<string, Comment[]>();

  function keyFor(memo: Comment): { key: string; label: string } {
    const meta = metas[memoIdFor(memo)];
    if (groupBy === 'tag') {
      const tag = memo.tag;
      return tag
        ? { key: `tag:${tag}`, label: `@${tag}` }
        : { key: 'tag:__none__', label: t('memo.panel.group.untagged') };
    }
    if (groupBy === 'author') {
      const author = meta?.createdBy ?? '';
      const safe = author.length > 0 ? author : t('memo.panel.group.unknownAuthor');
      return { key: `author:${safe}`, label: safe };
    }
    // status
    const resolved = meta?.resolved ?? false;
    return resolved
      ? { key: 'status:resolved', label: t('memo.panel.group.statusResolved') }
      : { key: 'status:open', label: t('memo.panel.group.statusOpen') };
  }

  const labels = new Map<string, string>();
  for (const memo of memos) {
    const { key, label } = keyFor(memo);
    labels.set(key, label);
    const arr = buckets.get(key) ?? [];
    arr.push(memo);
    buckets.set(key, arr);
  }
  const out: MemoGroup[] = [];
  for (const [key, list] of buckets.entries()) {
    list.sort((a, b) => a.line - b.line);
    out.push({ key, label: labels.get(key) ?? key, memos: list });
  }
  // Status grouping uses a fixed open-first order; everything else sorts by
  // label so the panel is deterministic.
  if (groupBy === 'status') {
    out.sort((a, b) => (a.key === 'status:open' ? -1 : b.key === 'status:open' ? 1 : 0));
  } else {
    out.sort((a, b) => a.label.localeCompare(b.label));
  }
  return out;
}
