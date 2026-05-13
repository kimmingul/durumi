import { create } from 'zustand';
import type { BibEntry } from '@shared/bibtex';
import type { ReferenceDownloadResult, ReferenceScannedFile } from '@shared/ipc-contract';
import { t } from '../i18n/t';

/** Per-key local-file presence (cached read of `reference/<key>.{pdf,md}`). */
export interface LocalFileStatus {
  exists: boolean;
  relPath: string | null;
  type: 'pdf' | 'md' | null;
}

/** v0.1.7 Track C — files in `reference/` that no bib entry claims. */
export type OrphanFile = ReferenceScannedFile;

/** v0.1.10 — extra options for the new search-card add flow. */
export interface AddEntryOptions {
  /**
   * When `true`, the caller is responsible for also inserting `[@key]` at
   * the caret using the result's `key`. The store does not dispatch into
   * the editor itself (it has no access to the EditorView); it just reports
   * back so the caller can finish the work.
   */
  alsoInsert?: boolean;
  /**
   * Bypass the weak (title+author+year) duplicate check. Used by the
   * "add anyway" branch of the confirm dialog.
   */
  force?: boolean;
}

/**
 * v0.1.10 — discriminated union of the four add-flow outcomes. Hard
 * duplicate-DOI rejections and confirm-required weak matches are surfaced
 * separately so the renderer can react (toast vs. modal vs. silent insert).
 */
