import { useCallback } from 'react';
import { useMemoSidecarStore } from '../store/memoSidecarStore';
import {
  activeDocument,
  isDirty as isDocumentDirty,
  saveDocument,
  useActiveDocument,
  useWorkspaceStore,
} from '../store/workspaceStore';
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
 *
 * 저장은 **문서 단위**다(SPEC-V03-WORKSPACE-002 REQ-PANEL-012) — `saveDocument`가
 * 쓰기 전에 revision을 붙잡고 완료 후 그 revision을 `savedRevision`에 대입하므로,
 * 쓰는 동안 타이핑된 편집이 clean으로 표시되던 창이 구조적으로 닫힌다
 * (REQ-PANEL-015). 여기 있던 `markClean()` 호출은 그래서 사라졌다.
 */
export function useFileMenuCommands(): FileMenuCommands {
  const filePath = useActiveDocument((d) => d?.path ?? null);
  const isDirty = useActiveDocument((d) => (d ? isDocumentDirty(d) : false));

  const doSave = useCallback(async (): Promise<boolean> => {
    const doc = activeDocument(useWorkspaceStore.getState());
    if (!doc) return false;

    if (doc.path !== null) {
      return saveDocument(doc.id, async (path, text) => {
        const r = await window.api.fileSave(path, text);
        // Force-flush any pending sidecar edits next to the document so a Cmd+S
        // never leaves thread/resolved changes in memory only.
        await useMemoSidecarStore.getState().saveIfDirty();
        // v0.2.23 — main may have migrated pending-asset image refs into
        // `<docDir>/assets/` and rewritten the markdown to relative paths.
        // 돌려주면 `saveDocument`가 **아무도 타이핑하지 않았을 때만** 버퍼에
        // 반영한다.
        return r.content;
      });
    }

    const r = await window.api.fileSaveAs(doc.content, 'untitled.md', null);
    if (!r) return false;
    // v0.2.23 — same migration-aware sync as the file:save arm. Critical
    // here because the untitled → first save transition is exactly when
    // pending images get a real home.
    useWorkspaceStore.getState().setDocumentPath(doc.id, r.path, r.content ?? doc.content);
    // After Save As, re-bind the sidecar to the new path so subsequent edits
    // land alongside the just-saved document.
    await useMemoSidecarStore.getState().loadFor(r.path);
    await useMemoSidecarStore.getState().saveIfDirty();
    return true;
  }, []);

  const maybeDiscard = useCallback(async (): Promise<boolean> => {
    if (!isDirty) return true;
    const choice = await window.api.confirmDiscard(basenameOf(filePath));
    if (choice === 'cancel') return false;
    if (choice === 'save') return doSave();
    return true;
  }, [isDirty, filePath, doSave]);

  const doNew = useCallback(async () => {
    if (!(await maybeDiscard())) return;
    useWorkspaceStore.getState().openInActivePanel(null, '');
  }, [maybeDiscard]);

  const doOpen = useCallback(async () => {
    if (!(await maybeDiscard())) return;
    const r = await window.api.fileOpen();
    // 이미 그 경로를 열고 있는 패널이 있으면 새 뷰를 만들지 않고 그 패널을
    // 활성화한다 (REQ-PANEL-011 — v0.3에서 dual-open은 금지된다).
    if (r) useWorkspaceStore.getState().openInActivePanel(r.path, r.content);
  }, [maybeDiscard]);

  const doSaveAs = useCallback(async () => {
    const doc = activeDocument(useWorkspaceStore.getState());
    if (!doc) return;
    // Pass `filePath` so main can seed the dialog with the doc's
    // current folder; without it macOS dumps the user in `~/Downloads`.
    const r = await window.api.fileSaveAs(doc.content, basenameOf(doc.path), doc.path);
    if (r) {
      // v0.2.23 — `r.content` is set when main rewrote pending-asset
      // image refs into the doc's `assets/` dir during the save.
      useWorkspaceStore.getState().setDocumentPath(doc.id, r.path, r.content ?? doc.content);
    }
  }, []);

  const doOpenPath = useCallback(
    async (path: string) => {
      if (!(await maybeDiscard())) return;
      const r = await window.api.fileOpenPath(path);
      useWorkspaceStore.getState().openInActivePanel(r.path, r.content);
    },
    [maybeDiscard],
  );

  const loadTemplate = useCallback(
    async (markdown: string) => {
      if (!(await maybeDiscard())) return;
      useWorkspaceStore.getState().openInActivePanel(null, markdown);
    },
    [maybeDiscard],
  );

  return { doSave, maybeDiscard, doNew, doOpen, doSaveAs, doOpenPath, loadTemplate };
}
