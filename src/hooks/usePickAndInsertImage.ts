import { useCallback } from 'react';
import type { RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { useAppStore } from '../store/appStore';

/**
 * Toolbar "Image" button: opens the OS picker through the
 * `image:pickAndSave` IPC, which writes the bytes either next to the
 * active document (`<docDir>/assets/`) or — when the buffer is still
 * untitled — into the per-session pending-assets dir. Either way the
 * resulting link is inserted at the caret as a `![](…)` markdown image.
 *
 * v0.2.23 — the "Save the document first" alert is gone. Pending images
 * render immediately via the `durumi-asset://` protocol against the
 * absolute path; the first subsequent save migrates them into
 * `<docDir>/assets/` and rewrites the markdown automatically (see
 * `migratePendingInContent` in `electron/pendingAssets.ts`).
 */
export function usePickAndInsertImage(
  editorViewRef: RefObject<EditorView | null>,
): () => Promise<void> {
  const filePath = useAppStore((s) => s.filePath);
  return useCallback(async () => {
    const view = editorViewRef.current;
    if (!view) return;
    const result = await window.api.imagePickAndSave(filePath);
    if (!result.ok) {
      // Cancelled / unsupported extension / read error — silent. The user
      // either dismissed the dialog intentionally or picked something we
      // can't handle, and a popup would be more annoying than informative.
      return;
    }
    const link = 'relPath' in result ? result.relPath : result.absPath;
    const cursor = view.state.selection.main.head;
    const md = `![](${link})`;
    view.dispatch({
      changes: { from: cursor, insert: md },
      selection: { anchor: cursor + md.length },
    });
    view.focus();
  }, [editorViewRef, filePath]);
}