export type AddEntryResult =
  | { ok: true; key: string; alsoInsert: boolean }
  | { ok: false; code: 'duplicate-doi'; existingKey: string }
  | { ok: false; code: 'duplicate-weak'; existingKey: string; normalizedTitle: string }
  | { ok: false; code: string; message: string };

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
  /** Files in reference/ that aren't claimed by any bib entry. */
  orphanFiles: OrphanFile[];
  /**
   * v0.1.10 — emitted when the add-flow detects a duplicate. Track C
   * subscribes to this in the references sidebar to flash / scroll-to the
   * existing entry. Cleared by `clearHighlightedKey` once the UI has
   * acknowledged it (typically after a short timeout).
   */
  highlightedKey: string | null;
  /** Track C subscribes to this; setting it triggers a flash + scroll. */
  setHighlightedKey: (key: string | null) => void;
  /** Convenience: clear the highlight after Track C has reacted. */
  clearHighlightedKey: () => void;
  /** Bind to the active document. Idempotent for a given `docPath`. */
  bindToDocument: (docPath: string | null) => Promise<void>;
  /** Re-read the active `.bib` file from disk. */
  reload: () => Promise<void>;
  /** Refresh the file-status cache + orphan list. */
  scanFileStatuses: () => Promise<void>;
  /**
   * Register an orphan file as a bib entry. When a DOI can be extracted
   * from the file, it's auto-fetched via Crossref. Otherwise the caller
   * is expected to provide `manualEntry` from a metadata-entry modal.
   */
  registerOrphan: (
    absPath: string,
    relPath: string,
    manualEntry?: BibEntry,
  ) => Promise<
    | { ok: true; key: string; source: 'doi' | 'manual' }
    | { ok: false; code: string; message: string }
  >;
  /**
   * v0.1.7.1 — replace an existing entry's fields. Key changes are NOT
   * supported here; rename them via a separate dedicated action so the
   * editor's `[@oldKey]` references can be migrated atomically.
   */
  updateEntry: (
    key: string,
    fields: Record<string, string>,
    typeOverride?: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  /**
   * v0.1.7.1 — remove an entry from references.bib. The local file in
   * `reference/` (if any) is left on disk; subsequent scans surface it
   * in the Unregistered Files section.
   */
  deleteEntry: (key: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  /**
   * v0.1.8.1 — rename an entry's citation key in references.bib. The
   * caller is responsible for migrating `[@oldKey]` references in the
   * active document; this action only persists the bib change and
   * updates the in-memory cache. Surfaces the underlying error code so
   * the dialog can show "key-taken" specifically.
   */
  renameEntryKey: (
    oldKey: string,
    newKey: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  /**
   * v0.1.7.1 — merge parsed entries (from a .bib or .ris import) into
   * `references.bib`. Collision modes:
   *   - `skip`: keep existing entry, drop incoming
   *   - `replace`: overwrite existing fields with incoming
   *   - `rename`: append `-2`, `-3`, … to the incoming key
   */
  mergeImportedEntries: (
    incoming: BibEntry[],
    mode: 'skip' | 'replace' | 'rename',
  ) => Promise<{ ok: true; added: number; replaced: number; skipped: number } | { ok: false; error: string }>;
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
   * v0.1.10 — dedup-aware: surfaces `duplicate-doi` / `duplicate-weak`
   * outcomes for the renderer to convert into toasts / confirms.
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
  /**
   * v0.1.10 — search-card "추가" backing action. Wraps `addEntry` so the
   * Track C UI can surface dedup outcomes, trigger autoSaveAbstract, and
   * (when `alsoInsert: true`) signal the caller to drop `[@key]` at the
   * caret using its own editor-view handle.
   */
  addEntryFromSearch: (entry: BibEntry, opts?: AddEntryOptions) => Promise<AddEntryResult>;
}

function typeFromRelPath(relPath: string): 'pdf' | 'md' | null {
  const lower = relPath.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'md';
  return null;
}

export const useBibliographyStore = create<BibliographyState>((set, get) => ({
  filePath: null,
  exists: false,
  entries: [],
  loading: false,
  fileStatus: {},
  downloading: {},
  orphanFiles: [],
  highlightedKey: null,

  setHighlightedKey: (key) => set({ highlightedKey: key }),
  clearHighlightedKey: () => set({ highlightedKey: null }),

  bindToDocument: async (docPath) => {
    set({ loading: true, fileStatus: {} });
    if (!docPath) {
      set({ filePath: null, exists: false, entries: [], loading: false });
      return;
    }
    // Workspace-aware discovery first: an existing .bib up to 32 levels
    // above the document wins over the local default.
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
    // No existing file in scope — record the path *we'd* create on the
    // first append without touching disk. The UI renders this as
    // "Bibliography will be created at <path>"; the file materialises
    // when `addEntry` runs its first atomic write.
    const probe = await window.api.bibliographyComputePath(docPath);
    if (probe.ok) {
      set({
        filePath: probe.path,
        exists: probe.exists,
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

    // Build the orphan list: every file in reference/ that no entry claims.
    const claimed = new Set<string>();
    for (const e of entries) {
      const rel = e.fields.file?.trim();
      if (rel) claimed.add(rel);
      const status = next[e.key];
      if (status?.relPath) claimed.add(status.relPath);
    }
    const scan = await window.api.referenceScan(filePath);
    const orphans: OrphanFile[] = scan.ok
      ? scan.files.filter((f) => !claimed.has(f.relPath))
      : [];
    set({ fileStatus: next, orphanFiles: orphans });
  },

  updateEntry: async (key, fields, typeOverride) => {
    const { filePath, entries } = get();
    if (!filePath) return { ok: false, error: 'no .bib bound' };
    const existing = entries.find((e) => e.key === key);
    if (!existing) return { ok: false, error: 'not-found' };
    // Drop empty-string fields so they don't pollute the bib output.
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v && v.trim().length > 0) cleaned[k] = v.trim();
    }
    const updated: BibEntry = {
      key,
      type: typeOverride && typeOverride.trim() ? typeOverride.trim() : existing.type,
      fields: cleaned,
    };
    const r = await window.api.bibliographyUpsertEntry(filePath, updated);
    if (!r.ok) return { ok: false, error: r.error };
    set((s) => ({
      entries: s.entries.map((e) => (e.key === key ? updated : e)),
    }));
    void get().scanFileStatuses();
    return { ok: true };
  },

  renameEntryKey: async (oldKey, newKey) => {
    const { filePath, entries } = get();
    if (!filePath) return { ok: false, error: 'no .bib bound' };
    if (!oldKey || !newKey) return { ok: false, error: 'both keys required' };
    if (oldKey === newKey) return { ok: false, error: 'noop' };
    const r = await window.api.bibliographyRenameKey(filePath, oldKey, newKey);
    if (!r.ok) return { ok: false, error: r.error };
    set((s) => {
      const fileStatus = { ...s.fileStatus };
      if (fileStatus[oldKey]) {
        fileStatus[newKey] = fileStatus[oldKey]!;
        delete fileStatus[oldKey];
      }
      return {
        entries: s.entries.map((e) => (e.key === oldKey ? { ...e, key: newKey } : e)),
        fileStatus,
      };
    });
    void get().scanFileStatuses();
    return { ok: true };
    // Suppress unused-warning when entries isn't read directly above.
    void entries;
  },

  deleteEntry: async (key) => {
    const { filePath } = get();
    if (!filePath) return { ok: false, error: 'no .bib bound' };
    const r = await window.api.bibliographyRemoveEntry(filePath, key);
    if (!r.ok) return { ok: false, error: r.error };
    set((s) => {
      const fileStatus = { ...s.fileStatus };
      delete fileStatus[key];
      const downloading = { ...s.downloading };
      delete downloading[key];
      return {
        entries: s.entries.filter((e) => e.key !== key),
        fileStatus,
        downloading,
      };
    });
    // Re-scan: the dropped entry's file (if any) becomes an orphan.
    void get().scanFileStatuses();
    return { ok: true };
  },

  mergeImportedEntries: async (incoming, mode) => {
    const { filePath, entries } = get();
    if (!filePath) return { ok: false, error: 'no .bib bound' };
    if (incoming.length === 0) return { ok: true, added: 0, replaced: 0, skipped: 0 };
    const taken = new Set(entries.map((e) => e.key));
    let added = 0;
    let replaced = 0;
    let skipped = 0;
    // Collect the entries we'll actually write so we can do a single
    // round-trip per incoming entry rather than batch the writes.
    for (const raw of incoming) {
      const candidate: BibEntry = {
        ...raw,
        key: raw.key && raw.key.length > 0 ? raw.key : `imported-${Date.now()}-${added}`,
      };
      if (taken.has(candidate.key)) {
        if (mode === 'skip') {
          skipped++;
          continue;
        }
        if (mode === 'replace') {
          const r = await window.api.bibliographyUpsertEntry(filePath, candidate);
          if (!r.ok) return { ok: false, error: r.error };
          replaced++;
          // Update the in-memory cache.
          set((s) => ({
            entries: s.entries.map((e) => (e.key === candidate.key ? candidate : e)),
          }));
          continue;
        }
        // rename: append -2, -3, ...
        let suffix = 2;
        while (taken.has(`${candidate.key}-${suffix}`)) suffix++;
        candidate.key = `${candidate.key}-${suffix}`;
      }
      const r = await window.api.bibliographyAppendEntry(filePath, candidate);
      if (!r.ok) return { ok: false, error: r.error };
      // The append call may have minted a new key (e.g. when raw.key was
      // empty); use that as the canonical key.
      const finalKey = r.key;
      taken.add(finalKey);
      added++;
      set((s) => ({
        entries: [...s.entries, { ...candidate, key: finalKey }],
        exists: true,
      }));
    }
    void get().scanFileStatuses();
    return { ok: true, added, replaced, skipped };
  },

  registerOrphan: async (absPath, relPath, manualEntry) => {
    const { filePath } = get();
    if (!filePath) return { ok: false, code: 'no-file', message: 'no .bib bound' };

    // Try DOI extraction unless the caller already supplied a manual entry.
    let entryToWrite: BibEntry | null = manualEntry ?? null;
    const source: 'doi' | 'manual' = manualEntry ? 'manual' : 'doi';
    if (!entryToWrite) {
      const ext = await window.api.referenceExtractDoi(absPath);
      if (ext.doi) {
        const fetched = await window.api.bibliographyResolveDoi(ext.doi);
        if (fetched.ok) {
          entryToWrite = {
            ...fetched.entry,
            fields: { ...fetched.entry.fields, file: relPath },
          };
        } else {
          return {
            ok: false,
            code: fetched.code,
            message: `DOI ${ext.doi} extracted but resolve failed: ${fetched.message}`,
          };
        }
      } else {
        return {
          ok: false,
          code: 'no-doi',
          message: 'No DOI in file — please enter metadata manually.',
        };
      }
    } else {
      // Manual entry path: ensure the file field is set.
      entryToWrite = {
        ...entryToWrite,
        fields: { ...entryToWrite.fields, file: relPath },
      };
    }

    const written = await window.api.bibliographyAppendEntry(filePath, entryToWrite);
    if (!written.ok) return { ok: false, code: 'write-failed', message: written.error };

    set((s) => ({
      entries: [...s.entries, { ...entryToWrite!, key: written.key }],
      exists: true,
      fileStatus: {
        ...s.fileStatus,
        [written.key]: { exists: true, relPath, type: typeFromRelPath(relPath) },
      },
      orphanFiles: s.orphanFiles.filter((f) => f.relPath !== relPath),
    }));
    return { ok: true, key: written.key, source };
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
      if (appended.error === 'duplicate-doi') {
        // Surface "이미 추가된 참고문헌입니다 ([key])" + flash the existing row.
        // eslint-disable-next-line no-alert
        window.alert(t('toast.bibliography.duplicateDoi', { key: appended.existingKey }));
        get().setHighlightedKey(appended.existingKey);
        return { ok: false, code: 'duplicate-doi', message: appended.existingKey };
      }
      if (appended.error === 'duplicate-weak') {
        // eslint-disable-next-line no-alert
        const ok = window.confirm(
          t('confirm.bibliography.duplicateWeak', { key: appended.existingKey }),
        );
        if (!ok) {
          get().setHighlightedKey(appended.existingKey);
          return { ok: false, code: 'duplicate-weak', message: appended.existingKey };
        }
        const retry = await window.api.bibliographyAppendEntry(filePath, fetched.entry, {
          force: true,
        });
        if (!retry.ok) {
          // The retry can still fail on duplicate-doi if another writer
          // sneaked in, but in practice this is a real disk error.
          const msg = 'error' in retry ? String(retry.error) : 'write-failed';
          return { ok: false, code: 'write-failed', message: msg };
        }
        await afterEntryAdded(filePath, { ...fetched.entry, key: retry.key });
        set((s) => ({ entries: [...s.entries, { ...fetched.entry, key: retry.key }] }));
        return { ok: true, key: retry.key };
      }
      return { ok: false, code: 'write-failed', message: appended.error };
    }
    // Local optimistic update. A subsequent `reload()` would yield the same
    // result, but skipping the round-trip keeps the UI responsive.
    await afterEntryAdded(filePath, { ...fetched.entry, key: appended.key });
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
      if (appended.error === 'duplicate-doi' || appended.error === 'duplicate-weak') {
        return { ok: false, code: appended.error, message: appended.existingKey };
      }
      return { ok: false, code: 'write-failed', message: appended.error };
    }
    await afterEntryAdded(filePath, { ...entry, key: appended.key });
    set((s) => ({
      entries: [...s.entries, { ...entry, key: appended.key }],
    }));
    return { ok: true, key: appended.key };
  },

  addEntryFromSearch: async (entry, opts): Promise<AddEntryResult> => {
    const { filePath } = get();
    if (!filePath) {
      return { ok: false, code: 'no-file', message: 'no .bib file bound' };
    }
    const alsoInsert = opts?.alsoInsert === true;
    const appended = await window.api.bibliographyAppendEntry(filePath, entry, {
      force: opts?.force === true,
    });
    if (!appended.ok) {
      if (appended.error === 'duplicate-doi') {
        // eslint-disable-next-line no-alert
        window.alert(t('toast.bibliography.duplicateDoi', { key: appended.existingKey }));
        get().setHighlightedKey(appended.existingKey);
        return { ok: false, code: 'duplicate-doi', existingKey: appended.existingKey };
      }
      if (appended.error === 'duplicate-weak') {
        // eslint-disable-next-line no-alert
        const ok = window.confirm(
          t('confirm.bibliography.duplicateWeak', { key: appended.existingKey }),
        );
        if (!ok) {
          get().setHighlightedKey(appended.existingKey);
          return {
            ok: false,
            code: 'duplicate-weak',
            existingKey: appended.existingKey,
            normalizedTitle: appended.normalizedTitle,
          };
        }
        const retry = await window.api.bibliographyAppendEntry(filePath, entry, {
          force: true,
        });
        if (!retry.ok) {
          const msg = 'error' in retry ? String(retry.error) : 'write-failed';
          return { ok: false, code: 'write-failed', message: msg };
        }
        await afterEntryAdded(filePath, { ...entry, key: retry.key });
        set((s) => ({ entries: [...s.entries, { ...entry, key: retry.key }] }));
        return { ok: true, key: retry.key, alsoInsert };
      }
      return { ok: false, code: 'write-failed', message: appended.error };
    }
    await afterEntryAdded(filePath, { ...entry, key: appended.key });
    set((s) => ({ entries: [...s.entries, { ...entry, key: appended.key }] }));
    return { ok: true, key: appended.key, alsoInsert };
  },
}));

/**
 * Side-effects that fire after a successful add: refresh the file-status
 * cache (so the sidebar reflects the new row) and, when the user has
 * `autoSaveAbstract` on, write `reference/<key>.md` from the Crossref
 * metadata if no file is already there.
 */
async function afterEntryAdded(filePath: string, entry: BibEntry): Promise<void> {
  // The .bib has just materialised on disk (or already existed). Flip the
  // "exists" flag so the sidebar swaps the "will be created at <path>"
  // placeholder for the live path line. Idempotent.
  useBibliographyStore.setState({ exists: true });
  try {
    const prefs = await window.api.prefsGet();
    if (prefs.bibliography?.autoSaveAbstract) {
      // The IPC is idempotent — it skips when reference/<key>.{pdf,md} exists.
      await window.api.bibliographyAutoSaveAbstract(filePath, entry);
    }
  } catch {
    // Auto-save is a nice-to-have; never block the add on a failure here.
  }
  // Refresh the file-status cache so the new entry's row gets the right
  // local-file badge on first paint.
  void useBibliographyStore.getState().scanFileStatuses();
  // Suppress the unused-bind warning when filePath isn't directly consumed.
  void filePath;
}
