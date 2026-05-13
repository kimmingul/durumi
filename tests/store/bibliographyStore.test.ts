import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBibliographyStore } from '../../src/store/bibliographyStore';
import type { BibEntry } from '../../shared/bibtex';

interface ApiMock {
  prefsGet: ReturnType<typeof vi.fn>;
  bibliographyFind: ReturnType<typeof vi.fn>;
  bibliographyEnsureFile: ReturnType<typeof vi.fn>;
  bibliographyComputePath: ReturnType<typeof vi.fn>;
  bibliographyResolveDoi: ReturnType<typeof vi.fn>;
  bibliographyAppendEntry: ReturnType<typeof vi.fn>;
  bibliographyReadEntries: ReturnType<typeof vi.fn>;
  bibliographyUpsertEntry: ReturnType<typeof vi.fn>;
  bibliographyRemoveEntry: ReturnType<typeof vi.fn>;
  bibliographyImportFile: ReturnType<typeof vi.fn>;
  referenceStatus: ReturnType<typeof vi.fn>;
  referenceScan: ReturnType<typeof vi.fn>;
  referenceExtractDoi: ReturnType<typeof vi.fn>;
}

function installApiMock(): ApiMock {
  const api: ApiMock = {
    prefsGet: vi.fn().mockResolvedValue({ workspaceFolders: [] }),
    bibliographyFind: vi.fn().mockResolvedValue(null),
    bibliographyEnsureFile: vi.fn().mockResolvedValue({ ok: false, error: 'no-document' }),
    bibliographyComputePath: vi
      .fn()
      .mockResolvedValue({ ok: true, path: '/p/references.bib', exists: false }),
    bibliographyResolveDoi: vi.fn(),
    bibliographyAppendEntry: vi.fn(),
    bibliographyReadEntries: vi.fn().mockResolvedValue({ ok: true, entries: [], warnings: [] }),
    bibliographyUpsertEntry: vi.fn().mockResolvedValue({ ok: true, key: 'k', path: '/p/x.bib' }),
    bibliographyRemoveEntry: vi.fn().mockResolvedValue({ ok: true, path: '/p/x.bib' }),
    bibliographyImportFile: vi.fn(),
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

  it('falls back to computePath (no side effect) when discovery returns null', async () => {
    // v0.2.x: opening a document must NOT create the .bib. It records the
    // path we would write to and surfaces `exists: false` so the sidebar
    // shows "will be created at <path>". The file materialises on the
    // first appendEntry call, not on document-open.
    const api = installApiMock();
    api.bibliographyFind.mockResolvedValueOnce(null);
    api.bibliographyComputePath.mockResolvedValueOnce({
      ok: true,
      path: '/p/references.bib',
      exists: false,
    });
    await useBibliographyStore.getState().bindToDocument('/p/doc.md');
    const s = useBibliographyStore.getState();
    expect(s.filePath).toBe('/p/references.bib');
    expect(s.exists).toBe(false);
    expect(s.entries).toEqual([]);
    // Critical regression guard: the old code path called ensureFile here
    // and silently materialised the .bib on disk.
    expect(api.bibliographyEnsureFile).not.toHaveBeenCalled();
  });

  it('flips exists to true after the first successful addEntry', async () => {
    const api = installApiMock();
    api.bibliographyFind.mockResolvedValueOnce(null);
    api.bibliographyComputePath.mockResolvedValueOnce({
      ok: true,
      path: '/p/references.bib',
      exists: false,
    });
    await useBibliographyStore.getState().bindToDocument('/p/doc.md');
    expect(useBibliographyStore.getState().exists).toBe(false);

    api.bibliographyAppendEntry.mockResolvedValueOnce({
      ok: true,
      key: 'smith2024x',
      path: '/p/references.bib',
    });
    await useBibliographyStore.getState().addEntry(sampleEntry);
    expect(useBibliographyStore.getState().exists).toBe(true);
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

  it('updateEntry replaces fields and persists via upsertEntry', async () => {
    const api = installApiMock();
    useBibliographyStore.setState({
      filePath: '/p/references.bib',
      exists: true,
      entries: [{ key: 'k1', type: 'article', fields: { title: 'old', year: '2020' } }],
      loading: false,
    });
    const r = await useBibliographyStore.getState().updateEntry('k1', {
      title: 'new',
      year: '2024',
    });
    expect(r.ok).toBe(true);
    expect(api.bibliographyUpsertEntry).toHaveBeenCalled();
    const after = useBibliographyStore.getState().entries[0]!;
    expect(after.fields.title).toBe('new');
    expect(after.fields.year).toBe('2024');
  });

  it('updateEntry drops empty-string fields so they do not pollute the bib', async () => {
    installApiMock();
    useBibliographyStore.setState({
      filePath: '/p/references.bib',
      exists: true,
      entries: [{ key: 'k1', type: 'article', fields: { title: 'x', author: 'a' } }],
      loading: false,
    });
    const r = await useBibliographyStore.getState().updateEntry('k1', {
      title: 'x',
      author: '   ',
    });
    expect(r.ok).toBe(true);
    expect(useBibliographyStore.getState().entries[0]?.fields.author).toBeUndefined();
  });

  it('updateEntry returns not-found for an unknown key', async () => {
    installApiMock();
    useBibliographyStore.setState({
      filePath: '/p/references.bib',
      exists: true,
      entries: [{ key: 'k1', type: 'article', fields: { title: 'x' } }],
      loading: false,
    });
    const r = await useBibliographyStore.getState().updateEntry('missing', { title: 'y' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('not-found');
  });

  it('deleteEntry removes the entry from the store and calls removeEntry IPC', async () => {
    const api = installApiMock();
    useBibliographyStore.setState({
      filePath: '/p/references.bib',
      exists: true,
      entries: [
        { key: 'k1', type: 'article', fields: { title: 'a' } },
        { key: 'k2', type: 'article', fields: { title: 'b' } },
      ],
      loading: false,
      fileStatus: { k1: { exists: true, relPath: 'reference/k1.pdf', type: 'pdf' } },
    });
    const r = await useBibliographyStore.getState().deleteEntry('k1');
    expect(r.ok).toBe(true);
    expect(api.bibliographyRemoveEntry).toHaveBeenCalledWith('/p/references.bib', 'k1');
    expect(useBibliographyStore.getState().entries.map((e) => e.key)).toEqual(['k2']);
    expect(useBibliographyStore.getState().fileStatus.k1).toBeUndefined();
  });

  it('mergeImportedEntries appends fresh entries and reports the count', async () => {
    const api = installApiMock();
    api.bibliographyAppendEntry
      .mockResolvedValueOnce({ ok: true, key: 'a', path: '/p/x.bib' })
      .mockResolvedValueOnce({ ok: true, key: 'b', path: '/p/x.bib' });
    useBibliographyStore.setState({
      filePath: '/p/x.bib',
      exists: true,
      entries: [],
      loading: false,
    });
    const r = await useBibliographyStore.getState().mergeImportedEntries(
      [
        { key: 'a', type: 'article', fields: { title: 'A' } },
        { key: 'b', type: 'article', fields: { title: 'B' } },
      ],
      'rename',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.added).toBe(2);
    expect(useBibliographyStore.getState().entries.map((e) => e.key)).toEqual(['a', 'b']);
  });

  it('mergeImportedEntries with rename mode collides into key-2', async () => {
    const api = installApiMock();
    api.bibliographyAppendEntry.mockResolvedValueOnce({
      ok: true,
      key: 'existing-2',
      path: '/p/x.bib',
    });
    useBibliographyStore.setState({
      filePath: '/p/x.bib',
      exists: true,
      entries: [{ key: 'existing', type: 'article', fields: { title: 'Old' } }],
      loading: false,
    });
    const r = await useBibliographyStore.getState().mergeImportedEntries(
      [{ key: 'existing', type: 'article', fields: { title: 'New' } }],
      'rename',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.added).toBe(1);
    const calledWith = api.bibliographyAppendEntry.mock.calls[0]![1] as {
      key: string;
    };
    expect(calledWith.key).toBe('existing-2');
  });

  it('mergeImportedEntries with skip mode leaves existing alone', async () => {
    const api = installApiMock();
    useBibliographyStore.setState({
      filePath: '/p/x.bib',
      exists: true,
      entries: [{ key: 'existing', type: 'article', fields: { title: 'Old' } }],
      loading: false,
    });
    const r = await useBibliographyStore.getState().mergeImportedEntries(
      [{ key: 'existing', type: 'article', fields: { title: 'New' } }],
      'skip',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.skipped).toBe(1);
    expect(api.bibliographyAppendEntry).not.toHaveBeenCalled();
    expect(useBibliographyStore.getState().entries[0]?.fields.title).toBe('Old');
  });

  it('mergeImportedEntries with replace mode upserts the colliding key', async () => {
    const api = installApiMock();
    useBibliographyStore.setState({
      filePath: '/p/x.bib',
      exists: true,
      entries: [{ key: 'existing', type: 'article', fields: { title: 'Old' } }],
      loading: false,
    });
    const r = await useBibliographyStore.getState().mergeImportedEntries(
      [{ key: 'existing', type: 'article', fields: { title: 'New' } }],
      'replace',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.replaced).toBe(1);
    expect(api.bibliographyUpsertEntry).toHaveBeenCalled();
    expect(useBibliographyStore.getState().entries[0]?.fields.title).toBe('New');
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
