import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron's `app` so we can resolve a fixed userData path.
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => `/tmp/durumi-test-userdata-${name}`,
  },
  shell: {
    openPath: vi.fn(async () => ''),
  },
}));

// B2 #1 mock pattern: shared `vi.fn()` instances exposed via both `default`
// and named exports so `import { promises as fs } from 'node:fs'` works.
vi.mock('node:fs', () => {
  const readFile = vi.fn();
  const writeFile = vi.fn();
  const mkdir = vi.fn();
  const watch = vi.fn();
  const promises = { readFile, writeFile, mkdir };
  return {
    default: { promises, watch },
    promises,
    watch,
  };
});

import { promises as fs, watch as fsWatch } from 'node:fs';
import { getMacros, getMacrosPath, watchMacros } from '../../electron/macros';

const readFileMock = fs.readFile as unknown as ReturnType<typeof vi.fn>;
const writeFileMock = fs.writeFile as unknown as ReturnType<typeof vi.fn>;
const mkdirMock = fs.mkdir as unknown as ReturnType<typeof vi.fn>;
const watchMock = fsWatch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  readFileMock.mockReset();
  writeFileMock.mockReset();
  mkdirMock.mockReset();
  watchMock.mockReset();
});

describe('getMacrosPath', () => {
  it('returns a path under userData', () => {
    expect(getMacrosPath()).toBe('/tmp/durumi-test-userdata-userData/macros.json');
  });
});

describe('getMacros', () => {
  it('initializes the file with starter set on first launch (ENOENT)', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    readFileMock.mockRejectedValueOnce(enoent);
    mkdirMock.mockResolvedValueOnce(undefined);
    writeFileMock.mockResolvedValueOnce(undefined);

    const macros = await getMacros();

    expect(mkdirMock).toHaveBeenCalledTimes(1);
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    // First-launch ships the date + horizontal-rule defaults plus the
    // medical-research presets layered in by Phase M3.
    expect(macros.length).toBeGreaterThanOrEqual(2);
    expect(macros[0]?.keybind).toBe('Mod-Shift-D');
    expect(macros[1]?.keybind).toBe('Mod-Shift-H');
    expect(macros.some((m) => m.keybind === 'Mod-Alt-P')).toBe(true);
    expect(macros.some((m) => m.keybind === 'Mod-Alt-K')).toBe(true);
  });

  it('parses a valid macros.json', async () => {
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        macros: [
          { name: 'Sig', keybind: 'Mod-Shift-S', insertion: '— Sincerely' },
        ],
      }),
    );
    const macros = await getMacros();
    expect(macros).toEqual([
      { name: 'Sig', keybind: 'Mod-Shift-S', insertion: '— Sincerely' },
    ]);
  });

  it('returns [] and logs a warning on invalid JSON', async () => {
    readFileMock.mockResolvedValueOnce('this is not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const macros = await getMacros();
    expect(macros).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('skips entries with the wrong shape and keeps the rest', async () => {
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        macros: [
          { name: 'Good', keybind: 'Mod-1', insertion: 'one' },
          { name: 'NoKey', insertion: 'whoops' },
          { name: 'WrongTypes', keybind: 1, insertion: 2 },
          { name: 'AlsoGood', keybind: 'Mod-2', insertion: 'two' },
        ],
      }),
    );
    const macros = await getMacros();
    expect(macros.map((m) => m.name)).toEqual(['Good', 'AlsoGood']);
  });

  it('returns [] when macros field is missing or not an array', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify({ other: 'thing' }));
    expect(await getMacros()).toEqual([]);
    readFileMock.mockResolvedValueOnce(JSON.stringify({ macros: 'oops' }));
    expect(await getMacros()).toEqual([]);
  });
});

describe('watchMacros', () => {
  it('fires the callback (debounced) on file change', async () => {
    vi.useFakeTimers();
    let onChange: (() => void) | null = null;
    const close = vi.fn();
    watchMock.mockImplementation((_p: string, cb: () => void) => {
      onChange = cb;
      return { close } as unknown as ReturnType<typeof fsWatch>;
    });
    readFileMock.mockResolvedValue(
      JSON.stringify({
        macros: [{ name: 'X', keybind: 'Mod-X', insertion: 'x' }],
      }),
    );
    const cb = vi.fn();
    const stop = watchMacros(cb);

    onChange!();
    onChange!();
    onChange!();

    // Before the debounce window elapses, no calls.
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(310);
    // Allow the queued microtasks (getMacros() promise) to resolve.
    await vi.runAllTimersAsync();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]?.[0]).toEqual([
      { name: 'X', keybind: 'Mod-X', insertion: 'x' },
    ]);

    stop();
    expect(close).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('returns a no-op stopper when fs.watch throws', () => {
    watchMock.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const stop = watchMacros(() => undefined);
    expect(typeof stop).toBe('function');
    expect(() => stop()).not.toThrow();
    warn.mockRestore();
  });

  it('attaches successfully after getMacros has materialised the file (first-launch sequence)', async () => {
    // Simulate first launch: readFile ENOENT → mkdir/writeFile, then watcher
    // attaches against an existing file (no throw). This mirrors the bootstrap
    // ordering in main.ts so the hot-reload path works without restart.
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    readFileMock.mockRejectedValueOnce(enoent);
    mkdirMock.mockResolvedValueOnce(undefined);
    writeFileMock.mockResolvedValueOnce(undefined);
    await getMacros();

    let attached = false;
    const close = vi.fn();
    watchMock.mockImplementationOnce(() => {
      attached = true;
      return { close } as unknown as ReturnType<typeof fsWatch>;
    });
    const stop = watchMacros(() => undefined);
    expect(attached).toBe(true);
    stop();
    expect(close).toHaveBeenCalled();
  });
});
