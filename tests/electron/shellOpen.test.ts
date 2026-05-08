import { describe, it, expect, vi } from 'vitest';

// `electron/ipc.ts` imports `electron`; stub it so Vitest can load the file
// in jsdom without an actual Electron runtime. We only call the pure
// `isExternalUrlAllowed` helper — none of the IPC registration runs.
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
  dialog: {},
  ipcMain: { handle: vi.fn() },
  nativeTheme: { on: vi.fn(), shouldUseDarkColors: false },
  shell: { openExternal: vi.fn() },
}));

import { isExternalUrlAllowed } from '../../electron/ipc';

describe('isExternalUrlAllowed', () => {
  it('allows the canonical pandoc download page', () => {
    expect(isExternalUrlAllowed('https://pandoc.org/installing.html')).toBe(true);
  });

  it('allows the www.pandoc.org variant', () => {
    expect(isExternalUrlAllowed('https://www.pandoc.org/installing.html')).toBe(true);
  });

  it('allows github.com release pages (used by Pandoc binary downloads)', () => {
    expect(
      isExternalUrlAllowed('https://github.com/jgm/pandoc/releases'),
    ).toBe(true);
  });

  it('rejects http URLs even on allowed hosts', () => {
    expect(isExternalUrlAllowed('http://pandoc.org/installing.html')).toBe(false);
  });

  it('rejects file: URLs', () => {
    expect(isExternalUrlAllowed('file:///etc/passwd')).toBe(false);
  });

  it('rejects javascript: URLs', () => {
    expect(isExternalUrlAllowed('javascript:alert(1)')).toBe(false);
  });

  it('rejects unknown hosts', () => {
    expect(isExternalUrlAllowed('https://evil.example.com/foo')).toBe(false);
  });

  it('rejects look-alike subdomains of allowed hosts', () => {
    expect(isExternalUrlAllowed('https://pandoc.org.evil.com/foo')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isExternalUrlAllowed('not a url')).toBe(false);
    expect(isExternalUrlAllowed('')).toBe(false);
  });
});
