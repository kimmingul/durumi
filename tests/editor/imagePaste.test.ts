import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { handlePaste, handleDrop } from '../../src/editor/imagePaste';

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
});

afterEach(() => {
  (window as unknown as { api?: unknown }).api = originalApi;
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

  it('inserts pending absolute path when buffer is unsaved (v0.2.23 pending-assets flow)', async () => {
    // v0.2.23 — saveImage no longer errors with `no-file`. It writes the
    // bytes into the per-session pending-assets dir and returns the
    // absolute path. The renderer embeds that verbatim so the image
    // renders immediately via durumi-asset://; the first subsequent
    // save migrates the file into <docDir>/assets/.
    const view = viewWith('hello', 5);
    const pendingAbs = '/Users/x/Library/Application Support/durumi/pending-assets/s-1/img-1.png';
    fakeApi.saveImage.mockResolvedValueOnce({ absPath: pendingAbs });
    const file = makePngFile();
    const event = {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;

    handlePaste(event, view, { current: null });
    await flush();
    expect(view.state.doc.toString()).toBe(`hello![](${pendingAbs})`);
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

  it('drop on unsaved buffer inserts pending absolute path', async () => {
    const view = viewWith('hi', 2);
    const pendingAbs = '/tmp/durumi/pending-assets/s-1/img-2.png';
    fakeApi.saveImage.mockResolvedValueOnce({ absPath: pendingAbs });
    const event = {
      dataTransfer: { files: [makePngFile()] },
      preventDefault: vi.fn(),
    } as unknown as DragEvent;
    handleDrop(event, view, { current: null });
    await flush();
    expect(view.state.doc.toString()).toBe(`hi![](${pendingAbs})`);
    view.destroy();
  });
});
