import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory file store shared between the mocked fs/promises and the tests.
const fileStore = new Map<string, string>();

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/durumi-test' },
  shell: { openPath: vi.fn(async () => '') },
}));

// node:fs is imported for `promises` namespace + `watch`. Provide both, plus a
// `default` export so vitest 2.x can resolve `import x from 'node:fs'` as well.
const readFile = vi.fn(async (p: string) => {
  if (!fileStore.has(p)) {
    const e = new Error('ENOENT') as NodeJS.ErrnoException;
    e.code = 'ENOENT';
    throw e;
  }
  return fileStore.get(p)!;
});
const writeFile = vi.fn(async (p: string, c: string) => {
  fileStore.set(p, c);
});
const mkdir = vi.fn(async () => undefined);
const watchFn = vi.fn(() => ({ close: vi.fn() }));

vi.mock('node:fs', () => {
  const promises = { readFile, writeFile, mkdir };
  return {
    default: { promises, watch: watchFn },
    promises,
    watch: watchFn,
  };
});

vi.mock('node:fs/promises', () => ({
  default: { readFile, writeFile, mkdir },
  readFile,
  writeFile,
  mkdir,
}));

beforeEach(() => {
  fileStore.clear();
  readFile.mockClear();
  writeFile.mockClear();
  mkdir.mockClear();
  watchFn.mockClear();
  // Restore the default readFile implementation in case a test overrode it.
  readFile.mockImplementation(async (p: string) => {
    if (!fileStore.has(p)) {
      const e = new Error('ENOENT') as NodeJS.ErrnoException;
      e.code = 'ENOENT';
      throw e;
    }
    return fileStore.get(p)!;
  });
  watchFn.mockImplementation(() => ({ close: vi.fn() }));
  vi.resetModules();
});

const CSS_PATH = '/tmp/durumi-test/custom.css';

describe('customCss', () => {
  it('initializes file with template on first call', async () => {
    const { getCustomCss } = await import('../../electron/customCss');
    const css = await getCustomCss();
    expect(css).toContain('Durumi custom CSS');
    expect(fileStore.has(CSS_PATH)).toBe(true);
    expect(fileStore.get(CSS_PATH)).toContain('Durumi custom CSS');
  });

  it('returns existing content when file already exists', async () => {
    fileStore.set(CSS_PATH, 'body { color: red; }');
    const { getCustomCss } = await import('../../electron/customCss');
    expect(await getCustomCss()).toBe('body { color: red; }');
  });

  it('returns empty string and warns on non-ENOENT read failure', async () => {
    readFile.mockImplementationOnce(async () => {
      const e = new Error('EACCES') as NodeJS.ErrnoException;
      e.code = 'EACCES';
      throw e;
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { getCustomCss } = await import('../../electron/customCss');
    const out = await getCustomCss();
    expect(out).toBe('');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('exposes getCustomCssPath under userData', async () => {
    const { getCustomCssPath } = await import('../../electron/customCss');
    expect(getCustomCssPath()).toBe(CSS_PATH);
  });

  it('watchCustomCss debounces and forwards new content', async () => {
    vi.useFakeTimers();
    let firedCb: (() => void) | null = null;
    watchFn.mockImplementationOnce((_p: string, cb: () => void) => {
      firedCb = cb;
      return { close: vi.fn() };
    });
    fileStore.set(CSS_PATH, '/* initial */');
    const { watchCustomCss } = await import('../../electron/customCss');
    const received: string[] = [];
    const stop = watchCustomCss((css) => received.push(css));

    fileStore.set(CSS_PATH, '/* updated */');
    expect(firedCb).not.toBeNull();
    firedCb!();
    firedCb!(); // multiple rapid changes — debounce should collapse them
    await vi.advanceTimersByTimeAsync(310);
    // Allow microtasks for the await in the debounced callback.
    await Promise.resolve();
    await Promise.resolve();

    expect(received).toEqual(['/* updated */']);
    stop();
    vi.useRealTimers();
  });
});
