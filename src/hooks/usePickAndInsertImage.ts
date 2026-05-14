import { useCallback } from 'react';
import type { RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { useAppStore } from '../store/appStore';
import { t } from '../i18n/t';

/**
 * v0.1.11 Phase 2 — Toolbar "Image" button: opens the OS picker and
 * stashes the chosen file in `<doc_dir>/assets/img-<ts>-<rand>.<ext>`
 * using the same `saveImage` helper the paste/drop flow uses.
 *
 * v0.2.x — hardened: the renderer no longer reads the picked file off
 * disk. The previous flow opened the picker via IPC, then did
 * `fetch('file://' + picked)` in the renderer to slurp the bytes, then
 * called `saveImage`. With `sandbox: true` that `fetch` is meant to
 * fail; even when it didn't, it bypassed the path-guarded
 * `durumi-asset://` protocol that owns every other renderer-side disk
 * read. The whole pipeline now lives behind a single
 * `image:pickAndSave` IPC handled in main (dialog + read + write).
 *
 * Returns a stable callback that:
 * 1. Asks main to open the OS file picker and persist the result.
 * 2. Inserts a `![](relPath)` markdown image at the caret.
 *
 * No-ops cleanly when the editor isn't mounted or the picker is
 * cancelled; surfaces a "no file open" alert when the active buffer
 * has no on-disk anchor (matching the paste/drop UX).
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
      if (result.error === 'no-file') {
        // eslint-disable-next-line no-alert
        window.alert(t('image.noFileAlert'));
      }
      // Every other failure (cancelled / unsupported-extension /
      // read-error) is silent — the user either dismissed the dialog
      // intentionally or picked something we can't handle, and a popup
      // would be more annoying than informative.
      return;
    }
    const cursor = view.state.selection.main.head;
    const md = `![](${result.relPath})`;
    view.dispatch({
      changes: { from: cursor, insert: md },
      selection: { anchor: cursor + md.length },
    });
    view.focus();
  }, [editorViewRef, filePath]);
}
