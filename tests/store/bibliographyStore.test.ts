import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBibliographyStore } from '../../src/store/bibliographyStore';
import type { BibEntry } from '../../shared/bibtex';

interface ApiMock {
  prefsGet: ReturnType<typeof vi.fn>;
  bibliographyFind: ReturnType<typeof vi.fn>;
  bibliographyEnsureFile: ReturnType<typeof vi.fn>;
  bibliographyResolveDoi: ReturnType<typeof vi.fn>;
  bibliographyAppendEntry: ReturnType<typeof vi.fn>;
  bibliographyReadEntries: ReturnType<typeof vi.fn>;
}

function installApiMock(): ApiMock {
  const api: ApiMock = {
    prefsGet: vi.fn().mockResolvedValue({ workspaceFolders: [] }),
    bibliographyFind: vi.fn().mockResolvedValue(null),
    bibliographyEnsureFile: vi.fn().mockResolvedValue({ ok: false, error: 'no-document' }),
    bibliographyResolveDoi: vi.fn(),
    bibliographyAppendEntry: vi.fn(),
    bibliographyReadEntries: vi.fn().mockResolvedValue({ ok: true, entries: [], warnings: [] }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = api;
  return api;
}

const sampleEntry: BibEntry = {
  key: '',
  type: 'article',
  fields: { author: 'Smith, John', title: 'X', year: '2024' },
};

beforeEach(() => {
  useBibliographyStore.setState({ filePath: null, exists: false, entries: [], loading: false });
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).api;
});

describe('bibliographyStore', () => {
  it('bindToDocument(null) resets state', async () => {
    installApiMock();
    await useBibliographyStore.getState().bindToDocument(null);
    expect(useBibliographyStore.getState().filePath).toBeNull();
    expect(useBibliographyStore.getState().exists).toBe(false);
    expect(useBibliographyStore.getState().loading).toBe(false);
  });

  it('binds to an existing .bib found via discovery', async () => {
    const api = installApiMock();
    api.bibliographyFind.mockResolvedValueOnce({ path: '/p/references.bib', source: '' });
    api.bibliographyReadEntries.mockResolvedValueOnce({
      ok: true,
      entries: [{ key: 'old', type: 'article', fields: { title: 'T' } }],
      warnings: [],
    });
    await useBibliographyStore.getState().bindToDocument('/p/doc.md');
    const s = useBibliographyStore.getState();
    expect(s.filePath).toBe('/p/references.bib');
    expect(s.exists).toBe(true);
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0]?.key).toBe('old');
  });

  it('falls back to ensureFile (creates) when discovery returns null', async () => {
    const api = installApiMock();
    api.bibliographyFind.mockResolvedValueOnce(null);
    api.bibliographyEnsureFile.mockResolvedValueOnce({
      ok: true,
      path: '/p/references.bib',
      created: true,
    });
    await useBibliographyStore.getState().bindToDocument('/p/doc.md');
    const s = useBibliographyStore.getState();
    expect(s.filePath).toBe('/p/references.bib');
    expect(s.exists).toBe(true);
    expect(s.entries).toEqual([]);
  });

  it('addFromDoi resolves + appends + optimistically updates entries', async () => {
    const api = installApiMock();
    useBibliographyStore.setState({
      filePath: '/p/references.bib',
      exists: true,
      entries: [],
      loading: false,
    });
    api.bibliographyResolveDoi.mockResolvedValueOnce({ ok: true, entry: sampleEntry });
    api.bibliographyAppendEntry.mockResolvedValueOnce({
      ok: true,
      key: 'smith2024x',
      path: '/p/references.bib',
    });
    const r = await useBibliographyStore.getState().addFromDoi('10.1056/x');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.key).toBe('smith2024x');
    const s = useBibliographyStore.getState();
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0]?.key).toBe('smith2024x');
  });

  it('addFromDoi propagates fetch errors without writing', async () => {
    const api = installApiMock();
    useBibliographyStore.setState({
      filePath: '/p/references.bib',
      exists: true,
      entries: [],
      loading: false,
    });
    api.bibliographyResolveDoi.mockResolvedValueOnce({
      ok: false,
      code: 'not-found',
      message: '404',
    });
    const r = await useBibliographyStore.getState().addFromDoi('10.x/bad');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not-found');
    expect(api.bibliographyAppendEntry).not.toHaveBeenCalled();
    expect(useBibliographyStore.getState().entries).toEqual([]);
  });

  it('addFromDoi refuses to append when no .bib file is bound', async () => {
    installApiMock();
    // filePath stays null from beforeEach reset.
    const r = await useBibliographyStore.getState().addFromDoi('10.x/y');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('no-file');
  });
});
