import { describe, it, expect, vi, beforeEach } from 'vitest';

const messageBoxCalls: Array<Record<string, unknown>> = [];

vi.mock('electron', () => {
  const app = { isPackaged: false, getVersion: () => '0.5.0' };
  const dialog = {
    showMessageBox: vi.fn(async (_w: unknown, opts: Record<string, unknown>) => {
      messageBoxCalls.push(opts);
      return { response: 1 };
    }),
  };
  const BrowserWindow = vi.fn();
  return { default: { app, dialog, BrowserWindow }, app, dialog, BrowserWindow };
});

const updater = {
  autoDownload: false,
  checkForUpdates: vi.fn(async () => null),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
  on: vi.fn(),
};

vi.mock('electron-updater', () => ({
  autoUpdater: updater,
  default: { autoUpdater: updater },
}));

describe('autoUpdater', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    messageBoxCalls.length = 0;
    const electron = await import('electron');
    (electron as unknown as { app: { isPackaged: boolean } }).app.isPackaged = false;
    const { __resetForTests } = await import('../../electron/autoUpdater');
    __resetForTests();
  });

  it('does not auto-check in dev mode', async () => {
    vi.useFakeTimers();
    const { registerAutoUpdater } = await import('../../electron/autoUpdater');
    registerAutoUpdater({} as never);
    vi.advanceTimersByTime(60_000);
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('manual check in dev shows informational dialog', async () => {
    const { checkForUpdatesManually } = await import('../../electron/autoUpdater');
    await checkForUpdatesManually({} as never);
    expect(messageBoxCalls.at(-1)?.message).toMatch(/packaged builds/i);
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('auto-checks 30s after register in packaged mode', async () => {
    const electron = await import('electron');
    (electron as unknown as { app: { isPackaged: boolean } }).app.isPackaged = true;
    vi.useFakeTimers();
    const { registerAutoUpdater } = await import('../../electron/autoUpdater');
    registerAutoUpdater({} as never);
    vi.advanceTimersByTime(30_000);
    await Promise.resolve(); // flush microtasks
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    (electron as unknown as { app: { isPackaged: boolean } }).app.isPackaged = false;
  });
});
