import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Preferences } from '@shared/ipc-contract';

/**
 * pickDefaultDir reads from `getPreferences`. We mock that module so each
 * test can stage a specific prefs shape and assert which arm of the
 * priority chain fires.
 */
const fakePrefs: { current: Partial<Preferences> } = { current: {} };

vi.mock('../../electron/preferences', () => ({
  getPreferences: vi.fn(async () => fakePrefs.current),
}));

beforeEach(() => {
  fakePrefs.current = {};
});

afterEach(() => {
  vi.resetModules();
});

describe('pickDefaultDir', () => {
  it('returns dirname(currentFilePath) when one is provided', async () => {
    const { pickDefaultDir } = await import('../../electron/dialogDefaults');
    fakePrefs.current = { workspaceFolders: ['/should-be-skipped'] };
    expect(await pickDefaultDir('/Users/min/notes/manuscript.md')).toBe(
      '/Users/min/notes',
    );
  });

  it('falls back to the first workspace folder when no currentFilePath', async () => {
    const { pickDefaultDir } = await import('../../electron/dialogDefaults');
    fakePrefs.current = {
      workspaceFolders: ['/Users/min/papers', '/Users/min/other'],
    };
    expect(await pickDefaultDir(null)).toBe('/Users/min/papers');
  });

  it('falls back to the most-recent folder when no workspace', async () => {
    const { pickDefaultDir } = await import('../../electron/dialogDefaults');
    fakePrefs.current = {
      workspaceFolders: [],
      recentFolders: ['/Users/min/last-used', '/Users/min/before-that'],
    };
    expect(await pickDefaultDir(null)).toBe('/Users/min/last-used');
  });

  it('falls back to dirname of the most-recent file when no folder signal exists', async () => {
    const { pickDefaultDir } = await import('../../electron/dialogDefaults');
    fakePrefs.current = {
      workspaceFolders: [],
      recentFolders: [],
      recentFiles: ['/Users/min/single-file/doc.md'],
    };
    expect(await pickDefaultDir(null)).toBe('/Users/min/single-file');
  });

  it('returns null when prefs are empty (OS default takes over)', async () => {
    const { pickDefaultDir } = await import('../../electron/dialogDefaults');
    fakePrefs.current = {};
    expect(await pickDefaultDir(null)).toBeNull();
  });

  it('treats undefined `currentFilePath` the same as null (skips the doc arm)', async () => {
    const { pickDefaultDir } = await import('../../electron/dialogDefaults');
    fakePrefs.current = { workspaceFolders: ['/Users/min/papers'] };
    expect(await pickDefaultDir(undefined)).toBe('/Users/min/papers');
  });

  it('currentFilePath is the strongest signal even when a workspace is open', async () => {
    // Regression guard: a user who has a workspace open AND a doc whose
    // file lives outside the workspace expects Save As to default to the
    // doc's actual folder — not to silently relocate the export to the
    // workspace root.
    const { pickDefaultDir } = await import('../../electron/dialogDefaults');
    fakePrefs.current = { workspaceFolders: ['/Users/min/workspace'] };
    expect(await pickDefaultDir('/Users/min/elsewhere/doc.md')).toBe(
      '/Users/min/elsewhere',
    );
  });
});
