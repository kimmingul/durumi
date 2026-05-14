import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { useSidebarStore } from '../store/sidebarStore';
import { useRightSidebarStore } from '../store/rightSidebarStore';
import { useMemoPanelStore } from '../store/memoPanelStore';
import { useMemoSidecarStore } from '../store/memoSidecarStore';
import { useLanguage, resolveRendererLang } from '../i18n/t';
import { applyStyleSet } from '../styles/applyStyles';

/**
 * One-shot bootstrap that fans out the persisted preferences blob into the
 * various Zustand stores at app startup. Pulls workspace folders, sidebar
 * geometry, memo-panel width, author name, default edit mode, and applies
 * the persisted journal-style preset so the editor + export pipeline pick
 * it up without an app restart.
 *
 * Side effects: starts an fs watcher and queries git status for every
 * persisted workspace folder. Idempotent — only runs once per mount.
 */
export function usePreferencesInit(): void {
  const setThemePreference = useAppStore((s) => s.setThemePreference);
  const setWorkspaceFolders = useSidebarStore((s) => s.setWorkspaceFolders);
  const updateGitStatus = useSidebarStore((s) => s.updateGitStatus);
  const setMemoPanelWidth = useMemoPanelStore((s) => s.setWidth);
  const { setLang } = useLanguage();

  useEffect(() => {
    void window.api.prefsGet().then((prefs) => {
      setThemePreference(prefs.theme);
      setLang(resolveRendererLang(prefs.language));
      const folders = prefs.workspaceFolders ?? [];
      setWorkspaceFolders(folders);
      for (const p of folders) {
        void window.api.fsWatchRoot(p);
        void window.api.gitGetStatus(p).then((s) => updateGitStatus(p, s)).catch(() => {});
      }
      if (prefs.sidebar) {
        useSidebarStore.setState({
          visible: prefs.sidebar.visible,
          activeTab: prefs.sidebar.activeTab,
          width: prefs.sidebar.width,
        });
      }
      if (prefs.rightSidebar) {
        useRightSidebarStore.setState({
          visible: prefs.rightSidebar.visible,
          activeTab: prefs.rightSidebar.activeTab,
          width: prefs.rightSidebar.width,
        });
      }
      if (prefs.memoPanel) {
        setMemoPanelWidth(prefs.memoPanel.width);
      }
      if (prefs.author?.name) {
        useMemoSidecarStore.getState().setAuthor(prefs.author.name);
      }
      if (prefs.editor?.defaultMode) {
        useAppStore.getState().setEditMode(prefs.editor.defaultMode);
      }
      // v0.1.11 Phase 3 — inject the persisted journal-style preset into
      // the document so the editor + export pipeline pick it up without
      // an app restart.
      if (prefs.editor?.styles) {
        applyStyleSet(prefs.editor.styles);
      }
    });
  }, [setThemePreference, setWorkspaceFolders, updateGitStatus, setLang, setMemoPanelWidth]);
}
