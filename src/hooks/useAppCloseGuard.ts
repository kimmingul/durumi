import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { basenameOf } from '../utils/path';

/**
 * Intercepts the OS-level "close window" request and, when the buffer is
 * dirty, prompts the user to save / discard / cancel before the renderer
 * agrees to exit. Returning `true` lets the main process close the window;
 * `false` keeps it open.
 *
 * Pulled straight from App.tsx without behaviour changes. Reads/writes
 * appStore through `getState()` because the IPC callback's identity must
 * stay stable across renders and we always want the latest path/content.
 */
export function useAppCloseGuard(): void {
  useEffect(() => {
    return window.api.onAppRequestClose(async () => {
      const state = useAppStore.getState();
      if (!state.isDirty) return true;
      const choice = await window.api.confirmDiscard(basenameOf(state.filePath));
      if (choice === 'cancel') return false;
      if (choice === 'discard') return true;
      // 'save'
      try {
        if (state.filePath) {
          await window.api.fileSave(state.filePath, state.content);
          useAppStore.getState().markClean();
          return true;
        }
        const r = await window.api.fileSaveAs(state.content, 'untitled.md', state.filePath);
        if (!r) return false;
        useAppStore.getState().setFile(r.path, state.content);
        useAppStore.getState().markClean();
        return true;
      } catch {
        return false;
      }
    });
  }, []);
}
