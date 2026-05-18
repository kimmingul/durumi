import type { EditorView } from '@codemirror/view';

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
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const buf = await fileToUint8(file);
    const result = await window.api.saveImage(buf, file.type, filePath);
    // v0.2.23 — `saveImage` always succeeds now. When the buffer is
    // untitled, the bytes land in the pending-assets dir and `result`
    // carries `absPath` instead of `relPath`. Either way we insert the
    // markdown image immediately; the first subsequent save migrates
    // pending files into `<docDir>/assets/` and rewrites the link.
    //
    // The abs path is percent-encoded because macOS userData lives under
    // `Library/Application Support/…` and CommonMark refuses unwrapped
    // spaces in URLs (the parser would skip the node and the user would
    // see literal markdown). `resolveImageSrc` mirrors the decode.
    const link = 'relPath' in result ? result.relPath : encodeURI(result.absPath);
    const cursor = view.state.selection.main.head;
    const md = `![](${link})`;
    view.dispatch({
      changes: { from: cursor, insert: md },
      selection: { anchor: cursor + md.length },
    });
    inserted = true;
  }
  return inserted;
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
