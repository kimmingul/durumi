import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/t';

export interface TableSizePopoverProps {
  /** Anchor button DOMRect — popover positions itself just below it. */
  anchorRect: DOMRect | null;
  onClose: () => void;
  onPick: (rows: number, cols: number) => void;
}

const MAX_ROWS = 10;
const MAX_COLS = 10;

/**
 * Typora-style hover-grid table picker.
 *
 * Anchored under the toolbar's Table button. Hovering over a cell highlights
 * an `rows x cols` region; click commits. Tab and arrow keys move the
 * highlighted cell so keyboard-only users can still pick a size without a
 * mouse.
 *
 * Closes on:
 *   - Click outside the popover.
 *   - Esc.
 *   - Cell pick.
 */
export function TableSizePopover(props: TableSizePopoverProps) {
  const { anchorRect, onClose, onPick } = props;
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Click-outside + Esc.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      // Arrow-keys to navigate; Enter to commit.
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setHover((h) => ({ r: h?.r ?? 1, c: Math.min((h?.c ?? 0) + 1, MAX_COLS) }));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setHover((h) => ({ r: h?.r ?? 1, c: Math.max((h?.c ?? 2) - 1, 1) }));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHover((h) => ({ r: Math.min((h?.r ?? 0) + 1, MAX_ROWS), c: h?.c ?? 1 }));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHover((h) => ({ r: Math.max((h?.r ?? 2) - 1, 1), c: h?.c ?? 1 }));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const h = hover ?? { r: 2, c: 2 };
        onPick(h.r, h.c);
      }
    }
    // Defer mousedown listener by one tick so the click that opened the
    // popover doesn't immediately close it.
    const id = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [hover, onClose, onPick]);

  if (!anchorRect) return null;

  // Position just under the anchor, left-aligned but clamped to viewport.
  const top = anchorRect.bottom + 4;
  const left = Math.min(anchorRect.left, window.innerWidth - 280);

  const rows = Math.max(hover?.r ?? 0, 0);
  const cols = Math.max(hover?.c ?? 0, 0);

  // 10x10 grid of cells. Highlight any cell where row<=hover.r and col<=hover.c.
  const cells: React.ReactElement[] = [];
  for (let r = 1; r <= MAX_ROWS; r += 1) {
    for (let c = 1; c <= MAX_COLS; c += 1) {
      const on = r <= rows && c <= cols;
      cells.push(
        <button
          key={`${r}-${c}`}
          type="button"
          onMouseEnter={() => setHover({ r, c })}
          onClick={(e) => {
            e.stopPropagation();
            onPick(r, c);
          }}
          aria-label={t('toolbar.table.size', { rows: String(r), cols: String(c) })}
          data-testid={`table-size-cell-${r}-${c}`}
          style={{
            ...cellStyle,
            background: on ? 'var(--accent, #4a90e2)' : 'var(--code-bg, #f5f5f5)',
            borderColor: on ? 'var(--accent, #4a90e2)' : 'var(--border, #c8c8c8)',
          }}
        />,
      );
    }
  }

  return (
    <div
      ref={rootRef}
      style={{ ...popoverStyle, top, left }}
      role="dialog"
      aria-label={t('toolbar.table')}
      data-testid="table-size-popover"
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${MAX_COLS}, 18px)`,
          gridTemplateRows: `repeat(${MAX_ROWS}, 18px)`,
          gap: 2,
        }}
        onMouseLeave={() => setHover(null)}
      >
        {cells}
      </div>
      <div style={labelStyle} data-testid="table-size-label">
        {hover
          ? t('toolbar.table.size', { rows: String(hover.r), cols: String(hover.c) })
          : t('toolbar.table.hint')}
      </div>
    </div>
  );
}

const popoverStyle: React.CSSProperties = {
  position: 'fixed',
  zIndex: 9200,
  background: 'var(--bg, #fff)',
  color: 'var(--fg, #111)',
  border: '1px solid var(--border, #c8c8c8)',
  borderRadius: 6,
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const cellStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  padding: 0,
  border: '1px solid var(--border, #c8c8c8)',
  borderRadius: 2,
  cursor: 'pointer',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--muted-fg, #6a6a6a)',
  textAlign: 'center',
  minHeight: 16,
};
