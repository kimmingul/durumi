import { create } from 'zustand';
import {
  addReply as addReplyImmutable,
  emptySidecar,
  ensureMeta as ensureMetaImmutable,
  migrateMemoMeta,
  removeReply as removeReplyImmutable,
  setResolved,
  type MemoSidecar,
  type ThreadEntry,
} from '@shared/memoSidecar';

const AUTOSAVE_DEBOUNCE_MS = 1000;

/**
 * Authority for the in-memory copy of the per-document memo sidecar.
 *
 * Why a dedicated store and not a React hook?
 *  - Several components (`MemoCard`, `MemoPanel`, headless action wiring)
 *    need to react to the same state.
 *  - The autosave needs a single timer that survives component remounts.
 *  - The `appStore.filePath` change subscription has to live somewhere
 *    above the React tree.
 *
 * `docPath` is the only knob that owns the disk side. When null (untitled
 * doc), all updates stay in memory and the autosave is suppressed.
 */
interface MemoSidecarState {
  /** Path of the markdown file the current sidecar belongs to. Null = untitled. */
  docPath: string | null;
  sidecar: MemoSidecar;
  /** True while the initial fetch for `docPath` is in flight. */
  loading: boolean;
  /** True when the in-memory sidecar has unsaved changes (autosave-pending). */
  dirty: boolean;
  /** Display name for new replies. Mirrored from `Preferences.author.name`. */
  authorName: string;
  /** Idempotent: load (or reset) the sidecar for a doc path. */
  loadFor: (docPath: string | null) => Promise<void>;
  /** Save now if dirty. Otherwise no-op. */
  saveIfDirty: () => Promise<void>;
  setAuthor: (name: string) => void;
  markResolved: (id: string, value: boolean) => void;
  addReply: (id: string, text: string) => void;
  removeReply: (id: string, replyId: string) => void;
  migrateId: (oldId: string, newId: string) => void;
  ensureMeta: (id: string) => void;
  /** Replace the sidecar wholesale (used by prune-orphans on doc change). */
  setSidecar: (next: MemoSidecar, markDirty?: boolean) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutosave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void useMemoSidecarStore.getState().saveIfDirty();
  }, AUTOSAVE_DEBOUNCE_MS);
}

export const useMemoSidecarStore = create<MemoSidecarState>((set, get) => ({
  docPath: null,
  sidecar: emptySidecar(),
  loading: false,
  dirty: false,
  authorName: 'Anonymous',

  setAuthor: (name) => set({ authorName: name && name.length > 0 ? name : 'Anonymous' }),

  loadFor: async (docPath) => {
    // Cancel any pending save from the previous doc; we'll force-flush below.
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    // Best-effort: persist the previous doc's pending changes before swapping.
    const prev = get();
    if (prev.dirty && prev.docPath) {
      try {
        await window.api.memoSidecarWrite(prev.docPath, prev.sidecar);
      } catch {
        // ignore — we don't block the open on a sidecar write failure
      }
    }
    set({ docPath, sidecar: emptySidecar(), loading: true, dirty: false });
    if (!docPath) {
      set({ loading: false });
      return;
    }
    try {
      const loaded = await window.api.memoSidecarRead(docPath);
      // The user may have already swapped to another doc by the time we
      // resolve — only commit the result if the path still matches.
      if (get().docPath !== docPath) return;
      set({
        sidecar: loaded ?? emptySidecar(),
        loading: false,
        dirty: false,
      });
    } catch {
      if (get().docPath !== docPath) return;
      set({ sidecar: emptySidecar(), loading: false, dirty: false });
    }
  },

  saveIfDirty: async () => {
    const { dirty, docPath, sidecar } = get();
    if (!dirty || !docPath) return;
    // Optimistically clear dirty BEFORE the await; if the write fails we
    // re-mark dirty so the next change schedules another retry.
    set({ dirty: false });
    try {
      await window.api.memoSidecarWrite(docPath, sidecar);
    } catch {
      set({ dirty: true });
    }
  },

  setSidecar: (next, markDirty = true) => {
    if (next === get().sidecar) return;
    set({ sidecar: next, dirty: markDirty || get().dirty });
    if (markDirty && get().docPath) scheduleAutosave();
  },

  markResolved: (id, value) => {
    const next = setResolved(get().sidecar, id, value, new Date());
    if (next === get().sidecar) return;
    set({ sidecar: next, dirty: true });
    if (get().docPath) scheduleAutosave();
  },

  addReply: (id, text) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    const now = new Date();
    const entry: ThreadEntry = {
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `r-${now.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
      author: get().authorName,
      text: trimmed,
      createdAt: now.toISOString(),
    };
    const next = addReplyImmutable(get().sidecar, id, entry, now);
    set({ sidecar: next, dirty: true });
    if (get().docPath) scheduleAutosave();
  },

  removeReply: (id, replyId) => {
    const next = removeReplyImmutable(get().sidecar, id, replyId);
    if (next === get().sidecar) return;
    set({ sidecar: next, dirty: true });
    if (get().docPath) scheduleAutosave();
  },

  migrateId: (oldId, newId) => {
    const next = migrateMemoMeta(get().sidecar, oldId, newId);
    if (next === get().sidecar) return;
    set({ sidecar: next, dirty: true });
    if (get().docPath) scheduleAutosave();
  },

  ensureMeta: (id) => {
    const next = ensureMetaImmutable(get().sidecar, id, get().authorName, new Date());
    if (next === get().sidecar) return;
    // ensureMeta on first lookup is "neutral" metadata — only mark dirty when
    // we're attached to a doc, since untitled docs have no place to write.
    set({ sidecar: next, dirty: get().docPath !== null });
    if (get().docPath) scheduleAutosave();
  },
}));
