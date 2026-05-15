import { useCallback } from 'react';
import { useSidebarStore } from '../store/sidebarStore';

export interface WorkspaceMenu {
  /**
   * Picks a folder via the OS dialog, adds it to the workspace if it's
   * not already present, starts an fs watcher + git status poll, and
   * persists the new list to preferences.
   */
  openWorkspaceFolder: () => Promise<void>;
  /**
   * Removes a folder from the sidebar state. The main process is
   * responsible for updating prefs + unwatching the root before
   * dispatching the menu command, so this only handles the renderer
   * mirror.
   */
  closeWorkspaceFolder: (path: string) => void;
  /**
   * v0.2.10 — open a folder from the "Recent Folders" menu. Same effect
   * as `openWorkspaceFolder` but skips the OS dialog (the path was
   * persisted from a prior session, so it's already path-guard trusted).
   */
  openRecentFolder: (path: string) => Promise<void>;
}

/**
 * v0.2.10 — append a folder to `recentFolders` (MRU, deduplicated). The
 * main-side `addRecentFolder` is the persistence helper, but the renderer
 * never imports node code; we mirror the same logic over IPC by reading
 * the current list and writing back the deduplicated head.
 */
async function pushRecentFolder(path: string): Promise<void> {
  const prefs = await window.api.prefsGet();
  const next = [path, ...(prefs.recentFolders ?? []).filter((p) => p !== path)].slice(0, 10);
  await window.api.prefsSet({ recentFolders: next });
}

/**
 * Owns the workspace-folder menu commands: "Open Folder…" / "Close Folder".
 * The list of recent workspaces is rendered by the main process menu;
 * persistence + git-status polling for newly-added folders lives here so
 * App.tsx's `onMenuCommand` switch can shrink.
 */
export function useWorkspaceMenu(): WorkspaceMenu {
  const addFolder = useSidebarStore((s) => s.addFolder);
  const removeFolder = useSidebarStore((s) => s.removeFolder);
  const updateGitStatus = useSidebarStore((s) => s.updateGitStatus);

  const openWorkspaceFolder = useCallback(async () => {
    const p = await window.api.dialogOpenFolder();
    if (!p) return;
    void pushRecentFolder(p);
    const current = useSidebarStore.getState().workspaceFolders;
    if (current.includes(p)) return;
    addFolder(p);
    void window.api.fsWatchRoot(p);
    void window.api.gitGetStatus(p).then((s) => updateGitStatus(p, s)).catch(() => {});
    void window.api.prefsSet({ workspaceFolders: [...current, p] });
  }, [addFolder, updateGitStatus]);

  const closeWorkspaceFolder = useCallback(
    (path: string) => {
      // Main process already updated prefs + unwatched the root.
      removeFolder(path);
    },
    [removeFolder],
  );

  const openRecentFolder = useCallback(
    async (path: string) => {
      void pushRecentFolder(path);
      const current = useSidebarStore.getState().workspaceFolders;
      if (current.includes(path)) return;
      addFolder(path);
      void window.api.fsWatchRoot(path);
      void window.api.gitGetStatus(path).then((s) => updateGitStatus(path, s)).catch(() => {});
      void window.api.prefsSet({ workspaceFolders: [...current, path] });
    },
    [addFolder, updateGitStatus],
  );

  return { openWorkspaceFolder, closeWorkspaceFolder, openRecentFolder };
}
