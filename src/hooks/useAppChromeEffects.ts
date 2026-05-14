import { useEffect } from 'react';
import type { Macro } from '@shared/ipc-contract';
import { useAppStore } from '../store/appStore';
import { useSidebarStore } from '../store/sidebarStore';
import { basenameOf } from '../utils/path';

/**
 * Bundle of small cross-cutting effects that keep the window chrome in sync
 * with app state:
 *
 * 1. Mirrors `appStore.theme` onto `<html data-theme="…">` so CSS variables
 *    flip without a reload.
 * 2. Loads the macros list once on mount + subscribes to live updates from
 *    the main process.
 * 3. Forwards OS-level theme changes into appStore so a system-following
 *    preference picks up dark/light flips automatically.
 * 4. Reacts to `git:status-changed` broadcasts by re-querying the affected
 *    workspace root.
 * 5. Updates the OS window title with a leading dirty-dot + basename of the
 *    active document.
 *
 * Each subscription cleans up on unmount.
 */
export function useAppChromeEffects(setMacros: (m: Macro[]) => void): void {
  const theme = useAppStore((s) => s.theme);
  const filePath = useAppStore((s) => s.filePath);
  const isDirty = useAppStore((s) => s.isDirty);
  const setSystemTheme = useAppStore((s) => s.setSystemTheme);
  const updateGitStatus = useSidebarStore((s) => s.updateGitStatus);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    void window.api.macrosGet().then(setMacros);
    return window.api.onMacrosChanged(setMacros);
  }, [setMacros]);

  useEffect(() => {
    return window.api.onThemeChanged((t) => setSystemTheme(t));
  }, [setSystemTheme]);

  // Re-fetch git status when the main process broadcasts an invalidation.
  useEffect(() => {
    return window.api.onGitStatusChanged((root) => {
      void window.api.gitGetStatus(root).then((s) => updateGitStatus(root, s)).catch(() => {});
    });
  }, [updateGitStatus]);

  useEffect(() => {
    const name = basenameOf(filePath);
    void window.api.windowSetTitle(`${isDirty ? '● ' : ''}${name} — Durumi`);
  }, [filePath, isDirty]);
}
