import { ipcMain, shell } from 'electron';
import { promises as fs } from 'node:fs';
import { extname } from 'node:path';
import type { BibEntry } from '@shared/bibtex';
import { getPreferences } from '../preferences';
import { downloadReference } from '../referenceDownload';
import { referenceStatus, resolveFileField, scanReferenceDir } from '../referenceFs';
import { extractDoiFromFile } from '../referenceImport';
import { extractPdfText } from '../pdfText';
import { assertAllowedPath } from '../pathGuard';

export function registerReferenceHandlers(): void {
  ipcMain.handle(
    'reference:download',
    async (_e, bibFilePath: string, entry: BibEntry) => {
      await assertAllowedPath(bibFilePath);
      const prefs = await getPreferences();
      const r = await downloadReference(bibFilePath, entry, {
        email: prefs.bibliography?.email ?? null,
      });
      if (r.ok) {
        return {
          ok: true as const,
          path: r.path,
          relPath: r.relPath,
          type: r.type,
          source: r.source,
          fetchedFrom: r.fetchedFrom,
        };
      }
      return { ok: false as const, code: r.code, message: r.message };
    },
  );

  ipcMain.handle('reference:open', async (_e, bibFilePath: string, relPath: string) => {
    await assertAllowedPath(bibFilePath);
    const abs = resolveFileField(bibFilePath, relPath);
    if (!abs) return { ok: false as const, error: 'empty path' };
    // Catch `relPath` traversal that escapes the bib's directory tree
    // (e.g. `../../etc/passwd`). The resolved absolute path must itself
    // be inside an allowed root.
    await assertAllowedPath(abs);
    const errMsg = await shell.openPath(abs);
    if (errMsg) return { ok: false as const, error: errMsg };
    return { ok: true as const };
  });

  ipcMain.handle(
    'reference:status',
    async (_e, bibFilePath: string, key: string, fileField?: string | null) => {
      await assertAllowedPath(bibFilePath);
      return referenceStatus(bibFilePath, key, fileField ?? null);
    },
  );

  ipcMain.handle('reference:scan', async (_e, bibFilePath: string) => {
    await assertAllowedPath(bibFilePath);
    try {
      const files = await scanReferenceDir(bibFilePath);
      return { ok: true as const, files };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  });

  ipcMain.handle('reference:extractDoi', async (_e, absPath: string) => {
    await assertAllowedPath(absPath);
    return extractDoiFromFile(absPath);
  });

  ipcMain.handle(
    'reference:extractText',
    async (
      _e,
      bibFilePath: string,
      relPath: string,
      options?: { maxPages?: number; maxChars?: number },
    ) => {
      await assertAllowedPath(bibFilePath);
      const abs = resolveFileField(bibFilePath, relPath);
      if (!abs) return { ok: false as const, error: 'empty path' };
      // Same traversal guard as `reference:open` (relPath could escape).
      await assertAllowedPath(abs);
      const ext = extname(abs).toLowerCase();
      if (ext === '.md' || ext === '.markdown') {
        try {
          const raw = await fs.readFile(abs, 'utf8');
          const max = options?.maxChars ?? 8000;
          return {
            ok: true as const,
            text: raw.slice(0, max),
            pages: 1,
          };
        } catch (err) {
          return { ok: false as const, error: (err as Error).message };
        }
      }
      if (ext !== '.pdf') {
        return { ok: false as const, error: `unsupported file type: ${ext}` };
      }
      const r = await extractPdfText(abs, {
        maxPages: options?.maxPages ?? 5,
        maxChars: options?.maxChars ?? 8000,
      });
      if (!r.ok) return { ok: false as const, error: r.error };
      return { ok: true as const, text: r.text, pages: r.pages };
    },
  );
}
