import { create } from 'zustand';
import type { BibEntry } from '@shared/bibtex';
import type { ReferenceDownloadResult } from '@shared/ipc-contract';

/** Per-key local-file presence (cached read of `reference/<key>.{pdf,md}`). */
export interface LocalFileStatus {
  exists: boolean;
  relPath: string | null;
  type: 'pdf' | 'md' | null;
}

/**
 * In-memory cache of the active document's bibliography. The `.bib` file is
 * the source of truth — this store is purely a read-through cache that
 * (a) saves a parse on every export, and (b) lets the UI react to fs.watch
 * change events without re-querying main on every keystroke.
 *
 * `filePath` is the chosen target file:
 *   - resolved via the existing 32-level discovery (when present), or
 *   - the path that `bibliography:ensureFile` would create (when missing).
 *
 * Track A only uses `addEntry` (DOI → append). Tracks B/C will add `reload`
 * and `index` for the search panel + `[@`-autocomplete.
 */
interface BibliographyState {
  filePath: string | null;
  /** True iff the .bib file actually exists on disk. */
  exists: boolean;
  entries: BibEntry[];
  loading: boolean;
  /** key → local file status (reference/<key>.pdf or .md). */
  fileStatus: Record<string, LocalFileStatus>;
  /** key → true while a download is in flight. */
  downloading: Record<string, boolean>;
  /** Bind to the active document. Idempotent for a given `docPath`. */
  bindToDocument: (docPath: string | null) => Promise<void>;
  /** Re-read the active `.bib` file from disk. */
  reload: () => Promise<void>;
  /** Refresh the file-status cache for every entry. */
  scanFileStatuses: () => Promise<void>;
  /**
   * Download the reference for `key` (probes Crossref link / PMC /
   * Unpaywall / HTML / abstract). On success, persists the resulting
   * relative path back into the bib entry's `file` field.
   */
  downloadReference: (
    key: string,
  ) => Promise<
    | (ReferenceDownloadResult & { ok: true })
    | { ok: false; code: string; message: string }
  >;
  /**
   * Resolve a DOI and append the result. Returns the citation key on success
   * so the caller can immediately insert `[@key]` at the editor caret.
   */
  addFromDoi: (
    doi: string,
  ) => Promise<
    | { ok: true; key: string }
    | { ok: false; code: string; message: string }
  >;
  /**
   * Append a pre-resolved `BibEntry` (from a Crossref/PubMed search hit).
   * Same write-then-cache flow as `addFromDoi` but without the network call.
   */
  addEntry: (
    entry: BibEntry,
  ) => Promise<
    | { ok: true; key: string }
    | { ok: false; code: string; message: string }
  >;
}

export const useBibliographyStore = create<BibliographyState>((set, get) => ({
  filePath: null,
  exists: false,
  entries: [],
  loading: false,
  fileStatus: {},
  downloading: {},

  bindToDocument: async (docPath) => {
    set({ loading: true, fileStatus: {} });
    if (!docPath) {
      set({ filePath: null, exists: false, entries: [], loading: false });
      return;
    }
    // Discover the existing .bib (read-only probe). Falls back to whatever
    // ensureBibFile would create — useful so the UI can surface "will be
    // created at <path>" before the first append.
    const roots = (await window.api.prefsGet()).workspaceFolders ?? [];
    const found = await window.api.bibliographyFind(docPath, roots);
    if (found) {
      const r = await window.api.bibliographyReadEntries(found.path);
      set({
        filePath: found.path,
        exists: true,
        entries: r.ok ? r.entries : [],
        loading: false,
      });
      void get().scanFileStatuses();
      return;
    }
    // No file yet — record the would-be path so the UI can show it.
    const ensured = await window.api.bibliographyEnsureFile(docPath);
    if (ensured.ok) {
      // ensureFile *created* the file on disk; immediately read it (empty).
      set({
        filePath: ensured.path,
        exists: true,
        entries: [],
        loading: false,
      });
    } else {
      set({ filePath: null, exists: false, entries: [], loading: false });
    }
  },

  reload: async () => {
    const { filePath } = get();
    if (!filePath) return;
    const r = await window.api.bibliographyReadEntries(filePath);
    if (r.ok) {
      set({ entries: r.entries });
      void get().scanFileStatuses();
    }
  },

  scanFileStatuses: async () => {
    const { filePath, entries } = get();
    if (!filePath) return;
    const next: Record<string, LocalFileStatus> = {};
    // Parallel probe — each entry's status is an independent IPC, but they
    // share a single fs walk on the main side via direct path access.
    await Promise.all(
      entries.map(async (e) => {
        const s = await window.api.referenceStatus(
          filePath,
          e.key,
          e.fields.file ?? null,
        );
        next[e.key] = {
          exists: s.exists,
          relPath: s.relPath,
          type: s.type,
        };
      }),
    );
    set({ fileStatus: next });
  },

  downloadReference: async (key) => {
    const { filePath, entries } = get();
    if (!filePath) return { ok: false, code: 'no-file', message: 'no .bib bound' };
    const entry = entries.find((e) => e.key === key);
    if (!entry) return { ok: false, code: 'not-found', message: 'key missing' };

    set((s) => ({ downloading: { ...s.downloading, [key]: true } }));
    try {
      const r = await window.api.referenceDownload(filePath, entry);
      if (!r.ok) return r;
      // Persist the file field back to the bib so the link survives across
      // sessions. We mutate the entry in place in the store cache to skip
      // a round-trip read.
      const updated: BibEntry = {
        ...entry,
        fields: { ...entry.fields, file: r.relPath },
      };
      const persisted = await window.api.bibliographyUpsertEntry(filePath, updated);
      if (!persisted.ok) {
        return { ok: false, code: 'write-failed', message: persisted.error };
      }
      set((s) => ({
        entries: s.entries.map((e) => (e.key === key ? updated : e)),
        fileStatus: {
          ...s.fileStatus,
          [key]: { exists: true, relPath: r.relPath, type: r.type },
        },
      }));
      return r;
    } finally {
      set((s) => {
        const next = { ...s.downloading };
        delete next[key];
        return { downloading: next };
      });
    }
  },

  addFromDoi: async (doi) => {
    // Check the write target before spending a Crossref request — prevents
    // the user from "successfully" resolving a DOI we have no place to put.
    const { filePath } = get();
    if (!filePath) {
      return { ok: false, code: 'no-file', message: 'no .bib file bound' };
    }
    const fetched = await window.api.bibliographyResolveDoi(doi);
    if (!fetched.ok) return { ok: false, code: fetched.code, message: fetched.message };
    const appended = await window.api.bibliographyAppendEntry(filePath, fetched.entry);
    if (!appended.ok) {
      return { ok: false, code: 'write-failed', message: appended.error };
    }
    // Local optimistic update. A subsequent `reload()` would yield the same
    // result, but skipping the round-trip keeps the UI responsive.
    set((s) => ({
      entries: [...s.entries, { ...fetched.entry, key: appended.key }],
    }));
    return { ok: true, key: appended.key };
  },

  addEntry: async (entry) => {
    const { filePath } = get();
    if (!filePath) {
      return { ok: false, code: 'no-file', message: 'no .bib file bound' };
    }
    const appended = await window.api.bibliographyAppendEntry(filePath, entry);
    if (!appended.ok) {
      return { ok: false, code: 'write-failed', message: appended.error };
    }
    set((s) => ({
      entries: [...s.entries, { ...entry, key: appended.key }],
    }));
    return { ok: true, key: appended.key };
  },
}));
