import { useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { useMemoSidecarStore } from '../store/memoSidecarStore';
import { basenameOf } from '../utils/path';

export interface FileMenuCommands {
  /**
   * Saves the current buffer. Uses `fileSave` when a path exists, falls back
   * to a Save As dialog otherwise. Also force-flushes pending memo-sidecar
   * edits so a manual Cmd+S never leaves thread/resolved changes in memory.
   * Returns `true` on success (or when the user cancels Save As, but we
   * report that as `false`).
   */
  doSave: () => Promise<boolean>;
  /**
   * Pre-flight guard for actions that would discard the current buffer
   * (new file, open file, etc.). Returns `true` if it's safe to proceed —
   * either the buffer was clean, the user picked Discard, or the user
   * picked Save and the save succeeded.
   */
  maybeDiscard: () => Promise<boolean>;
  /** New empty buffer (with dirty-discard guard). */
  doNew: () => Promise<void>;
  /** Open via OS file picker (with dirty-discard guard). */
  doOpen: () => Promise<void>;
  /** Save As — always prompts. */
  doSaveAs: () => Promise<void>;
  /** Open by absolute path (with dirty-discard guard). */
  doOpenPath: (path: string) => Promise<void>;
  /** Replace buffer with template content (with dirty-discard guard). */
  loadTemplate: (markdown: string) => Promise<void>;
}

/**
 * Owns the file-menu side of App.tsx: New / Open / Save / Save As, plus the
 * dirty-close confirmation dialog flow.
 *
 * Stays loosely coupled to React state by reading content / filePath through
 * subscriptions but writing back through Zustand setters. The exposed
 * functions are stable across renders within the lifetime of the same
 * `filePath` / `content` snapshot.
 */
export function useFileMenuCommands(): FileMenuCommands {
  const filePath = useAppStore((s) => s.filePath);
  const content = useAppStore((s) => s.content);
  const isDirty = useAppStore((s) => s.isDirty);
  const setFile = useAppStore((s) => s.setFile);
  const setContent = useAppStore((s) => s.setContent);
  const markClean = useAppStore((s) => s.markClean);

  const doSave = useCallback(async (): Promise<boolean> => {
    if (filePath) {
      const r = await window.api.fileSave(filePath, content);
      // v0.2.23 — main may have migrated pending-asset image refs into
      // `<docDir>/assets/` and rewritten the markdown to relative paths.
      // When that happens, `r.content` is the post-migration text on
      // disk; sync the buffer so the editor (and store) match.
      if (r.content !== undefined && r.content !== content) {
        setContent(r.content);
      }
      // Force-flush any pending sidecar edits next to the document so a Cmd+S
      // never leaves thread/resolved changes in memory only.
      await useMemoSidecarStore.getState().saveIfDirty();
      markClean();
      return true;
    }
    const r = await window.api.fileSaveAs(content, 'untitled.md', filePath);
    if (!r) return false;
    // v0.2.23 — same migration-aware sync as the file:save arm. Critical
    // here because the untitled → first save transition is exactly when
    // pending images get a real home.
    setFile(r.path, r.content ?? content);
    // After Save As, re-bind the sidecar to the new path so subsequent edits
    // land alongside the just-saved document.
    await useMemoSidecarStore.getState().loadFor(r.path);
    await useMemoSidecarStore.getState().saveIfDirty();
    markClean();
    return true;
  }, [filePath, content, setFile, setContent, markClean]);

  const maybeDiscard = useCallback(async (): Promise<boolean> => {
    if (!isDirty) return true;
    const choice = await window.api.confirmDiscard(basenameOf(filePath));
    if (choice === 'cancel') return false;
    if (choice === 'save') return doSave();
    return true;
  }, [isDirty, filePath, doSave]);

  const doNew = useCallback(async () => {
    if (!(await maybeDiscard())) return;
    setFile(null, '');
  }, [maybeDiscard, setFile]);

  const doOpen = useCallback(async () => {
    if (!(await maybeDiscard())) return;
    const r = await window.api.fileOpen();
    if (r) setFile(r.path, r.content);
  }, [maybeDiscard, setFile]);

  const doSaveAs = useCallback(async () => {
    // Pass `filePath` so main can seed the dialog with the doc's
    // current folder; without it macOS dumps the user in `~/Downloads`.
    const r = await window.api.fileSaveAs(content, basenameOf(filePath), filePath);
    if (r) {
      // v0.2.23 — `r.content` is set when main rewrote pending-asset
      // image refs into the doc's `assets/` dir during the save.
      setFile(r.path, r.content ?? content);
      markClean();
    }
  }, [content, filePath, setFile, markClean]);

  const doOpenPath = useCallback(
    async (path: string) => {
      if (!(await maybeDiscard())) return;
      const r = await window.api.fileOpenPath(path);
      setFile(r.path, r.content);
    },
    [maybeDiscard, setFile],
  );

  const loadTemplate = useCallback(
    async (markdown: string) => {
      if (!(await maybeDiscard())) return;
      setFile(null, markdown);
    },
    [maybeDiscard, setFile],
  );

  return { doSave, maybeDiscard, doNew, doOpen, doSaveAs, doOpenPath, loadTemplate };
}
