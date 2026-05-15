import type { EditorView } from '@codemirror/view';
import { t } from '../i18n/t';
import { showToast } from '../store/toastStore';
import { enqueuePendingImage, runPendingImageInserts } from './pendingImagePaste';

async function fileToUint8(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

async function processFiles(
  files: File[],
  view: EditorView,
  filePath: string | null,
): Promise<boolean> {
  let inserted = false;
  let pendingShown = false;
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const buf = await fileToUint8(file);
    const result = await window.api.saveImage(buf, file.type, filePath);
    if ('error' in result) {
      // The save-image IPC needs a known doc directory; the document is
      // still untitled. Buffer the bytes so the next successful save can
      // retry the insert without the user re-pasting the image.
      enqueuePendingImage({ bytes: buf, mime: file.type, viewRef: view });
      if (!pendingShown) {
        pendingShown = true;
        showToast({
          message: t('image.noFileToast'),
          action: {
            label: t('image.noFileAction'),
            run: () => triggerSaveAs(),
          },
          ttlMs: 12000,
        });
      }
      return true;
    }
    const cursor = view.state.selection.main.head;
    const md = `![](${result.relPath})`;
    view.dispatch({
      changes: { from: cursor, insert: md },
      selection: { anchor: cursor + md.length },
    });
    inserted = true;
  }
  return inserted;
}

/**
 * Routes a "Save as…" request through the same renderer-level menu command
 * dispatcher the toolbar / menu use. Decoupling avoids a direct dependency
 * from the paste handler back into React component code.
 */
function triggerSaveAs(): void {
  window.dispatchEvent(new CustomEvent('durumi:menu-command', { detail: { type: 'fileCommand', cmd: 'saveAs' } }));
}

export function handlePaste(
  event: ClipboardEvent,
  view: EditorView,
  ref: { current: string | null },
): boolean {
  const items = event.clipboardData?.items;
  if (!items) return false;
  const files: File[] = [];
  for (const it of Array.from(items)) {
    if (it.kind === 'file') {
      const f = it.getAsFile();
      if (f && f.type.startsWith('image/')) files.push(f);
    }
  }
  if (!files.length) return false;
  event.preventDefault();
  void processFiles(files, view, ref.current);
  return true;
}

export function handleDrop(
  event: DragEvent,
  view: EditorView,
  ref: { current: string | null },
): boolean {
  const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
    f.type.startsWith('image/'),
  );
  if (!files.length) return false;
  event.preventDefault();
  void processFiles(files, view, ref.current);
  return true;
}

/**
 * Re-export of the pending-image runner so callers (e.g. the file-save hook)
 * can flush the queue once the document gains a path. Lives in a separate
 * module to keep the per-paste handler tiny and to allow unit tests to
 * stub the queue without spying on the paste pipeline.
 */
export { runPendingImageInserts };
