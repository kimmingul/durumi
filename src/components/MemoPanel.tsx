import { useEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { useDocComments } from '../hooks/useDocComments';
import { useMemoPanelStore } from '../store/memoPanelStore';
import { MemoCard } from './MemoCard';
import { t, useLanguage } from '../i18n/t';

interface MemoPanelProps {
  view: EditorView | null;
  content: string;
  visible: boolean;
  onClose: () => void;
}

/**
 * Right-side memo column. Shows one card per `%% memo %%` in the document,
 * vertically aligned to the source line via `view.coordsAtPos(memo.from)`.
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
  // Force a re-render when the editor scrolls or selection changes so card
  // positions track. We don't store the layout state — we recompute on each
  // render via `view.coordsAtPos`.
  const [, setLayoutTick] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const stackRef = useRef<HTMLDivElement | null>(null);

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
      void window.api.prefsSet({ memoPanel: { width } });
    }, 500);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [width]);

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

  if (!visible) return null;

  // Compute each card's vertical position. Cards stack vertically; if two
  // memos resolve to overlapping slots, push the later one down by the
  // previous card's measured height (we use a 64 px conservative minimum so
  // we don't have to mount-then-measure on first paint).
  const MIN_CARD_GAP = 8;
  const MIN_CARD_HEIGHT = 64;
  const stackTopOffset = stackRef.current?.getBoundingClientRect().top ?? 0;
  let prevBottom = -Infinity;
  const positions = memos.map((memo) => {
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
          <span className="cm-memo-panel-count">{memos.length}</span>
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
        <div className="cm-memo-panel-body" ref={stackRef}>
          {memos.length === 0 ? (
            <div className="cm-memo-panel-empty">{t('memo.panel.empty')}</div>
          ) : (
            memos.map((memo, idx) => (
              <MemoCard
                key={`${memo.from}-${memo.to}`}
                memo={memo}
                view={view}
                topPx={positions[idx]}
                focused={focusedFrom === memo.from}
                onFocusHandled={() => setFocusedFrom(null)}
              />
            ))
          )}
        </div>
      </aside>
    </>
  );
}
