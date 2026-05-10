import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { ReferencesTab } from '../../src/components/sidebar/ReferencesTab';
import { useBibliographyStore } from '../../src/store/bibliographyStore';
import type { BibEntry } from '../../shared/bibtex';

// React tracks input/select values internally; bypassing the synthetic
// onChange via direct .value writes leaves React out of sync. Use the
// native setter + bubble an event so the controlled component re-renders.
function setInputValue(el: HTMLInputElement | HTMLSelectElement, v: string, evt: 'input' | 'change') {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  nativeSetter.call(el, v);
  el.dispatchEvent(new Event(evt, { bubbles: true }));
}

interface ApiMock {
  bibliographySearchCrossref: ReturnType<typeof vi.fn>;
  bibliographySearchPubmed: ReturnType<typeof vi.fn>;
  bibliographyAppendEntry: ReturnType<typeof vi.fn>;
}

function installApiMock(): ApiMock {
  const api: ApiMock = {
    bibliographySearchCrossref: vi.fn().mockResolvedValue({ ok: true, hits: [] }),
    bibliographySearchPubmed: vi.fn().mockResolvedValue({ ok: true, hits: [] }),
    bibliographyAppendEntry: vi
      .fn()
      .mockResolvedValue({ ok: true, key: 'mocked', path: '/p/references.bib' }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = api;
  return api;
}

function mount(onInsert: (key: string) => void = () => {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<ReferencesTab onInsertCitation={onInsert} />);
  });
  return {
    host,
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
    rerender: () => {
      act(() => {
        root.render(<ReferencesTab onInsertCitation={onInsert} />);
      });
    },
  };
}

const sampleEntry: BibEntry = {
  key: 'smith2024x',
  type: 'article',
  fields: { author: 'Smith, John', title: 'Sample paper', journal: 'NEJM', year: '2024' },
};

beforeEach(() => {
  useBibliographyStore.setState({
    filePath: '/p/references.bib',
    exists: true,
    entries: [],
    loading: false,
  });
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).api;
  useBibliographyStore.setState({ filePath: null, exists: false, entries: [], loading: false });
});

describe('ReferencesTab', () => {
  it('renders the empty state when no local entries exist', async () => {
    installApiMock();
    const { host, cleanup } = mount();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(host.querySelector('[data-testid="references-local-empty"]')).not.toBeNull();
    cleanup();
  });

  it('lists local entries from the store and inserts on click', async () => {
    installApiMock();
    useBibliographyStore.setState({ entries: [sampleEntry] });
    const onInsert = vi.fn();
    const { host, cleanup } = mount(onInsert);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    const rows = host.querySelectorAll('[data-testid="references-local-row"]');
    expect(rows.length).toBe(1);
    // The row wrapper now hosts an inner button for the citation insert and
    // a sibling action button. Click the cm-references-local-row button.
    const insertBtn = rows[0]!.querySelector('button.cm-references-local-row') as HTMLButtonElement;
    act(() => { insertBtn.click(); });
    expect(onInsert).toHaveBeenCalledWith('smith2024x');
    cleanup();
  });

  it('debounces remote search and routes through the selected source', async () => {
    const api = installApiMock();
    api.bibliographySearchCrossref.mockResolvedValueOnce({
      ok: true,
      hits: [{ entry: sampleEntry, externalId: '10.x/y', source: 'crossref' }],
    });
    const { host, cleanup } = mount();
    const input = host.querySelector('[data-testid="references-search-input"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(input, 'cancer', 'input');
    });
    // Before the 300ms debounce fires the API isn't called.
    expect(api.bibliographySearchCrossref).not.toHaveBeenCalled();
    await act(async () => { await new Promise((r) => setTimeout(r, 350)); });
    expect(api.bibliographySearchCrossref).toHaveBeenCalledWith('cancer', 25);
    expect(host.querySelectorAll('[data-testid="references-result"]').length).toBe(1);
    cleanup();
  });

  it('switches to PubMed when the source dropdown changes', async () => {
    const api = installApiMock();
    const { host, cleanup } = mount();
    const select = host.querySelector('[data-testid="references-source"]') as HTMLSelectElement;
    await act(async () => {
      setInputValue(select, 'pubmed', 'change');
    });
    const input = host.querySelector('[data-testid="references-search-input"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(input, 'covid', 'input');
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 350)); });
    expect(api.bibliographySearchPubmed).toHaveBeenCalledWith('covid', 25);
    expect(api.bibliographySearchCrossref).not.toHaveBeenCalled();
    cleanup();
  });

  it('Add button calls bibliographyAppendEntry and emits the key via onInsert', async () => {
    const api = installApiMock();
    api.bibliographySearchCrossref.mockResolvedValueOnce({
      ok: true,
      hits: [{ entry: sampleEntry, externalId: '10.x/y', source: 'crossref' }],
    });
    const onInsert = vi.fn();
    const { host, cleanup } = mount(onInsert);
    const input = host.querySelector('[data-testid="references-search-input"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(input, 'q', 'input');
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 350)); });
    const addBtn = host.querySelector('[data-testid="references-add"]') as HTMLButtonElement;
    expect(addBtn).not.toBeNull();
    await act(async () => {
      addBtn.click();
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(api.bibliographyAppendEntry).toHaveBeenCalled();
    expect(onInsert).toHaveBeenCalledWith('mocked');
    cleanup();
  });
});
