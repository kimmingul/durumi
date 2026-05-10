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
  referenceStatus: ReturnType<typeof vi.fn>;
  referenceScan: ReturnType<typeof vi.fn>;
  referenceExtractDoi: ReturnType<typeof vi.fn>;
}

function installApiMock(): ApiMock {
  const api: ApiMock = {
    prefsGet: vi.fn().mockResolvedValue({ workspaceFolders: [] }),
    bibliographyFind: vi.fn().mockResolvedValue(null),
    bibliographyEnsureFile: vi.fn().mockResolvedValue({ ok: false, error: 'no-document' }),
    bibliographyResolveDoi: vi.fn(),
    bibliographyAppendEntry: vi.fn(),
    bibliographyReadEntries: vi.fn().mockResolvedValue({ ok: true, entries: [], warnings: [] }),
    referenceStatus: vi
      .fn()
      .mockResolvedValue({ exists: false, absPath: null, relPath: null, type: null }),
    referenceScan: vi.fn().mockResolvedValue({ ok: true, files: [] }),
    referenceExtractDoi: vi.fn().mockResolvedValue({ doi: null, source: 'none' }),
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
  useBibliographyStore.setState({
    filePath: null,
    exists: false,
    entries: [],
    loading: false,
    fileStatus: {},
    downloading: {},
    orphanFiles: [],
  });
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

  it('scanFileStatuses surfaces orphan files (in dir but not on any entry)', async () => {
    const api = installApiMock();
    useBibliographyStore.setState({
      filePath: '/p/references.bib',
      exists: true,
      entries: [sampleEntry],
      loading: false,
    });
    api.referenceScan.mockResolvedValueOnce({
      ok: true,
      files: [
        {
          absPath: '/p/reference/orphan.pdf',
          relPath: 'reference/orphan.pdf',
          fileName: 'orphan.pdf',
          type: 'pdf',
        },
      ],
    });
    await useBibliographyStore.getState().scanFileStatuses();
    expect(useBibliographyStore.getState().orphanFiles).toHaveLength(1);
    expect(useBibliographyStore.getState().orphanFiles[0]?.fileName).toBe('orphan.pdf');
  });

  it('scanFileStatuses excludes files that ARE claimed by an entry', async () => {
    const api = installApiMock();
    const claimed = {
      ...sampleEntry,
      fields: { ...sampleEntry.fields, file: 'reference/claimed.pdf' },
    };
    useBibliographyStore.setState({
      filePath: '/p/references.bib',
      exists: true,
      entries: [claimed],
      loading: false,
    });
    api.referenceStatus.mockResolvedValue({
      exists: true,
      absPath: '/p/reference/claimed.pdf',
      relPath: 'reference/claimed.pdf',
      type: 'pdf',
    });
    api.referenceScan.mockResolvedValueOnce({
      ok: true,
      files: [
        {
          absPath: '/p/reference/claimed.pdf',
          relPath: 'reference/claimed.pdf',
          fileName: 'claimed.pdf',
          type: 'pdf',
        },
      ],
    });
    await useBibliographyStore.getState().scanFileStatuses();
    expect(useBibliographyStore.getState().orphanFiles).toEqual([]);
  });

  it('registerOrphan auto-fetches when a DOI is extracted', async () => {
    const api = installApiMock();
    useBibliographyStore.setState({
      filePath: '/p/references.bib',
      exists: true,
      entries: [],
      loading: false,
      orphanFiles: [
        {
          absPath: '/p/reference/o.pdf',
          relPath: 'reference/o.pdf',
          fileName: 'o.pdf',
          type: 'pdf',
        },
      ],
    });
    api.referenceExtractDoi.mockResolvedValueOnce({ doi: '10.1/found', source: 'pdf-info' });
    api.bibliographyResolveDoi.mockResolvedValueOnce({
      ok: true,
      entry: { key: '', type: 'article', fields: { title: 'Found', year: '2024' } },
    });
    api.bibliographyAppendEntry.mockResolvedValueOnce({
      ok: true,
      key: 'found2024',
      path: '/p/references.bib',
    });
    const r = await useBibliographyStore
      .getState()
      .registerOrphan('/p/reference/o.pdf', 'reference/o.pdf');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toBe('doi');
    expect(useBibliographyStore.getState().entries).toHaveLength(1);
    expect(useBibliographyStore.getState().orphanFiles).toEqual([]);
  });

  it('registerOrphan returns no-doi when extraction fails (caller falls back to manual)', async () => {
    const api = installApiMock();
    useBibliographyStore.setState({
      filePath: '/p/references.bib',
      exists: true,
      entries: [],
      loading: false,
    });
    api.referenceExtractDoi.mockResolvedValueOnce({ doi: null, source: 'none' });
    const r = await useBibliographyStore
      .getState()
      .registerOrphan('/p/reference/o.pdf', 'reference/o.pdf');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('no-doi');
  });

  it('registerOrphan with manualEntry skips DOI extraction', async () => {
    const api = installApiMock();
    useBibliographyStore.setState({
      filePath: '/p/references.bib',
      exists: true,
      entries: [],
      loading: false,
    });
    api.bibliographyAppendEntry.mockResolvedValueOnce({
      ok: true,
      key: 'manual2024',
      path: '/p/references.bib',
    });
    const r = await useBibliographyStore.getState().registerOrphan(
      '/p/reference/o.pdf',
      'reference/o.pdf',
      { key: '', type: 'misc', fields: { title: 'Manual', file: 'reference/o.pdf' } },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toBe('manual');
    expect(api.referenceExtractDoi).not.toHaveBeenCalled();
  });
});
