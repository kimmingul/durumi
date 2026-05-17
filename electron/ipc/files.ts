import { BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import type { FileResult } from '@shared/ipc-contract';
import { addRecentFile, getPreferences } from '../preferences';
import {
  listDirectory,
  unwatchAllRoots,
  unwatchRoot,
  watchRoot,
  writeFileAtomic,
} from '../fs';
import { exportToPdf } from '../pdf';
import { indexWorkspace } from '../fileIndex';
import {
  createFile,
  createFolder,
  duplicate as duplicateFile,
  moveToTrash,
  rename as renameFile,
  revealInFolder,
} from '../fileOps';
import { allowSessionPath, assertAllowedPath } from '../pathGuard';
import { migratePendingInContent } from '../pendingAssets';
import { broadcastGitStatusInvalidated, findOwningRoot } from './_shared';

export function registerFilesHandlers(): void {
  ipcMain.handle('file:open', async (event): Promise<FileResult | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const path = result.filePaths[0]!;
    allowSessionPath(path);
    const content = await fs.readFile(path, 'utf8');
    await addRecentFile(path);
    return { path, content };
  });

  ipcMain.handle('file:openPath', async (_e, path: string): Promise<FileResult> => {
    await assertAllowedPath(path);
    const content = await fs.readFile(path, 'utf8');
    // Trust the opened file's directory tree for the rest of the session
    // so sibling assets (e.g. `<doc_dir>/assets/img-*.png`) reach the
    // renderer through the durumi-asset:// protocol. Calling
    // allowSessionPath on an already-trusted path is idempotent.
    allowSessionPath(path);
    await addRecentFile(path);
    return { path, content };
  });

  ipcMain.handle('file:save', async (_e, path: string, content: string) => {
    await assertAllowedPath(path);
    // v0.2.23: migrate any pending-assets image refs into `<docDir>/assets/`
    // and rewrite the markdown to point at the relative form BEFORE the
    // write. Returning the migrated content lets the renderer reconcile
    // its in-memory buffer with what's now on disk.
    const migration = await migratePendingInContent(content, dirname(path));
    const finalContent = migration.content;
    await writeFileAtomic(path, finalContent);
    // Same dir-trust idempotency as file:openPath.
    allowSessionPath(path);
    await addRecentFile(path);
    const prefs = await getPreferences();
    const owningRoot = findOwningRoot(path, prefs.workspaceFolders ?? []);
    if (owningRoot) broadcastGitStatusInvalidated(owningRoot);
    return migration.changed
      ? { ok: true as const, content: finalContent }
      : { ok: true as const };
  });

  ipcMain.handle('file:saveAs', async (event, content: string, suggestedName?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const result = await dialog.showSaveDialog(win, {
      defaultPath: suggestedName ?? 'untitled.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return null;
    allowSessionPath(result.filePath);
    // v0.2.23: same migration step as file:save. Critical for the
    // "untitled → first save" path because that's exactly when pending
    // images need a real home.
    const migration = await migratePendingInContent(content, dirname(result.filePath));
    const finalContent = migration.content;
    await writeFileAtomic(result.filePath, finalContent);
    await addRecentFile(result.filePath);
    const prefs = await getPreferences();
    const owningRoot = findOwningRoot(result.filePath, prefs.workspaceFolders ?? []);
    if (owningRoot) broadcastGitStatusInvalidated(owningRoot);
    return migration.changed
      ? { path: result.filePath, content: finalContent }
      : { path: result.filePath };
  });

  ipcMain.handle('export:file', async (event, html: string, format: 'html' | 'pdf', suggestedName?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return null;
    const ext = format === 'pdf' ? 'pdf' : 'html';
    const result = await dialog.showSaveDialog(win, {
      defaultPath: suggestedName ?? `untitled.${ext}`,
      filters: [
        format === 'pdf'
          ? { name: 'PDF', extensions: ['pdf'] }
          : { name: 'HTML', extensions: ['html', 'htm'] },
      ],
    });
    if (result.canceled || !result.filePath) return null;
    allowSessionPath(result.filePath);
    if (format === 'pdf') {
      await exportToPdf(html, result.filePath);
    } else {
      await writeFileAtomic(result.filePath, html);
    }
    return { path: result.filePath };
  });

  ipcMain.handle('fs:listDirectory', async (_e, p: string) => {
    await assertAllowedPath(p);
    return listDirectory(p);
  });
  ipcMain.handle('fs:watchRoot', async (_e, p: string) => {
    await assertAllowedPath(p);
    await watchRoot(p, (changed) => {
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('fs:change', changed));
    });
  });
  ipcMain.handle('fs:unwatchRoot', async (_e, p: string) => unwatchRoot(p));
  ipcMain.handle('fs:unwatchAllRoots', async () => unwatchAllRoots());

  ipcMain.handle('files:create', async (_e, path: string) => {
    await assertAllowedPath(path);
    return createFile(path);
  });
  ipcMain.handle('files:createFolder', async (_e, path: string) => {
    await assertAllowedPath(path);
    return createFolder(path);
  });
  ipcMain.handle('files:rename', async (_e, oldPath: string, newPath: string) => {
    await assertAllowedPath(oldPath);
    await assertAllowedPath(newPath);
    return renameFile(oldPath, newPath);
  });
  ipcMain.handle('files:duplicate', async (_e, path: string) => {
    await assertAllowedPath(path);
    return duplicateFile(path);
  });
  ipcMain.handle('files:trash', async (_e, path: string) => {
    await assertAllowedPath(path);
    return moveToTrash(path);
  });
  ipcMain.handle('files:reveal', async (_e, path: string) => {
    await assertAllowedPath(path);
    return revealInFolder(path);
  });

  ipcMain.handle('files:index', async (_e, roots: string[]) => {
    for (const r of roots) await assertAllowedPath(r);
    return indexWorkspace(roots);
  });
}
