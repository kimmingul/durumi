import { BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron';
import { promises as fs } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import type { DiscardChoice, FileResult, Preferences } from '@shared/ipc-contract';
import { addRecentFile, getPreferences, setPreferences } from './preferences';
import { listDirectory, watchRoot, unwatchRoot, unwatchAllRoots, openFolderDialog } from './fs';
import { exportToPdf } from './pdf';
import { getCustomCss } from './customCss';
import { saveImage } from './images';
import { getMacros } from './macros';
import { getRepoStatus } from './git';
import { resolveLang, t } from './i18n';
import {
  clearPandocCache,
  detectHomebrew,
  detectPandoc,
  importViaPandoc,
  installPandocViaHomebrew,
  runPandoc,
} from './pandoc';
import { searchInWorkspace, SearchOptions } from './search';
import { indexWorkspace } from './fileIndex';
import { findBibliographyFor } from './bibliography';
import {
  createFile,
  createFolder,
  duplicate as duplicateFile,
  moveToTrash,
  rename as renameFile,
  revealInFolder,
} from './fileOps';

/**
 * Allowlist for `shell:openExternal`. Renderer code is untrusted by default;
 * we only let it open the small set of URLs the install dialog needs. URLs
 * must parse, must be `https:`, and the hostname must be in the allowlist.
 */
const SHELL_OPEN_HOST_ALLOWLIST: ReadonlyArray<string> = [
  'pandoc.org',
  'www.pandoc.org',
  'github.com',
];

export function isExternalUrlAllowed(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return SHELL_OPEN_HOST_ALLOWLIST.includes(parsed.hostname);
}

/**
 * Pick the longest workspace root that is a prefix of `savedPath`.
 * Treats both `<root>` and `<root>/` as a match (so paths equal to the root
 * itself also match). Returns `null` if no root contains the path.
 */
export function findOwningRoot(savedPath: string, roots: readonly string[]): string | null {
  let best: string | null = null;
  for (const root of roots) {
    if (savedPath === root || savedPath.startsWith(root + '/') || savedPath.startsWith(root + '\\')) {
      if (!best || root.length > best.length) best = root;
    }
  }
  return best;
}

function broadcastGitStatusInvalidated(root: string): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('git:status:invalidated', root);
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle('ping', async () => 'pong' as const);

  ipcMain.handle('file:open', async (event): Promise<FileResult | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const path = result.filePaths[0]!;
    const content = await fs.readFile(path, 'utf8');
    await addRecentFile(path);
    return { path, content };
  });

  ipcMain.handle('file:openPath', async (_e, path: string): Promise<FileResult> => {
    const content = await fs.readFile(path, 'utf8');
    await addRecentFile(path);
    return { path, content };
  });

  ipcMain.handle('file:save', async (_e, path: string, content: string) => {
    await fs.writeFile(path, content, 'utf8');
    await addRecentFile(path);
    const prefs = await getPreferences();
    const owningRoot = findOwningRoot(path, prefs.workspaceFolders ?? []);
    if (owningRoot) broadcastGitStatusInvalidated(owningRoot);
    return { ok: true as const };
  });

  ipcMain.handle('file:saveAs', async (event, content: string, suggestedName?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const result = await dialog.showSaveDialog(win, {
      defaultPath: suggestedName ?? 'untitled.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, content, 'utf8');
    await addRecentFile(result.filePath);
    const prefs = await getPreferences();
    const owningRoot = findOwningRoot(result.filePath, prefs.workspaceFolders ?? []);
    if (owningRoot) broadcastGitStatusInvalidated(owningRoot);
    return { path: result.filePath };
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
    if (format === 'pdf') {
      await exportToPdf(html, result.filePath);
    } else {
      await writeFile(result.filePath, html, 'utf8');
    }
    return { path: result.filePath };
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

  ipcMain.handle('prefs:get', async (): Promise<Preferences> => getPreferences());
  ipcMain.handle('prefs:set', async (_e, patch: Partial<Preferences>) => setPreferences(patch));

  ipcMain.handle('window:setTitle', async (event, title: string) => {
    BrowserWindow.fromWebContents(event.sender)?.setTitle(title);
  });

  ipcMain.handle(
    'image:save',
    async (
      _e,
      buffer: Uint8Array,
      mimeType: string,
      contextFilePath: string | null,
    ) => saveImage(buffer, mimeType, contextFilePath),
  );

  ipcMain.handle('dialog:openFolder', async () => openFolderDialog());
  ipcMain.handle('fs:listDirectory', async (_e, p: string) => listDirectory(p));
  ipcMain.handle('fs:watchRoot', async (_e, p: string) => {
    await watchRoot(p, (changed) => {
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('fs:change', changed));
    });
  });
  ipcMain.handle('fs:unwatchRoot', async (_e, p: string) => unwatchRoot(p));
  ipcMain.handle('fs:unwatchAllRoots', async () => unwatchAllRoots());

  ipcMain.handle('customCss:get', async () => getCustomCss());
  ipcMain.handle('macros:get', async () => getMacros());

  ipcMain.handle('git:getStatus', async (_e, rootPath: string) => getRepoStatus(rootPath));

  ipcMain.handle(
    'search:workspace',
    async (_e, rootPath: string, opts: SearchOptions) => searchInWorkspace(rootPath, opts),
  );

  ipcMain.handle('files:index', async (_e, roots: string[]) => indexWorkspace(roots));

  ipcMain.handle(
    'bibliography:find',
    async (_e, filePath: string | null, roots: string[]) =>
      findBibliographyFor(filePath, roots),
  );

  ipcMain.handle('files:create', async (_e, path: string) => createFile(path));
  ipcMain.handle('files:createFolder', async (_e, path: string) => createFolder(path));
  ipcMain.handle('files:rename', async (_e, oldPath: string, newPath: string) =>
    renameFile(oldPath, newPath),
  );
  ipcMain.handle('files:duplicate', async (_e, path: string) => duplicateFile(path));
  ipcMain.handle('files:trash', async (_e, path: string) => moveToTrash(path));
  ipcMain.handle('files:reveal', async (_e, path: string) => revealInFolder(path));

  ipcMain.handle('pandoc:detect', async () => {
    const prefs = await getPreferences();
    return detectPandoc(prefs.pandocPath);
  });

  ipcMain.handle('pandoc:detectHomebrew', async () => {
    const path = await detectHomebrew();
    return { available: path !== null, path };
  });

  ipcMain.handle('pandoc:installViaHomebrew', async (event) => {
    const sender = event.sender;
    const result = await installPandocViaHomebrew((chunk) => {
      if (!sender.isDestroyed()) {
        sender.send('pandoc:install:progress', chunk);
      }
    });
    if (result.ok) clearPandocCache();
    return result;
  });

  ipcMain.handle('pandoc:setCustomPath', async (_e, customPath: string) => {
    await setPreferences({ pandocPath: customPath });
    clearPandocCache();
    return detectPandoc(customPath);
  });

  ipcMain.handle('pandoc:pickCustomPath', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      title: 'Select pandoc binary',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0]!;
  });

  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (!isExternalUrlAllowed(url)) {
      return { ok: false as const, error: 'URL not allowed' };
    }
    await shell.openExternal(url);
    return { ok: true as const };
  });

  ipcMain.handle('pandoc:import', async (event, format: 'docx' | 'odt' | 'rtf') => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return null;
    const filterName = format === 'docx' ? 'Word' : format === 'odt' ? 'OpenDocument' : 'RTF';
    const dialogResult = await dialog.showOpenDialog(win, {
      filters: [{ name: filterName, extensions: [format] }],
      properties: ['openFile'],
    });
    if (dialogResult.canceled || dialogResult.filePaths.length === 0) return null;
    const inputPath = dialogResult.filePaths[0]!;
    const prefs = await getPreferences();
    const r = await importViaPandoc({
      inputPath,
      fromFormat: format,
      override: prefs.pandocPath,
    });
    if (!r.ok) {
      return { error: r.error ?? 'import failed', stderr: r.stderr };
    }
    return { markdown: r.markdown ?? '', sourcePath: inputPath };
  });

  ipcMain.handle(
    'pandoc:export',
    async (
      event,
      markdown: string,
      format: 'docx' | 'latex',
      suggestedName?: string,
      sourceFilePath?: string | null,
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
      if (!win) return null;
      const ext = format === 'docx' ? 'docx' : 'tex';
      const filterName = format === 'docx' ? 'Word' : 'LaTeX';
      const dialogResult = await dialog.showSaveDialog(win, {
        defaultPath: suggestedName ?? `untitled.${ext}`,
        filters: [{ name: filterName, extensions: [ext] }],
      });
      if (dialogResult.canceled || !dialogResult.filePath) return null;
      const prefs = await getPreferences();
      const extra: string[] = [];
      if (format === 'docx' && prefs.docxStyleReference) {
        extra.push('--reference-doc', prefs.docxStyleReference);
      }
      if (format === 'latex' && prefs.latexTemplate) {
        extra.push('--template', prefs.latexTemplate);
      }
      // Wire citation processing through Pandoc when a bibliography file is
      // discoverable from the source document. Pandoc's --citeproc resolves
      // [@key] for both docx and latex outputs.
      const bib = await findBibliographyFor(
        sourceFilePath ?? null,
        prefs.workspaceFolders,
      );
      if (bib) {
        extra.push('--citeproc', '--bibliography', bib.path);
      }
      const result = await runPandoc({
        input: markdown,
        outputPath: dialogResult.filePath,
        override: prefs.pandocPath,
        extraArgs: extra,
      });
      if (!result.ok) {
        return { error: result.error ?? 'export failed', stderr: result.stderr };
      }
      return { path: dialogResult.filePath };
    },
  );

  nativeTheme.on('updated', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('theme:changed', theme));
  });
}
