import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerIpcHandlers } from './ipc';
import { getPreferences, onPreferencesChanged, setPreferences } from './preferences';
import { buildMenu } from './menu';
import { registerAutoUpdater } from './autoUpdater';
import { getCustomCss, watchCustomCss } from './customCss';
import { getMacros, watchMacros } from './macros';
import { attachCloseGuard } from './closeGuard';
import { attachContextMenu } from './contextMenu';
import { registerAssetProtocolHandler, registerAssetProtocolSchemes } from './assetProtocol';
import { bootstrapSessionTreesFromRecents } from './pathGuard';
import { sweepStalePendingDirs } from './pendingAssets';

// Privileges (`standard`, `secure`, `supportFetchAPI`, `stream`) must be
// declared BEFORE app.whenReady() resolves. The actual request handler
// hooks after whenReady — see below.
registerAssetProtocolSchemes();

// Honor `--user-data-dir=<path>` early so every userData consumer
// (preferences.json, custom.css, macros.json, asset-protocol.log) lands in
// the override directory. Electron's Chromium layer already understands the
// switch, but we re-apply via `app.setPath` so the override is bullet-proof
// regardless of how Chromium evolves and so packaged Electron and `_electron.launch`
// from Playwright behave identically. Used by `e2e/_helpers.ts → launchClean`
// to give every Playwright spec a throwaway userData dir, isolating the test
// process from the developer's real preferences (root cause of the v0.2.13
// b1-features failure).
{
  const flag = process.argv.find((arg) => arg.startsWith('--user-data-dir='));
  if (flag) {
    const overridePath = flag.slice('--user-data-dir='.length);
    if (overridePath) app.setPath('userData', overridePath);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Tracks an in-flight `app.quit()` (e.g. Cmd+Q on macOS, File ▸ Quit). Cleared
// when the user cancels the close prompt so the app doesn't keep limping
// toward quit on the next user action.
let isAppQuitting = false;

async function createWindow(prefsOverride?: Awaited<ReturnType<typeof getPreferences>>) {
  const prefs = prefsOverride ?? (await getPreferences());
  const win = new BrowserWindow({
    width: prefs.lastWindow.width,
    height: prefs.lastWindow.height,
    x: prefs.lastWindow.x,
    y: prefs.lastWindow.y,
    minWidth: 480,
    minHeight: 360,
    title: 'Durumi',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Renderer cannot reach Node APIs. The preload bridge uses only
      // contextBridge + ipcRenderer (verified sandbox-clean in v0.2-hardening
      // P1-1 discovery). Local asset reads go through the durumi-asset://
      // custom protocol, not direct file:// access.
      sandbox: true,
    },
  });

  win.on('close', () => {
    const [w, h] = win.getSize();
    const [x, y] = win.getPosition();
    void setPreferences({ lastWindow: { width: w, height: h, x, y } });
  });

  // Intercept close so the renderer can prompt Save/Discard/Cancel for a dirty
  // document. Without this, beforeunload merely cancels the close silently.
  // If the user cancels (or the renderer hangs), abort an in-flight Cmd+Q too.
  attachCloseGuard(win, ipcMain, {
    onCancel: () => { isAppQuitting = false; },
  });

  void attachContextMenu(win);

  win.webContents.on('did-finish-load', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    win.webContents.send('theme:changed', theme);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

function broadcast<T>(channel: string, payload: T): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload);
  }
}

const onNewWindow = () => { void createWindow(); };

void app.whenReady().then(async () => {
  registerAssetProtocolHandler();
  registerIpcHandlers();
  const initialPrefs = await getPreferences();
  // Pre-populate the path-guard's session-trusted directory trees from
  // recent-file dirnames so reopening a recent doc finds its sibling
  // assets through durumi-asset:// even on a cold start.
  await bootstrapSessionTreesFromRecents();
  // Sweep leftover pending-asset session dirs from previous (possibly
  // crashed) runs. The current session dir is created lazily on first
  // pending write, so this can't ever clobber it.
  await sweepStalePendingDirs();
  buildMenu(initialPrefs, onNewWindow);
  onPreferencesChanged((prefs) => buildMenu(prefs, onNewWindow));

  // Race window creation with config-file init so first paint isn't blocked
  // on disk I/O. getCustomCss / getMacros create their files on first launch,
  // which fs.watch needs to exist before subscribing.
  const [, , win] = await Promise.all([
    getCustomCss(),
    getMacros(),
    createWindow(initialPrefs),
  ]);
  watchCustomCss((css) => broadcast('customCss:changed', css));
  watchMacros((macros) => broadcast('macros:changed', macros));
  registerAutoUpdater(win);

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('before-quit', () => {
  isAppQuitting = true;
});

app.on('window-all-closed', () => {
  // On macOS apps normally stay alive in the dock when all windows close, but
  // when the user explicitly chose Quit (Cmd+Q / menu) we must follow through —
  // otherwise the process becomes a zombie and a second Cmd+Q seems to hang.
  if (process.platform !== 'darwin' || isAppQuitting) app.quit();
});
