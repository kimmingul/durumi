import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { FilePickerOptions } from '@shared/ipc-contract';
import { type MemoSidecar } from '@shared/memoSidecar';
import { openFolderDialog } from '../fs';
import { saveImage } from '../images';
import { getRepoStatus } from '../git';
import { allowSessionPath, assertAllowedPath } from '../pathGuard';
import { isExternalUrlAllowed, readMemoSidecar, writeMemoSidecar } from './_shared';

export function registerShellHandlers(): void {
  ipcMain.handle('ping', async () => 'pong' as const);

  ipcMain.handle(
    'image:save',
    async (
      _e,
      buffer: Uint8Array,
      mimeType: string,
      contextFilePath: string | null,
    ) => {
      // contextFilePath is the document next to which the asset will land
      // (typically `<doc_dir>/assets/img-<ts>.<ext>`). Guard it so a
      // compromised renderer can't write asset bytes outside trusted paths.
      if (contextFilePath) await assertAllowedPath(contextFilePath);
      return saveImage(buffer, mimeType, contextFilePath);
    },
  );

  ipcMain.handle('dialog:openFolder', async () => {
    const picked = await openFolderDialog();
    if (picked) allowSessionPath(picked);
    return picked;
  });

  ipcMain.handle(
    'dialog:pickFile',
    async (event, opts?: FilePickerOptions) => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
      if (!win) return null;
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        title: opts?.title,
        filters: opts?.filters,
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const picked = result.filePaths[0]!;
      allowSessionPath(picked);
      return picked;
    },
  );

  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (!isExternalUrlAllowed(url)) {
      return { ok: false as const, error: 'URL not allowed' };
    }
    await shell.openExternal(url);
    return { ok: true as const };
  });

  ipcMain.handle('git:getStatus', async (_e, rootPath: string) => {
    await assertAllowedPath(rootPath);
    return getRepoStatus(rootPath);
  });

  ipcMain.handle(
    'memoSidecar:read',
    async (_e, docPath: string): Promise<MemoSidecar | null> => {
      await assertAllowedPath(docPath);
      return readMemoSidecar(docPath);
    },
  );

  ipcMain.handle(
    'memoSidecar:write',
    async (_e, docPath: string, sidecar: MemoSidecar): Promise<void> => {
      await assertAllowedPath(docPath);
      return writeMemoSidecar(docPath, sidecar);
    },
  );
}
