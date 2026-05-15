import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { handlePaste, handleDrop } from '../../src/editor/imagePaste';
import {
  clearPendingImages,
  pendingImageCount,
  runPendingImageInserts,
} from '../../src/editor/pendingImagePaste';
import { useToastStore } from '../../src/store/toastStore';

function viewWith(doc: string, anchor: number, head = anchor): EditorView {
  return new EditorView({
    state: EditorState.create({ doc, selection: { anchor, head } }),
  });
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

// jsdom's File doesn't always implement arrayBuffer(); use a minimal fake
// that satisfies the surface our code touches.
function makePngFile(name = 'pasted.png', type = 'image/png'): File {
  const data = new Uint8Array([1, 2, 3]);
  return {
    name,
    type,
    size: data.byteLength,
    arrayBuffer: async () => data.buffer.slice(0),
  } as unknown as File;
}

interface FakeApi {
  saveImage: ReturnType<typeof vi.fn>;
}

let originalApi: unknown;
let fakeApi: FakeApi;

beforeEach(() => {
  originalApi = (window as unknown as { api?: unknown }).api;
  fakeApi = {
    saveImage: vi.fn(async () => ({ relPath: 'assets/img-x.png' })),
  };
  (window as unknown as { api: FakeApi }).api = fakeApi;
  clearPendingImages();
  useToastStore.getState().clear();
});

afterEach(() => {
  (window as unknown as { api?: unknown }).api = originalApi;
  clearPendingImages();
  useToastStore.getState().clear();
});

describe('handlePaste', () => {
  it('returns false when clipboardData is missing', () => {
    const view = viewWith('', 0);
    const event = { clipboardData: null, preventDefault: vi.fn() } as unknown as ClipboardEvent;
    expect(handlePaste(event, view, { current: '/foo/bar.md' })).toBe(false);
    view.destroy();
  });

  it('returns false when no image files are present', () => {
    const view = viewWith('', 0);
    const event = {
      clipboardData: {
        items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
      },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    expect(handlePaste(event, view, { current: '/foo/bar.md' })).toBe(false);
    expect(fakeApi.saveImage).not.toHaveBeenCalled();
    view.destroy();
  });

  it('intercepts paste of an image and inserts markdown at cursor', async () => {
    const view = viewWith('hello', 5);
    const file = makePngFile();
    const preventDefault = vi.fn();
    const event = {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      },
      preventDefault,
    } as unknown as ClipboardEvent;

    const result = handlePaste(event, view, { current: '/foo/bar.md' });
    expect(result).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    await flush();
    expect(fakeApi.saveImage).toHaveBeenCalledTimes(1);
    const [bufArg, mimeArg, ctxArg] = fakeApi.saveImage.mock.calls[0]!;
    expect(bufArg).toBeInstanceOf(Uint8Array);
    expect(mimeArg).toBe('image/png');
    expect(ctxArg).toBe('/foo/bar.md');
    expect(view.state.doc.toString()).toBe('hello![](assets/img-x.png)');
    view.destroy();
  });

  it('queues a pending insert + shows a Save-as toast when the doc is unsaved', async () => {
    const view = viewWith('hello', 5);
    fakeApi.saveImage.mockResolvedValueOnce({ error: 'no-file' });
    const file = makePngFile();
    const event = {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;

    handlePaste(event, view, { current: null });
    await flush();
    // The doc didn't change — bytes were buffered for retry instead.
    expect(view.state.doc.toString()).toBe('hello');
    expect(pendingImageCount()).toBe(1);
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.action).not.toBeNull();
    expect(toasts[0]!.action!.label.length).toBeGreaterThan(0);
    view.destroy();
  });

  it('ignores non-image file kinds in clipboard', () => {
    const view = viewWith('', 0);
    const txt = { name: 'note.txt', type: 'text/plain' } as unknown as File;
    const event = {
      clipboardData: {
        items: [{ kind: 'file', type: 'text/plain', getAsFile: () => txt }],
      },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    expect(handlePaste(event, view, { current: '/foo/bar.md' })).toBe(false);
    expect(fakeApi.saveImage).not.toHaveBeenCalled();
    view.destroy();
  });
});

describe('runPendingImageInserts (v0.2.11 retry-after-save flow)', () => {
  it('drains the queue and inserts each buffered image once a path exists', async () => {
    const view = viewWith('hello', 5);
    // Simulate two pastes into an untitled doc.
    fakeApi.saveImage.mockResolvedValueOnce({ error: 'no-file' });
    fakeApi.saveImage.mockResolvedValueOnce({ error: 'no-file' });
    const fileA = makePngFile('a.png');
    const fileB = makePngFile('b.png');
    handlePaste(
      {
        clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => fileA }] },
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent,
      view,
      { current: null },
    );
    handlePaste(
      {
        clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => fileB }] },
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent,
      view,
      { current: null },
    );
    await flush();
    expect(pendingImageCount()).toBe(2);

    // Now the user has saved; saveImage starts to succeed.
    fakeApi.saveImage.mockReset();
    fakeApi.saveImage
      .mockResolvedValueOnce({ relPath: 'assets/img-a.png' })
      .mockResolvedValueOnce({ relPath: 'assets/img-b.png' });

    const inserted = await runPendingImageInserts('/foo/bar.md');
    expect(inserted).toBe(2);
    expect(pendingImageCount()).toBe(0);
    const doc = view.state.doc.toString();
    expect(doc).toContain('![](assets/img-a.png)');
    expect(doc).toContain('![](assets/img-b.png)');
    view.destroy();
  });

  it('returns 0 when the queue is empty', async () => {
    expect(await runPendingImageInserts('/foo/bar.md')).toBe(0);
  });

  it('bug repro: pre-fix App.tsx effect would have inserted queued bytes into an open-target file', async () => {
    // Bug guard: pre-fix, the App.tsx drain effect was
    //   useEffect(() => { if (!filePath) return; runPendingImageInserts(filePath); }, [filePath])
    // which ran on EVERY filePath transition — including File > Open
    // / sidebar click / quick-open — silently inserting queued bytes
    // into a freshly opened, unrelated file. This test reproduces that
    // exact scenario at the queue level, then asserts the FIX (a
    // `pendingDrainArmed` gate that defaults to false unless armed by
    // a save-driven path, plus a `clearPendingImages()` call on open
    // paths) leaves the unrelated buffer untouched.
    const view = viewWith('unrelated content', 17);
    const originalDoc = view.state.doc.toString();
    fakeApi.saveImage.mockResolvedValueOnce({ error: 'no-file' });
    handlePaste(
      {
        clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => makePngFile() }] },
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent,
      view,
      { current: null },
    );
    await flush();
    expect(pendingImageCount()).toBe(1);

    fakeApi.saveImage.mockReset();
    fakeApi.saveImage.mockResolvedValue({ relPath: 'assets/leak.png' });

    // === Fix's open-path behavior: clear + leave gate disarmed. ===
    const pendingDrainArmed = { current: false };
    clearPendingImages();
    pendingDrainArmed.current = false;

    // === Fix's drain effect (gated). ===
    const fakeFilePath = '/unrelated/file.md';
    if (fakeFilePath && pendingDrainArmed.current) {
      pendingDrainArmed.current = false;
      await runPendingImageInserts(fakeFilePath);
    }

    // Pre-fix: saveImage would have been called and the doc would
    // contain `![](assets/leak.png)`. Post-fix: untouched.
    expect(fakeApi.saveImage).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe(originalDoc);
    expect(view.state.doc.toString()).not.toContain('leak.png');
    view.destroy();
  });

  it('verifies the save-driven path still flushes (positive case for the gate)', async () => {
    const view = viewWith('hello', 5);
    fakeApi.saveImage.mockResolvedValueOnce({ error: 'no-file' });
    handlePaste(
      {
        clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => makePngFile() }] },
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent,
      view,
      { current: null },
    );
    await flush();
    expect(pendingImageCount()).toBe(1);

    fakeApi.saveImage.mockReset();
    fakeApi.saveImage.mockResolvedValueOnce({ relPath: 'assets/saved.png' });

    // Save-driven entry: gate is armed BEFORE the filePath transition.
    const pendingDrainArmed = { current: true };
    const fakeFilePath = '/saved/file.md';
    if (fakeFilePath && pendingDrainArmed.current) {
      pendingDrainArmed.current = false;
      await runPendingImageInserts(fakeFilePath);
    }
    expect(view.state.doc.toString()).toContain('![](assets/saved.png)');
    view.destroy();
  });

  it('drops queued bytes when the buffer is replaced via open (no silent insert into wrong doc)', async () => {
    // Bug guard: pre-fix, App.tsx flushed the queue on ANY filePath
    // transition (including File > Open / sidebar click / quick-open),
    // which silently mutated an unrelated file. The new App.tsx wires
    // open paths to clearPendingImages() before the transition. This
    // test pins that contract at the queue-module boundary: once the
    // queue is cleared, even a "fresh path" call cannot leak old bytes.
    const view = viewWith('unrelated content', 17);
    const originalDoc = view.state.doc.toString();
    fakeApi.saveImage.mockResolvedValueOnce({ error: 'no-file' });
    handlePaste(
      {
        clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => makePngFile() }] },
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent,
      view,
      { current: null },
    );
    await flush();
    expect(pendingImageCount()).toBe(1);

    // Simulate the open-path bypass: queue is cleared BEFORE the new
    // file's path becomes active.
    clearPendingImages();
    expect(pendingImageCount()).toBe(0);

    // Now the unrelated file's path becomes active — saveImage would
    // succeed if anything were left in the queue. Drain must be a no-op.
    fakeApi.saveImage.mockReset();
    fakeApi.saveImage.mockResolvedValue({ relPath: 'assets/should-not-insert.png' });
    const inserted = await runPendingImageInserts('/unrelated/file.md');
    expect(inserted).toBe(0);
    expect(fakeApi.saveImage).not.toHaveBeenCalled();
    // The unrelated buffer is untouched.
    expect(view.state.doc.toString()).toBe(originalDoc);
    view.destroy();
  });

  it('skips entries whose saveImage retry still errors', async () => {
    const view = viewWith('x', 1);
    fakeApi.saveImage.mockResolvedValueOnce({ error: 'no-file' });
    handlePaste(
      {
        clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => makePngFile() }] },
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent,
      view,
      { current: null },
    );
    await flush();
    fakeApi.saveImage.mockReset();
    fakeApi.saveImage.mockResolvedValueOnce({ error: 'still-broken' });
    const inserted = await runPendingImageInserts('/foo/bar.md');
    expect(inserted).toBe(0);
    expect(view.state.doc.toString()).toBe('x');
    view.destroy();
  });
});

describe('handleDrop', () => {
  it('returns false when no image files are dropped', () => {
    const view = viewWith('', 0);
    const event = {
      dataTransfer: { files: [] },
      preventDefault: vi.fn(),
    } as unknown as DragEvent;
    expect(handleDrop(event, view, { current: '/foo/bar.md' })).toBe(false);
    view.destroy();
  });

  it('intercepts drop of an image and inserts markdown', async () => {
    const view = viewWith('hi', 2);
    const file = makePngFile('drop.png');
    const preventDefault = vi.fn();
    const event = {
      dataTransfer: { files: [file] },
      preventDefault,
    } as unknown as DragEvent;

    expect(handleDrop(event, view, { current: '/foo/bar.md' })).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    await flush();
    expect(fakeApi.saveImage).toHaveBeenCalledTimes(1);
    expect(view.state.doc.toString()).toBe('hi![](assets/img-x.png)');
    view.destroy();
  });
});
