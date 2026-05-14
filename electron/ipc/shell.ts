import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { promises as fs } from 'node:fs';
import { extname } from 'node:path';
import type { FilePickerOptions } from '@shared/ipc-contract';
import { type MemoSidecar } from '@shared/memoSidecar';
import { openFolderDialog } from '../fs';
import { saveImage } from '../images';
import { getRepoStatus } from '../git';
import { allowSessionPath, assertAllowedPath } from '../pathGuard';
import { isExternalUrlAllowed, readMemoSidecar, writeMemoSidecar } from './_shared';

/**
 * Extension → MIME for the `image:pickAndSave` flow. Mirrors the table
 * in `electron/images.ts::MIME_EXT` but keyed the other way around so
 * we can hand `saveImage` a MIME without re-sniffing the bytes. Anything
 * outside this map is rejected up front so a renderer-mediated dialog
 * can't trick main into writing arbitrary non-image content into the
 * doc's assets directory.
 */
const MIME_BY_IMAGE_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
};

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

  /**
   * v0.2.x — collapse the renderer's three-step image-picker flow
   * (dialog → renderer-side `fetch('file://…')` → `image:save`) into a
   * single IPC. The renderer no longer reads disk bytes; main owns the
   * full pipeline:
   *
   *   1. Open `dialog.showOpenDialog` filtered to image extensions.
   *   2. Trust the picked file's parent dir for the session
   *      (`allowSessionPath` — same as every other dialog handler).
   *   3. Read the bytes with full FS access.
   *   4. Hand them to `saveImage` so the asset lands at
   *      `<doc_dir>/assets/img-<ts>.<ext>` with identical normalisation
   *      to the paste/drop flow.
   *
   * The `contextFilePath` guard rejects writes outside the active
   * document's directory tree exactly like `image:save` does — a
   * compromised renderer cannot redirect the asset elsewhere.
   */
  ipcMain.handle(
    'image:pickAndSave',
    async (event, contextFilePath: string | null) => {
      if (contextFilePath) {
        try {
          await assertAllowedPath(contextFilePath);
        } catch (err) {
          return { ok: false as const, error: (err as Error).message };
        }
      }
      const win =
        BrowserWindow.fromWebContents(event.sender) ??
        BrowserWindow.getAllWindows()[0];
      if (!win) return { ok: false as const, error: 'no-window' };
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [
          {
            name: 'Images',
            extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'],
          },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false as const, error: 'cancelled' };
      }
      const picked = result.filePaths[0]!;
      // Trust the picked file's dir so any sibling lookup later (e.g. the
      // user picking another image from the same folder) skips the dialog
      // guard. Same extension semantics as every other `dialog:*` handler.
      allowSessionPath(picked);
      const ext = extname(picked).toLowerCase();
      const mime = MIME_BY_IMAGE_EXT[ext];
      if (!mime) {
        return { ok: false as const, error: 'unsupported-extension' };
      }
      let bytes: Buffer;
      try {
        bytes = await fs.readFile(picked);
      } catch (err) {
        return { ok: false as const, error: (err as Error).message };
      }
      const save = await saveImage(new Uint8Array(bytes), mime, contextFilePath);
      if ('error' in save) {
        return { ok: false as const, error: save.error };
      }
      return { ok: true as const, relPath: save.relPath };
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
