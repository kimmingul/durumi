import { useCallback } from 'react';
import type { RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { useAppStore } from '../store/appStore';
import { t } from '../i18n/t';

/**
 * v0.1.11 Phase 2 — Toolbar "Image" button: opens the OS picker and reuses
 * the same `saveImage` IPC drag/paste flow uses, so the asset path lands in
 * `<doc_dir>/assets/img-<ts>-<rand>.<ext>` with identical normalization.
 *
 * Returns a stable callback that:
 * 1. Opens the OS file picker filtered to image extensions.
 * 2. Reads the picked file via `fetch('file://…')`.
 * 3. Persists it relative to the active document.
 * 4. Inserts a `![](relPath)` markdown image at the caret.
 *
 * No-ops cleanly when the editor isn't mounted or the picker is cancelled.
 */
export function usePickAndInsertImage(
  editorViewRef: RefObject<EditorView | null>,
): () => Promise<void> {
  const filePath = useAppStore((s) => s.filePath);
  return useCallback(async () => {
    const view = editorViewRef.current;
    if (!view) return;
    const picked = await window.api.dialogPickFile({
      title: t('toolbar.image'),
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
      ],
    });
    if (!picked) return;
    const resp = await fetch(`file://${picked}`);
    const arr = new Uint8Array(await resp.arrayBuffer());
    const ext = picked.split('.').pop()?.toLowerCase() ?? 'png';
    const mime =
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
      ext === 'gif' ? 'image/gif' :
      ext === 'webp' ? 'image/webp' :
      ext === 'svg' ? 'image/svg+xml' :
      'image/png';
    const result = await window.api.saveImage(arr, mime, filePath);
    if ('error' in result) {
      // eslint-disable-next-line no-alert
      window.alert(t('image.noFileAlert'));
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
