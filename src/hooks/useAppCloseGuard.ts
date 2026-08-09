import { useEffect } from 'react';
import {
  activeDocument,
  isDirty,
  saveDocument,
  useWorkspaceStore,
} from '../store/workspaceStore';
import { basenameOf } from '../utils/path';

/**
 * Intercepts the OS-level "close window" request and, when the buffer is
 * dirty, prompts the user to save / discard / cancel before the renderer
 * agrees to exit. Returning `true` lets the main process close the window;
 * `false` keeps it open.
 *
 * Reads the workspace through `getState()` because the IPC callback's identity
 * must stay stable across renders and we always want the latest document.
 *
 * **문서를 매번 다시 읽는다** (SPEC-V03-WORKSPACE-002 REQ-PANEL-015): 예전에는
 * 콜백 진입 시 `state`를 한 번 캡처한 뒤 `confirmDiscard`와 `fileSave` **두 개의
 * await**를 건너 그 낡은 내용을 저장하고 무조건 clean으로 표시했다 — 두 진입점
 * 중 창이 더 넓은 쪽이었다. 지금은 저장 직전에 현재 문서를 읽고, `saveDocument`가
 * 쓰기 시작 시점의 revision을 `savedRevision`에 대입하므로 그 사이의 편집은
 * dirty로 남는다.
 */
export function useAppCloseGuard(): void {
  useEffect(() => {
    return window.api.onAppRequestClose(async () => {
      const before = activeDocument(useWorkspaceStore.getState());
      if (!before || !isDirty(before)) return true;

      const choice = await window.api.confirmDiscard(basenameOf(before.path));
      if (choice === 'cancel') return false;
      if (choice === 'discard') return true;

      // 'save' — 확인 대화상자를 건너온 뒤이므로 문서를 **다시** 읽는다.
      try {
        const doc = activeDocument(useWorkspaceStore.getState());
        if (!doc) return false;

        if (doc.path !== null) {
          return await saveDocument(doc.id, async (path, text) => {
            await window.api.fileSave(path, text);
          });
        }

        const r = await window.api.fileSaveAs(doc.content, 'untitled.md', null);
        if (!r) return false;
        useWorkspaceStore.getState().setDocumentPath(doc.id, r.path, r.content ?? doc.content);
        return true;
      } catch {
        return false;
      }
    });
  }, []);
}
