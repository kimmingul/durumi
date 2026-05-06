import { app, BrowserWindow, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import { getPreferences } from './preferences';
import { resolveLang, t } from './i18n';

let initialized = false;

async function currentLang(): Promise<'en' | 'ko'> {
  try {
    const prefs = await getPreferences();
    return resolveLang(prefs.language);
  } catch {
    return 'en';
  }
}

export function registerAutoUpdater(win: BrowserWindow): void {
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.on('error', (err) => {
    console.warn('[auto-updater] error', err);
  });

  autoUpdater.on('update-available', async (info) => {
    const lang = await currentLang();
    const r = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: [t('updates.btn.download', lang), t('updates.btn.later', lang)],
      defaultId: 0,
      message: t('updates.available', lang),
      detail: t('updates.availableDetail', lang, { version: info.version }),
    });
    if (r.response === 0) await autoUpdater.downloadUpdate();
  });

  autoUpdater.on('update-downloaded', async (info) => {
    const lang = await currentLang();
    const r = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: [t('updates.btn.restart', lang), t('updates.btn.later', lang)],
      defaultId: 0,
      message: t('updates.downloaded', lang),
      detail: t('updates.downloadedDetail', lang, { version: info.version }),
    });
    if (r.response === 0) autoUpdater.quitAndInstall();
  });

  if (!app.isPackaged) return; // dev mode: skip auto-check
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[auto-updater] check failed', err);
    });
  }, 30_000);
}

export async function checkForUpdatesManually(win: BrowserWindow): Promise<void> {
  const lang = await currentLang();
  if (!app.isPackaged) {
    await dialog.showMessageBox(win, {
      type: 'info',
      message: t('updates.devOnly', lang),
      detail: t('updates.devOnlyDetail', lang),
    });
    return;
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result || !result.updateInfo || result.updateInfo.version === app.getVersion()) {
      await dialog.showMessageBox(win, {
        type: 'info',
        message: t('updates.upToDate', lang),
        detail: t('updates.upToDateDetail', lang, { version: app.getVersion() }),
      });
    }
  } catch (err) {
    await dialog.showMessageBox(win, {
      type: 'error',
      message: t('updates.checkFailed', lang),
      detail: String(err),
    });
  }
}

/** Test-only: reset the module-level singleton state. */
export function __resetForTests(): void {
  initialized = false;
}
