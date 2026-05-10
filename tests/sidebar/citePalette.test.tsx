import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { CitePalette } from '../../src/components/CitePalette';
import { useBibliographyStore } from '../../src/store/bibliographyStore';
import type { BibEntry } from '../../shared/bibtex';

function mount(props: { open: boolean; onPick?: (k: string) => void; onClose?: () => void }) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onPick = props.onPick ?? (() => {});
  const onClose = props.onClose ?? (() => {});
  act(() => {
    root.render(<CitePalette open={props.open} onPick={onPick} onClose={onClose} />);
  });
  return {
    host,
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

const e1: BibEntry = {
  key: 'smith2024deep',
  type: 'article',
  fields: { author: 'Smith, John', title: 'Deep learning radiology', year: '2024' },
};
const e2: BibEntry = {
  key: 'kim2023ai',
  type: 'article',
  fields: { author: 'Kim, Min-Gul', title: 'AI medicine', year: '2023' },
};

beforeEach(() => {
  useBibliographyStore.setState({
    filePath: '/p/references.bib',
    exists: true,
    entries: [e1, e2],
    loading: false,
  });
});

afterEach(() => {
  useBibliographyStore.setState({ filePath: null, exists: false, entries: [], loading: false });
});

describe('CitePalette', () => {
  it('renders nothing when open=false', () => {
    const { host, cleanup } = mount({ open: false });
    expect(host.querySelector('[data-testid="cite-palette"]')).toBeNull();
    cleanup();
  });

  it('shows all local entries when open with empty query', () => {
    const { host, cleanup } = mount({ open: true });
    const items = host.querySelectorAll('[data-testid="cite-palette-item"]');
    expect(items.length).toBe(2);
    cleanup();
  });

  it('filters fuzzy on the query', async () => {
    const { host, cleanup } = mount({ open: true });
    const input = host.querySelector('input') as HTMLInputElement;
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      nativeSetter.call(input, 'kim');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const items = host.querySelectorAll('[data-testid="cite-palette-item"]');
    expect(items.length).toBe(1);
    expect(items[0]!.textContent).toContain('kim2023ai');
    cleanup();
  });

  it('Enter picks the active item and closes', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    const { host, cleanup } = mount({ open: true, onPick, onClose });
    const input = host.querySelector('input') as HTMLInputElement;
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onPick).toHaveBeenCalledWith('smith2024deep');
    expect(onClose).toHaveBeenCalled();
    cleanup();
  });

  it('Escape closes without picking', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    const { host, cleanup } = mount({ open: true, onPick, onClose });
    const input = host.querySelector('input') as HTMLInputElement;
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onPick).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    cleanup();
  });

  it('shows an empty-state message when entries list is empty', () => {
    useBibliographyStore.setState({ entries: [] });
    const { host, cleanup } = mount({ open: true });
    expect(host.querySelector('.cm-quickopen-empty')).not.toBeNull();
    cleanup();
  });
});
