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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
      preload: join(__dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.on('close', () => {
    const [w, h] = win.getSize();
    const [x, y] = win.getPosition();
    void setPreferences({ lastWindow: { width: w, height: h, x, y } });
  });

  // Intercept close so the renderer can prompt Save/Discard/Cancel for a dirty
  // document. Without this, beforeunload merely cancels the close silently.
  attachCloseGuard(win, ipcMain);

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
  registerIpcHandlers();
  const initialPrefs = await getPreferences();
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
