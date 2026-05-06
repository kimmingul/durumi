import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs/promises BEFORE importing the module under test.
vi.mock('node:fs/promises', () => {
  const readdir = vi.fn();
  const stat = vi.fn();
  return {
    default: { readdir, stat },
    readdir,
    stat,
  };
});

// Track each fs.watch call so we can count distinct watchers and assert close().
const watchCalls: Array<{ path: string; close: ReturnType<typeof vi.fn> }> = [];
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    watch: vi.fn((p: string) => {
      const close = vi.fn();
      watchCalls.push({ path: p, close });
      return { close } as unknown as import('node:fs').FSWatcher;
    }),
  };
});

import { readdir, stat } from 'node:fs/promises';
import { listDirectory, watchRoot, unwatchRoot, unwatchAllRoots } from '../../electron/fs';

const readdirMock = readdir as unknown as ReturnType<typeof vi.fn>;
const statMock = stat as unknown as ReturnType<typeof vi.fn>;

beforeEach(async () => {
  readdirMock.mockReset();
  statMock.mockReset();
  watchCalls.length = 0;
  await unwatchAllRoots();
});

function dirent(name: string, isDir: boolean) {
  return { name, isDirectory: () => isDir, isFile: () => !isDir };
}

describe('listDirectory', () => {
  it('returns directories first, then .md files, alphabetically', async () => {
    readdirMock.mockResolvedValueOnce([
      dirent('zeta.md', false),
      dirent('alpha', true),
      dirent('beta.md', false),
      dirent('gamma', true),
    ]);
    statMock.mockResolvedValue({ mtimeMs: 1000 });
    const out = await listDirectory('/root');
    expect(out.map((e) => e.name)).toEqual(['alpha', 'gamma', 'beta.md', 'zeta.md']);
    expect(out.map((e) => e.isDir)).toEqual([true, true, false, false]);
  });

  it('filters out non-md files', async () => {
    readdirMock.mockResolvedValueOnce([
      dirent('a.txt', false),
      dirent('b.md', false),
      dirent('c.markdown', false),
      dirent('d.png', false),
    ]);
    statMock.mockResolvedValue({ mtimeMs: 1000 });
    const out = await listDirectory('/root');
    expect(out.map((e) => e.name)).toEqual(['b.md', 'c.markdown']);
  });

  it('filters out dot-hidden entries', async () => {
    readdirMock.mockResolvedValueOnce([
      dirent('.git', true),
      dirent('.DS_Store', false),
      dirent('visible.md', false),
      dirent('.hidden.md', false),
    ]);
    statMock.mockResolvedValue({ mtimeMs: 1000 });
    const out = await listDirectory('/root');
    expect(out.map((e) => e.name)).toEqual(['visible.md']);
  });

  it('filters out EXCLUDE directories', async () => {
    readdirMock.mockResolvedValueOnce([
      dirent('node_modules', true),
      dirent('out', true),
      dirent('dist', true),
      dirent('src', true),
      dirent('readme.md', false),
    ]);
    statMock.mockResolvedValue({ mtimeMs: 1000 });
    const out = await listDirectory('/root');
    expect(out.map((e) => e.name)).toEqual(['src', 'readme.md']);
  });

  it('returns empty array on permission error', async () => {
    readdirMock.mockRejectedValueOnce(Object.assign(new Error('EACCES'), { code: 'EACCES' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out = await listDirectory('/forbidden');
    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('uses absolute paths', async () => {
    readdirMock.mockResolvedValueOnce([dirent('a.md', false)]);
    statMock.mockResolvedValue({ mtimeMs: 42 });
    const out = await listDirectory('/Users/me/notes');
    expect(out[0].path).toBe('/Users/me/notes/a.md');
  });
});

// On Linux, watchRoot uses polling (setInterval). These tests assert the
// non-Linux fs.watch path. They are skipped on Linux.
const watchSuite = process.platform === 'linux' ? describe.skip : describe;

watchSuite('per-root watchers (fs.watch path)', () => {
  it('watchRoot creates one watcher per unique path', async () => {
    readdirMock.mockResolvedValue([]);
    statMock.mockResolvedValue({ mtimeMs: 0 });
    const onChange = vi.fn();
    await watchRoot('/root/a', onChange);
    await watchRoot('/root/b', onChange);
    expect(watchCalls.map((w) => w.path)).toEqual(['/root/a', '/root/b']);
  });

  it('watchRoot is idempotent — re-adding same path is a no-op', async () => {
    readdirMock.mockResolvedValue([]);
    statMock.mockResolvedValue({ mtimeMs: 0 });
    const onChange = vi.fn();
    await watchRoot('/root/a', onChange);
    await watchRoot('/root/a', onChange);
    expect(watchCalls.length).toBe(1);
  });

  it('unwatchRoot(path) removes only that root', async () => {
    readdirMock.mockResolvedValue([]);
    statMock.mockResolvedValue({ mtimeMs: 0 });
    const onChange = vi.fn();
    await watchRoot('/root/a', onChange);
    await watchRoot('/root/b', onChange);
    await unwatchRoot('/root/a');
    // /root/a's watcher closed; /root/b's still open.
    const aCall = watchCalls.find((w) => w.path === '/root/a')!;
    const bCall = watchCalls.find((w) => w.path === '/root/b')!;
    expect(aCall.close).toHaveBeenCalledTimes(1);
    expect(bCall.close).not.toHaveBeenCalled();
    // Re-add /root/a now succeeds (watchers map no longer holds it).
    await watchRoot('/root/a', onChange);
    expect(watchCalls.filter((w) => w.path === '/root/a').length).toBe(2);
  });

  it('unwatchRoot on an unknown path is a no-op (no throw)', async () => {
    await expect(unwatchRoot('/nope')).resolves.toBeUndefined();
  });

  it('unwatchAllRoots closes every active watcher', async () => {
    readdirMock.mockResolvedValue([]);
    statMock.mockResolvedValue({ mtimeMs: 0 });
    const onChange = vi.fn();
    await watchRoot('/r1', onChange);
    await watchRoot('/r2', onChange);
    await unwatchAllRoots();
    for (const w of watchCalls) {
      expect(w.close).toHaveBeenCalledTimes(1);
    }
  });
});
