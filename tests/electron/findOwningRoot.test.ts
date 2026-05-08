import { describe, it, expect, vi } from 'vitest';

// `electron/ipc.ts` imports `electron`; stub it so Vitest can load the file
// in jsdom without an actual Electron runtime. We only need `findOwningRoot`
// (a pure function) — none of the handler-registration code runs in tests.
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
  dialog: {},
  ipcMain: { handle: vi.fn() },
  nativeTheme: { on: vi.fn(), shouldUseDarkColors: false },
  shell: { openExternal: vi.fn() },
}));

import { findOwningRoot } from '../../electron/ipc';

describe('findOwningRoot', () => {
  it('returns the only root that is a prefix of the saved path', () => {
    expect(findOwningRoot('/repo/src/a.md', ['/repo'])).toBe('/repo');
  });

  it('returns null when no root contains the path', () => {
    expect(findOwningRoot('/elsewhere/a.md', ['/repo'])).toBeNull();
  });

  it('picks the longest matching root when nested', () => {
    const roots = ['/work', '/work/inner'];
    expect(findOwningRoot('/work/inner/a.md', roots)).toBe('/work/inner');
  });

  it('matches when path equals the root itself', () => {
    expect(findOwningRoot('/repo', ['/repo'])).toBe('/repo');
  });

  it('does not match a sibling with a shared prefix string', () => {
    expect(findOwningRoot('/repo-sibling/a.md', ['/repo'])).toBeNull();
  });

  it('handles Windows-style backslash separators', () => {
    expect(findOwningRoot('C:\\repo\\src\\a.md', ['C:\\repo'])).toBe('C:\\repo');
  });

  it('returns null when roots list is empty', () => {
    expect(findOwningRoot('/repo/a.md', [])).toBeNull();
  });
});
