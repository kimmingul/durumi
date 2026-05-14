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

  return { openWorkspaceFolder, closeWorkspaceFolder };
}
