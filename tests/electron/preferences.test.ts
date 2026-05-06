import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory store for the mocked filesystem.
const fileStore = new Map<string, string>();

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/durumi-test-prefs' },
}));

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

// vitest 2.x: mocks must export `default` and named exports sharing the same
// vi.fn() instances (B2 #1 defect avoidance). preferences.ts imports
// `{ promises as fs } from 'node:fs'`, so we mock both modules.
vi.mock('node:fs/promises', () => ({
  default: { readFile, writeFile },
  readFile,
  writeFile,
}));

vi.mock('node:fs', () => {
  const promises = { readFile, writeFile };
  return {
    default: { promises },
    promises,
  };
});

const PREFS_PATH = '/tmp/durumi-test-prefs/preferences.json';

beforeEach(() => {
  fileStore.clear();
  readFile.mockClear();
  writeFile.mockClear();
  vi.resetModules();
});

describe('preferences migration: lastFolder -> workspaceFolders', () => {
  it('seeds workspaceFolders from a legacy lastFolder string', async () => {
    fileStore.set(
      PREFS_PATH,
      JSON.stringify({ theme: 'system', lastFolder: '/Users/me/notes' }),
    );
    const { getPreferences } = await import('../../electron/preferences');
    const prefs = await getPreferences();
    expect(prefs.workspaceFolders).toEqual(['/Users/me/notes']);
    // Legacy field is stripped from the in-memory shape.
    expect((prefs as unknown as { lastFolder?: unknown }).lastFolder).toBeUndefined();
  });

  it('treats lastFolder=null as empty workspaceFolders', async () => {
    fileStore.set(PREFS_PATH, JSON.stringify({ theme: 'system', lastFolder: null }));
    const { getPreferences } = await import('../../electron/preferences');
    const prefs = await getPreferences();
    expect(prefs.workspaceFolders).toEqual([]);
  });

  it('prefers existing workspaceFolders and ignores lastFolder when both present', async () => {
    fileStore.set(
      PREFS_PATH,
      JSON.stringify({
        theme: 'system',
        lastFolder: '/legacy',
        workspaceFolders: ['/already/migrated'],
      }),
    );
    const { getPreferences } = await import('../../electron/preferences');
    const prefs = await getPreferences();
    expect(prefs.workspaceFolders).toEqual(['/already/migrated']);
  });

  it('returns default empty workspaceFolders on missing prefs file', async () => {
    const { getPreferences } = await import('../../electron/preferences');
    const prefs = await getPreferences();
    expect(prefs.workspaceFolders).toEqual([]);
  });

  it('migration is idempotent — re-reading after a setPreferences keeps shape stable', async () => {
    fileStore.set(
      PREFS_PATH,
      JSON.stringify({ theme: 'system', lastFolder: '/x' }),
    );
    const mod = await import('../../electron/preferences');
    const a = await mod.getPreferences();
    expect(a.workspaceFolders).toEqual(['/x']);
    await mod.setPreferences({ workspaceFolders: ['/x', '/y'] });
    const b = await mod.getPreferences();
    expect(b.workspaceFolders).toEqual(['/x', '/y']);
    expect((b as unknown as { lastFolder?: unknown }).lastFolder).toBeUndefined();
  });
});
