import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateName,
  runOp,
  createInside,
  renameTo,
  trashWithConfirm,
  copyToClipboard,
} from '../../src/components/sidebar/fileOps';

interface FakeApi {
  filesCreate: ReturnType<typeof vi.fn>;
  filesCreateFolder: ReturnType<typeof vi.fn>;
  filesRename: ReturnType<typeof vi.fn>;
  filesDuplicate: ReturnType<typeof vi.fn>;
  filesTrash: ReturnType<typeof vi.fn>;
  filesReveal: ReturnType<typeof vi.fn>;
}

let originalApi: unknown;
let originalPrompt: typeof window.prompt;
let originalConfirm: typeof window.confirm;
let originalAlert: typeof window.alert;
let api: FakeApi;
let alerts: string[];

beforeEach(() => {
  alerts = [];
  originalApi = (window as unknown as { api?: unknown }).api;
  originalPrompt = window.prompt.bind(window);
  originalConfirm = window.confirm.bind(window);
  originalAlert = window.alert.bind(window);
  api = {
    filesCreate: vi.fn(async (p: string) => ({ ok: true, path: p })),
    filesCreateFolder: vi.fn(async (p: string) => ({ ok: true, path: p })),
    filesRename: vi.fn(async (_o: string, p: string) => ({ ok: true, path: p })),
    filesDuplicate: vi.fn(async (p: string) => ({ ok: true, path: `${p}.copy` })),
    filesTrash: vi.fn(async (p: string) => ({ ok: true, path: p })),
    filesReveal: vi.fn(async (p: string) => ({ ok: true, path: p })),
  };
  (window as unknown as { api: FakeApi }).api = api;
  window.alert = (msg?: unknown) => { alerts.push(String(msg)); };
});

afterEach(() => {
  (window as unknown as { api?: unknown }).api = originalApi;
  window.prompt = originalPrompt;
  window.confirm = originalConfirm;
  window.alert = originalAlert;
});

describe('validateName', () => {
  it('rejects empty / dot-only names', () => {
    expect(validateName('')).not.toBeNull();
    expect(validateName('  ')).not.toBeNull();
    expect(validateName('.')).not.toBeNull();
    expect(validateName('..')).not.toBeNull();
  });
  it('rejects names with path separators', () => {
    expect(validateName('a/b')).not.toBeNull();
    expect(validateName('a\\b')).not.toBeNull();
  });
  it('accepts plain names', () => {
    expect(validateName('foo.md')).toBeNull();
    expect(validateName('  foo.md  ')).toBeNull();
    expect(validateName('.gitignore')).toBeNull();
  });
});

describe('runOp', () => {
  it('returns the path on success', async () => {
    const r = await runOp(async () => ({ ok: true, path: '/a' }));
    expect(r).toBe('/a');
    expect(alerts).toEqual([]);
  });
  it('alerts and returns null on { ok: false }', async () => {
    const r = await runOp(async () => ({ ok: false, error: 'nope' }));
    expect(r).toBeNull();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain('nope');
  });
  it('alerts and returns null when the op throws', async () => {
    const r = await runOp(async () => { throw new Error('boom'); });
    expect(r).toBeNull();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain('boom');
  });
});

describe('createInside', () => {
  it('returns null and skips IPC when the user cancels the prompt', async () => {
    window.prompt = () => null;
    const r = await createInside('/root', 'file');
    expect(r).toBeNull();
    expect(api.filesCreate).not.toHaveBeenCalled();
  });
  it('alerts on invalid names', async () => {
    window.prompt = () => 'a/b';
    const r = await createInside('/root', 'file');
    expect(r).toBeNull();
    expect(alerts).toHaveLength(1);
    expect(api.filesCreate).not.toHaveBeenCalled();
  });
  it('calls filesCreate with the joined path for files', async () => {
    window.prompt = () => 'note.md';
    const r = await createInside('/root', 'file');
    expect(r).toBe('/root/note.md');
    expect(api.filesCreate).toHaveBeenCalledWith('/root/note.md');
  });
  it('calls filesCreateFolder for folders', async () => {
    window.prompt = () => 'sub';
    const r = await createInside('/root', 'folder');
    expect(r).toBe('/root/sub');
    expect(api.filesCreateFolder).toHaveBeenCalledWith('/root/sub');
  });
  it('trims surrounding whitespace before joining', async () => {
    window.prompt = () => '  note.md  ';
    await createInside('/root', 'file');
    expect(api.filesCreate).toHaveBeenCalledWith('/root/note.md');
  });
});

describe('renameTo', () => {
  it('calls filesRename with the new sibling path', async () => {
    const r = await renameTo('/a/b/old.md', 'new.md');
    expect(r).toBe('/a/b/new.md');
    expect(api.filesRename).toHaveBeenCalledWith('/a/b/old.md', '/a/b/new.md');
  });
  it('returns the old path unchanged when name is identical', async () => {
    const r = await renameTo('/a/b/old.md', 'old.md');
    // joinPath('/a/b','old.md') === oldPath, so we short-circuit.
    expect(r).toBe('/a/b/old.md');
    expect(api.filesRename).not.toHaveBeenCalled();
  });
});

describe('trashWithConfirm', () => {
  it('does nothing when user declines confirmation', async () => {
    window.confirm = () => false;
    const r = await trashWithConfirm('/a/b/c.md');
    expect(r).toBeNull();
    expect(api.filesTrash).not.toHaveBeenCalled();
  });
  it('calls filesTrash when user accepts', async () => {
    window.confirm = () => true;
    const r = await trashWithConfirm('/a/b/c.md');
    expect(r).toBe('/a/b/c.md');
    expect(api.filesTrash).toHaveBeenCalledWith('/a/b/c.md');
  });
});

describe('copyToClipboard', () => {
  it('writes via navigator.clipboard when available', async () => {
    const writeText = vi.fn(async () => {});
    const original = (navigator as unknown as { clipboard?: unknown }).clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    await copyToClipboard('hello');
    expect(writeText).toHaveBeenCalledWith('hello');
    if (original === undefined) {
      delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    } else {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: original });
    }
  });
  it('swallows clipboard errors silently', async () => {
    const writeText = vi.fn(async () => { throw new Error('denied'); });
    const original = (navigator as unknown as { clipboard?: unknown }).clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    await expect(copyToClipboard('x')).resolves.toBeUndefined();
    if (original === undefined) {
      delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    } else {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: original });
    }
  });
});
