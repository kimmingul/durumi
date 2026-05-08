import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  /** Stable id used by tests and keyboard navigation. */
  id: string;
  label: string;
  /** Set to true to grey-out the row and ignore clicks. */
  disabled?: boolean;
  /** When true, render a horizontal divider INSTEAD of a clickable row. */
  separator?: boolean;
  onSelect?: () => void;
}

export interface ContextMenuProps {
  /** Viewport coordinates (clientX/clientY) of the mouse-down that opened the menu. */
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/**
 * Lightweight contextual menu rendered in the renderer (React) instead of via
 * Electron's main-process Menu. Closes on Esc, click outside, blur, or item
 * activation. Keep this dumb — callers own the action set and any state that
 * outlives a single open/close cycle (e.g. inline rename).
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on Esc, click outside, scroll, or window blur. We listen on the
  // capture phase so an item's onClick still fires before we tear down.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    function onDown(e: MouseEvent) {
      const node = ref.current;
      if (!node) return;
      if (e.target instanceof Node && node.contains(e.target)) return;
      onClose();
    }
    function onScroll() { onClose(); }
    function onBlur() { onClose(); }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  // Clamp the menu to the viewport so opening near the edge doesn't render it
  // off-screen. We do this on mount once — the menu size is stable.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x;
    let ny = y;
    if (nx + rect.width > vw - 4) nx = Math.max(4, vw - rect.width - 4);
    if (ny + rect.height > vh - 4) ny = Math.max(4, vh - rect.height - 4);
    node.style.left = `${nx}px`;
    node.style.top = `${ny}px`;
  }, [x, y]);

  return (
    <div
      ref={ref}
      className="cm-context-menu"
      role="menu"
      data-testid="cm-context-menu"
      style={{ position: 'fixed', left: x, top: y, zIndex: 1000 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={`sep-${i}`} className="cm-context-menu-sep" role="separator" />;
        }
        const cls =
          'cm-context-menu-item' + (item.disabled ? ' cm-context-menu-item-disabled' : '');
        return (
          <div
            key={item.id}
            className={cls}
            role="menuitem"
            data-menu-id={item.id}
            aria-disabled={item.disabled || undefined}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect?.();
              onClose();
            }}
          >
            {item.label}
          </div>
        );
      })}
    </div>
  );
}
