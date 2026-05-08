import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ContextMenu, type ContextMenuItem } from '../../src/components/sidebar/ContextMenu';

interface Mounted {
  root: Root;
  container: HTMLDivElement;
  unmount: () => void;
}

function mount(items: ContextMenuItem[], onClose: () => void): Mounted {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ContextMenu x={50} y={60} items={items} onClose={onClose} />);
  });
  return {
    root,
    container,
    unmount: () => {
      act(() => { root.unmount(); });
      container.remove();
    },
  };
}

afterEach(() => {
  // Belt-and-suspenders: tear down any leftover menu DOM between tests.
  for (const m of Array.from(document.querySelectorAll('[data-testid="cm-context-menu"]'))) {
    m.remove();
  }
});

describe('ContextMenu', () => {
  it('renders all non-separator items as menuitems', () => {
    const onClose = vi.fn();
    const items: ContextMenuItem[] = [
      { id: 'a', label: 'Alpha' },
      { id: 'sep', label: '', separator: true },
      { id: 'b', label: 'Beta' },
    ];
    const m = mount(items, onClose);
    const menu = m.container.querySelector('[data-testid="cm-context-menu"]');
    expect(menu).not.toBeNull();
    const rows = menu!.querySelectorAll('[role="menuitem"]');
    expect(rows.length).toBe(2);
    expect(rows[0]!.textContent).toBe('Alpha');
    expect(rows[1]!.textContent).toBe('Beta');
    const sep = menu!.querySelectorAll('[role="separator"]');
    expect(sep.length).toBe(1);
    m.unmount();
  });

  it('invokes onSelect for the clicked item and then onClose', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const items: ContextMenuItem[] = [
      { id: 'a', label: 'Alpha', onSelect },
      { id: 'b', label: 'Beta' },
    ];
    const m = mount(items, onClose);
    const row = m.container.querySelector('[data-menu-id="a"]') as HTMLElement;
    expect(row).not.toBeNull();
    act(() => { row.click(); });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    m.unmount();
  });

  it('does NOT invoke onSelect for disabled items', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const items: ContextMenuItem[] = [
      { id: 'a', label: 'Alpha', onSelect, disabled: true },
    ];
    const m = mount(items, onClose);
    const row = m.container.querySelector('[data-menu-id="a"]') as HTMLElement;
    act(() => { row.click(); });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    m.unmount();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    const m = mount([{ id: 'a', label: 'Alpha' }], onClose);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    m.unmount();
  });

  it('closes on outside mousedown', () => {
    const onClose = vi.fn();
    const m = mount([{ id: 'a', label: 'Alpha' }], onClose);
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    act(() => {
      outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    outside.remove();
    m.unmount();
  });

  it('does NOT close on inside mousedown', () => {
    const onClose = vi.fn();
    const m = mount([{ id: 'a', label: 'Alpha' }], onClose);
    const row = m.container.querySelector('[data-menu-id="a"]') as HTMLElement;
    act(() => {
      row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
    m.unmount();
  });

  it('removes its document listeners on unmount', () => {
    const onClose = vi.fn();
    const m = mount([{ id: 'a', label: 'Alpha' }], onClose);
    m.unmount();
    // After unmount, Escape must NOT trigger another onClose.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
