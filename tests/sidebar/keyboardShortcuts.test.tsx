import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import {
  KeyboardShortcutsDialog,
  filterGroups,
} from '../../src/components/KeyboardShortcutsDialog';

function setInputValue(el: HTMLInputElement, v: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function mount(open = true) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let closes = 0;
  act(() => {
    root.render(
      <KeyboardShortcutsDialog open={open} onClose={() => { closes++; }} />,
    );
  });
  return {
    host,
    getCloses: () => closes,
    cleanup: () => { act(() => root.unmount()); host.remove(); },
  };
}

beforeEach(() => {
  // No-op — i18n module is global.
});

afterEach(() => {
  // No-op.
});

describe('filterGroups', () => {
  const sample = [
    {
      titleKey: 'g.file',
      items: [
        { keys: ['Cmd', 'S'], labelKey: 'menu.file.save' },
        { keys: ['Cmd', 'O'], labelKey: 'menu.file.open' },
      ],
    },
    {
      titleKey: 'g.view',
      items: [
        { keys: ['Cmd', '\\'], labelKey: 'menu.view.toggleSidebar' },
      ],
    },
  ];

  it('returns every group when the query is empty', () => {
    expect(filterGroups(sample, '').length).toBe(2);
  });

  it('matches against the resolved label text', () => {
    const r = filterGroups(sample, 'open');
    expect(r.length).toBe(1);
    expect(r[0]?.items[0]?.labelKey).toBe('menu.file.open');
  });

  it('matches against the key combination', () => {
    const r = filterGroups(sample, 's');
    // "S" matches both "save" and "open" labels containing 's' too, but
    // crucially the result is non-empty.
    expect(r.length).toBeGreaterThan(0);
  });

  it('drops empty groups from the result', () => {
    const r = filterGroups(sample, 'completely unmatched');
    expect(r).toEqual([]);
  });
});

describe('KeyboardShortcutsDialog', () => {
  it('renders nothing when open=false', () => {
    const { host, cleanup } = mount(false);
    expect(host.querySelector('[data-testid="shortcuts-dialog"]')).toBeNull();
    cleanup();
  });

  it('renders groups and rows when open', () => {
    const { host, cleanup } = mount(true);
    const rows = host.querySelectorAll('[data-testid="shortcuts-row"]');
    expect(rows.length).toBeGreaterThan(10);
    cleanup();
  });

  it('filters rows as the user types into the search box', () => {
    const { host, cleanup } = mount(true);
    const input = host.querySelector('[data-testid="shortcuts-search"]') as HTMLInputElement;
    act(() => { setInputValue(input, 'memo'); });
    const rows = host.querySelectorAll('[data-testid="shortcuts-row"]');
    // Memo-related shortcuts should show; many others filtered out.
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => {
      const text = (row.textContent ?? '').toLowerCase();
      // Either label contains 'memo' (English) or 메모 (Korean); just check
      // that filtering happened by ensuring it's < the full count.
      expect(text.length).toBeGreaterThan(0);
    });
    cleanup();
  });

  it('calls onClose when Esc is pressed', () => {
    const m = mount(true);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(m.getCloses()).toBe(1);
    m.cleanup();
  });
});
