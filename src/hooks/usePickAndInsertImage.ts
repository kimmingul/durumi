import { useCallback } from 'react';
import type { EditorView } from '@codemirror/view';
import { useActiveDocument } from '../store/workspaceStore';

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
  getActiveView: () => EditorView | null,
): () => Promise<void> {
  const filePath = useActiveDocument((d) => d?.path ?? null);
  return useCallback(async () => {
    const view = getActiveView();
    if (!view) return;
    const result = await window.api.imagePickAndSave(filePath);
    if (!result.ok) {
      // Cancelled / unsupported extension / read error — silent. The user
      // either dismissed the dialog intentionally or picked something we
      // can't handle, and a popup would be more annoying than informative.
      return;
    }
    // Pending-asset paths can contain spaces (macOS userData lives under
    // `Library/Application Support/…`). CommonMark refuses unwrapped
    // spaces in image URLs, so the parser would silently fail to
    // tokenise the link and the user would see raw markdown. Percent-
    // encode at insert time; `resolveImageSrc` mirrors the decode before
    // wrapping in durumi-asset://.
    const link = 'relPath' in result ? result.relPath : encodeURI(result.absPath);
    const cursor = view.state.selection.main.head;
    const md = `![](${link})`;
    view.dispatch({
      changes: { from: cursor, insert: md },
      selection: { anchor: cursor + md.length },
    });
    view.focus();
  }, [getActiveView, filePath]);
}
