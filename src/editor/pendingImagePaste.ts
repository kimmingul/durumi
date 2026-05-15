import type { EditorView } from '@codemirror/view';

interface PendingImage {
  bytes: Uint8Array;
  mime: string;
  /** Live view reference at paste time; we re-resolve on flush in case it changed. */
  viewRef: EditorView;
}

/**
 * v0.2.11 — image-paste-into-untitled UX. When the user pastes an image
 * before the doc has a path, `saveImage` errors out (no doc dir to anchor
 * `assets/`). Instead of dropping the bytes on the floor with an `alert`,
 * we buffer them here and retry the insert after a successful Save As.
 *
 * The queue is module-scoped (one renderer == one editor) and FIFO. The
 * caller (a file-save success path) invokes `runPendingImageInserts` with
 * the just-saved doc path; each entry runs through `saveImage` and inserts
 * the resulting markdown at the current caret in turn.
 */
const queue: PendingImage[] = [];

export function enqueuePendingImage(item: PendingImage): void {
  queue.push(item);
}

export function pendingImageCount(): number {
  return queue.length;
}

export function clearPendingImages(): void {
  queue.length = 0;
}

export async function runPendingImageInserts(filePath: string): Promise<number> {
  if (queue.length === 0) return 0;
  // Drain into a local snapshot so reentrant pastes during the flush land
  // in a fresh queue rather than this loop.
  const items = queue.splice(0, queue.length);
  let inserted = 0;
  for (const item of items) {
    const view = item.viewRef;
    if (!view) continue;
    const result = await window.api.saveImage(item.bytes, item.mime, filePath);
    if ('error' in result) continue;
    const cursor = view.state.selection.main.head;
    const md = `![](${result.relPath})`;
    view.dispatch({
      changes: { from: cursor, insert: md },
      selection: { anchor: cursor + md.length },
    });
    inserted++;
  }
  return inserted;
}
