import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { DiscardChoice, Preferences } from '@shared/ipc-contract';
import { getPreferences, setPreferences } from '../preferences';
import { getCustomCss } from '../customCss';
import { getMacros } from '../macros';
import { resolveLang, t } from '../i18n';
import { assertPrefsPatchAllowed } from '../pathGuard';

export function registerPreferencesHandlers(): void {
  ipcMain.handle('prefs:get', async (): Promise<Preferences> => getPreferences());
  ipcMain.handle('prefs:set', async (_e, patch: Partial<Preferences>) => {
    // Prevent a compromised renderer from smuggling untrusted paths into the
    // path-guard allowlist by injecting them into preferences. Existing
    // entries (loaded from prior sessions) pass through; new entries must
    // have come through a dialog this session.
    await assertPrefsPatchAllowed({
      workspaceFolders: patch.workspaceFolders,
      recentFiles: patch.recentFiles,
      recentFolders: patch.recentFolders,
    });
    return setPreferences(patch);
  });

  ipcMain.handle('dialog:confirmDiscard', async (event, filename: string): Promise<DiscardChoice> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return 'cancel';
    const prefs = await getPreferences();
    const lang = resolveLang(prefs.language);
    const r = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: [t('discard.save', lang), t('discard.discard', lang), t('discard.cancel', lang)],
      defaultId: 0,
      cancelId: 2,
      message: t('discard.message', lang, { name: filename }),
      detail: t('discard.detail', lang),
    });
    return (['save', 'discard', 'cancel'] as const)[r.response] ?? 'cancel';
  });

  ipcMain.handle('window:setTitle', async (event, title: string) => {
    BrowserWindow.fromWebContents(event.sender)?.setTitle(title);
  });

  ipcMain.handle('customCss:get', async () => getCustomCss());
  ipcMain.handle('macros:get', async () => getMacros());
}
