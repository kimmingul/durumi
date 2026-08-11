import { BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { MARKDOWN_EXTENSIONS, fileKindOf } from '@shared/fileKind';
import type { FileResult } from '@shared/ipc-contract';
import { addRecentFile, getPreferences } from '../preferences';
import { pickDefaultDir } from '../dialogDefaults';
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
import { decodeFailedError, decodeUtf8StrictKeepingBom } from '../openDecode';
import { broadcastGitStatusInvalidated, findOwningRoot } from './_shared';

// @MX:NOTE: [AUTO] 열기 읽기가 파일 종류로 갈리는 유일한 지점이다 (REQ-PANEL-046).
// 분기가 왜 있는지는 아래 주석이 전부 적는다 — 지우면 마크다운의 U+FFFD 결함이
// "고쳐야 할 버그"로 보이고, 그것은 사용자가 내린 범위 결정과 반대다.
/**
 * 열기 경로의 읽기. **파일 종류에 따라 디코드 자세가 다르다.**
 *
 * ## 왜 종류별로 갈리는가 (사용자 결정, `progress.md` §F M5)
 *
 * 구현 착수 승인에서 사용자가 범위를 이렇게 확정했다: *엄격 디코드는 보조 파일
 * 열기 경로에만 적용하고 마크다운 경로는 오늘 동작을 유지한다* (C-10 준수).
 * 마크다운을 함께 엄격하게 만들면 오늘 열리던 손상 원고가 갑자기 열리지 않게
 * 되고, 그것은 이 SPEC이 약속하지 않은 동작 변경이다.
 *
 * ## 그래서 남는 결함 — 닫지 않는다
 *
 * @MX:DEBT: 손상된 마크다운은 여전히 U+FFFD로 치환되어 열리고, 그 버퍼를
 * 저장하면 원본이 파괴된다. 이 SPEC은 그 결함을 **닫지 않는다**.
 * @MX:CEILING: 보조 파일(`fileKindOf === 'auxiliary'`)에 한해 방어된다.
 * 마크다운 확장자(`md`/`markdown`/`txt`)는 오늘의 lossy 경로 그대로다.
 * @MX:UPGRADE: 마크다운 열기의 엄격화를 범위에 넣는 별도 SPEC이 서면 이 분기를
 * 없애고 두 경로를 `decodeUtf8StrictKeepingBom` 하나로 합친다.
 *
 * 이 비대칭을 `tests/electron/filesStrictDecode.test.ts`의 C-10 describe가
 * 테스트로 박아 둔다 — 나중에 "일관성"을 이유로 조용히 넓히지 못하게.
 */
async function readTextForOpen(path: string): Promise<string> {
  if (fileKindOf(path) === 'markdown') {
    // 오늘 동작 그대로. `readFile(.., 'utf8')`은 잘못된 바이트를 U+FFFD로 때운다.
    return fs.readFile(path, 'utf8');
  }
  const decoded = decodeUtf8StrictKeepingBom(await fs.readFile(path));
  // 읽기만 했으므로 파일 바이트는 그대로다 — 거부 경로에 쓰기가 없다.
  if (decoded === null) throw decodeFailedError(path);
  return decoded;
}

export function registerFilesHandlers(): void {
  ipcMain.handle('file:open', async (event): Promise<FileResult | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const defaultDir = await pickDefaultDir(null);
    const result = await dialog.showOpenDialog(win, {
      // 확장자 집합의 출처는 `shared/fileKind.ts` 하나다 (REQ-PANEL-040).
      // 여기 리터럴을 다시 박으면 패널의 종류 판정과 갈라지고, 그때 사용자는
      // 마크다운 필터로 연 파일이 보조 패널로 열리는 것을 본다.
      // `FileFilter.extensions`가 가변 `string[]`이라 사본을 넘긴다.
      filters: [{ name: 'Markdown', extensions: [...MARKDOWN_EXTENSIONS] }],
      properties: ['openFile'],
      ...(defaultDir ? { defaultPath: defaultDir } : {}),
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const path = result.filePaths[0]!;
    allowSessionPath(path);
    const content = await readTextForOpen(path);
    await addRecentFile(path);
    return { path, content };
  });

  ipcMain.handle('file:openPath', async (_e, path: string): Promise<FileResult> => {
    await assertAllowedPath(path);
    const content = await readTextForOpen(path);
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

  ipcMain.handle(
    'file:saveAs',
    async (
      event,
      content: string,
      suggestedName?: string,
      currentFilePath?: string | null,
    ) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    // v0.2.23 — Build an absolute `defaultPath` so the dialog opens in
    // the doc's folder / the workspace / the most-recent location
    // instead of being pulled to `~/Downloads` by macOS's relative-
    // path fallback.
    const filename = suggestedName ?? 'untitled.md';
    const defaultDir = await pickDefaultDir(currentFilePath ?? null);
    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultDir ? join(defaultDir, filename) : filename,
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

  ipcMain.handle(
    'export:file',
    async (
      event,
      html: string,
      format: 'html' | 'pdf',
      suggestedName?: string,
      sourceFilePath?: string | null,
    ) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return null;
    const ext = format === 'pdf' ? 'pdf' : 'html';
    const filename = suggestedName ?? `untitled.${ext}`;
    const defaultDir = await pickDefaultDir(sourceFilePath ?? null);
    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultDir ? join(defaultDir, filename) : filename,
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
