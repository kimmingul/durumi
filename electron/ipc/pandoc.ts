import { BrowserWindow, dialog, ipcMain } from 'electron';
import { getPreferences, setPreferences } from '../preferences';
import {
  clearPandocCache,
  detectHomebrew,
  detectPandoc,
  importViaPandoc,
  installPandocViaHomebrew,
  runPandoc,
} from '../pandoc';
import { findBibliographyFor } from '../bibliography';
import { allowSessionPath, assertAllowedPath } from '../pathGuard';

export function registerPandocHandlers(): void {
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
    const picked = result.filePaths[0]!;
    allowSessionPath(picked);
    return picked;
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
    allowSessionPath(inputPath);
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
      if (sourceFilePath) await assertAllowedPath(sourceFilePath);
      const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
      if (!win) return null;
      const ext = format === 'docx' ? 'docx' : 'tex';
      const filterName = format === 'docx' ? 'Word' : 'LaTeX';
      const dialogResult = await dialog.showSaveDialog(win, {
        defaultPath: suggestedName ?? `untitled.${ext}`,
        filters: [{ name: filterName, extensions: [ext] }],
      });
      if (dialogResult.canceled || !dialogResult.filePath) return null;
      allowSessionPath(dialogResult.filePath);
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
}
