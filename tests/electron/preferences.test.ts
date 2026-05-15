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

describe('rightSidebar migration (v0.1.8.4)', () => {
  it("migrates sidebar.activeTab='references' to the right sidebar", async () => {
    fileStore.set(
      PREFS_PATH,
      JSON.stringify({
        theme: 'system',
        sidebar: { visible: true, activeTab: 'references', width: 240 },
      }),
    );
    const { getPreferences } = await import('../../electron/preferences');
    const prefs = await getPreferences();
    // Left side resets to the default-safe value.
    expect(prefs.sidebar.activeTab).toBe('files');
    // Right side adopts the legacy value AND becomes visible so the
    // first launch after upgrade feels continuous.
    expect(prefs.rightSidebar.activeTab).toBe('references');
    expect(prefs.rightSidebar.visible).toBe(true);
  });

  it("migrates sidebar.activeTab='ai' to the right sidebar", async () => {
    fileStore.set(
      PREFS_PATH,
      JSON.stringify({
        theme: 'system',
        sidebar: { visible: true, activeTab: 'ai', width: 240 },
      }),
    );
    const { getPreferences } = await import('../../electron/preferences');
    const prefs = await getPreferences();
    expect(prefs.sidebar.activeTab).toBe('files');
    expect(prefs.rightSidebar.activeTab).toBe('ai');
    expect(prefs.rightSidebar.visible).toBe(true);
  });

  it("leaves rightSidebar at defaults when sidebar.activeTab is a valid left-side value ('outline')", async () => {
    fileStore.set(
      PREFS_PATH,
      JSON.stringify({
        theme: 'system',
        sidebar: { visible: true, activeTab: 'outline', width: 240 },
      }),
    );
    const { getPreferences } = await import('../../electron/preferences');
    const prefs = await getPreferences();
    // Left side keeps the user's saved value verbatim.
    expect(prefs.sidebar.activeTab).toBe('outline');
    // Right side stays at documented defaults.
    expect(prefs.rightSidebar.visible).toBe(false);
    expect(prefs.rightSidebar.activeTab).toBe('references');
    expect(prefs.rightSidebar.width).toBe(280);
  });

  it('a fresh prefs file (no sidebar at all) yields the documented rightSidebar defaults', async () => {
    const { getPreferences } = await import('../../electron/preferences');
    const prefs = await getPreferences();
    expect(prefs.rightSidebar.visible).toBe(false);
    expect(prefs.rightSidebar.activeTab).toBe('references');
    expect(prefs.rightSidebar.width).toBe(280);
  });
});

describe('recentFolders persistence (v0.2.10)', () => {
  it('defaults to an empty list', async () => {
    const { getPreferences } = await import('../../electron/preferences');
    const prefs = await getPreferences();
    expect(prefs.recentFolders).toEqual([]);
  });

  it('addRecentFolder pushes the folder onto the head of the list', async () => {
    const mod = await import('../../electron/preferences');
    await mod.addRecentFolder('/Users/me/projects/alpha');
    const prefs = await mod.getPreferences();
    expect(prefs.recentFolders[0]).toBe('/Users/me/projects/alpha');
  });

  it('addRecentFolder dedupes — re-adding an existing folder moves it to the head', async () => {
    const mod = await import('../../electron/preferences');
    await mod.addRecentFolder('/a');
    await mod.addRecentFolder('/b');
    await mod.addRecentFolder('/a');
    const prefs = await mod.getPreferences();
    expect(prefs.recentFolders).toEqual(['/a', '/b']);
  });

  it('addRecentFolder caps the list at 10 entries', async () => {
    const mod = await import('../../electron/preferences');
    for (let i = 0; i < 15; i++) {
      await mod.addRecentFolder(`/folder-${i}`);
    }
    const prefs = await mod.getPreferences();
    expect(prefs.recentFolders.length).toBe(10);
    // Head is the most-recent push (folder-14), tail the 10th-most-recent.
    expect(prefs.recentFolders[0]).toBe('/folder-14');
    expect(prefs.recentFolders[9]).toBe('/folder-5');
  });

  it('migrates a prefs file without recentFolders to the empty default', async () => {
    fileStore.set(
      PREFS_PATH,
      JSON.stringify({ theme: 'system', workspaceFolders: ['/x'] }),
    );
    const { getPreferences } = await import('../../electron/preferences');
    const prefs = await getPreferences();
    expect(prefs.recentFolders).toEqual([]);
    expect(prefs.workspaceFolders).toEqual(['/x']);
  });
});
