import { ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import { extname } from 'node:path';
import { parseBibTeX } from '@shared/bibtex';
import { parseRis } from '@shared/ris';
import type { BibEntry } from '@shared/bibtex';
import { findBibliographyFor } from '../bibliography';
import {
  appendEntry as appendBibEntry,
  computeBibPath,
  ensureBibFile,
  removeEntry as removeBibEntry,
  renameEntryKey as renameBibEntryKey,
  upsertEntry as upsertBibEntry,
} from '../bibliographyWrite';
import { autoSaveAbstract } from '../referenceDownload';
import { assertAllowedPath } from '../pathGuard';

/**
 * Quick content sniff when the file extension is unknown. RIS files start
 * with a `TY  - ` header within the first few non-empty lines; BibTeX
 * always begins with an `@` somewhere near the top.
 */
function sniffFormat(raw: string): 'bibtex' | 'ris' {
  const head = raw.slice(0, 2048);
  if (/^\s*TY\s*-\s/m.test(head)) return 'ris';
  return 'bibtex';
}

export function registerBibliographyHandlers(): void {
  ipcMain.handle(
    'bibliography:find',
    async (_e, filePath: string | null, roots: string[]) => {
      if (filePath) await assertAllowedPath(filePath);
      for (const r of roots) await assertAllowedPath(r);
      return findBibliographyFor(filePath, roots);
    },
  );

  ipcMain.handle(
    'bibliography:ensureFile',
    async (_e, docPath: string | null) => {
      if (docPath) await assertAllowedPath(docPath);
      const r = await ensureBibFile(docPath);
      if ('error' in r) return { ok: false as const, error: r.error };
      return { ok: true as const, path: r.path, created: r.created };
    },
  );

  ipcMain.handle(
    'bibliography:computePath',
    async (_e, docPath: string | null) => {
      if (docPath) await assertAllowedPath(docPath);
      const r = await computeBibPath(docPath);
      if ('error' in r) return { ok: false as const, error: r.error };
      return { ok: true as const, path: r.path, exists: r.exists };
    },
  );

  ipcMain.handle(
    'bibliography:appendEntry',
    async (_e, filePath: string, entry: BibEntry, opts?: { force?: boolean }) => {
      await assertAllowedPath(filePath);
      const r = await appendBibEntry(filePath, entry, { force: opts?.force });
      if (r.ok) return { ok: true as const, key: r.key, path: r.path };
      // v0.1.10: surface the dedup variants alongside their existingKey so
      // the renderer can highlight / focus the duplicate row. v0.2.17:
      // narrow on the `kind` discriminator (introduced for typecheck full
      // coverage) so the duplicate arms keep their extra fields visible.
      if (r.kind === 'duplicate-doi') {
        return {
          ok: false as const,
          kind: 'duplicate-doi' as const,
          error: 'duplicate-doi' as const,
          existingKey: r.existingKey,
        };
      }
      if (r.kind === 'duplicate-weak') {
        return {
          ok: false as const,
          kind: 'duplicate-weak' as const,
          error: 'duplicate-weak' as const,
          existingKey: r.existingKey,
          normalizedTitle: r.normalizedTitle,
        };
      }
      return { ok: false as const, error: r.error };
    },
  );

  ipcMain.handle(
    'bibliography:readEntries',
    async (_e, filePath: string) => {
      await assertAllowedPath(filePath);
      try {
        const source = await fs.readFile(filePath, 'utf8');
        const parsed = parseBibTeX(source);
        return { ok: true as const, entries: parsed.entries, warnings: parsed.warnings };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return { ok: true as const, entries: [], warnings: [] };
        }
        return { ok: false as const, error: (err as Error).message };
      }
    },
  );

  ipcMain.handle(
    'bibliography:upsertEntry',
    async (_e, filePath: string, entry: BibEntry) => {
      await assertAllowedPath(filePath);
      const r = await upsertBibEntry(filePath, entry);
      if (!r.ok) return { ok: false as const, error: r.error };
      return { ok: true as const, key: r.key, path: r.path };
    },
  );

  ipcMain.handle(
    'bibliography:removeEntry',
    async (_e, filePath: string, key: string) => {
      await assertAllowedPath(filePath);
      const r = await removeBibEntry(filePath, key);
      if (!r.ok) return { ok: false as const, error: r.error };
      return { ok: true as const, path: r.path };
    },
  );

  ipcMain.handle(
    'bibliography:renameKey',
    async (_e, filePath: string, oldKey: string, newKey: string) => {
      await assertAllowedPath(filePath);
      const r = await renameBibEntryKey(filePath, oldKey, newKey);
      if (!r.ok) return { ok: false as const, error: r.error };
      return { ok: true as const, path: r.path };
    },
  );

  ipcMain.handle('bibliography:importFile', async (_e, sourcePath: string) => {
    await assertAllowedPath(sourcePath);
    let raw: string;
    try {
      raw = await fs.readFile(sourcePath, 'utf8');
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
    const ext = extname(sourcePath).toLowerCase();
    let format: 'bibtex' | 'ris';
    if (ext === '.ris') format = 'ris';
    else if (ext === '.bib' || ext === '.bibtex') format = 'bibtex';
    else format = sniffFormat(raw);
    if (format === 'ris') {
      const r = parseRis(raw);
      return { ok: true as const, entries: r.entries, warnings: r.warnings, format };
    }
    const r = parseBibTeX(raw);
    return { ok: true as const, entries: r.entries, warnings: r.warnings, format };
  });

  ipcMain.handle(
    'bibliography:autoSaveAbstract',
    async (_e, bibFilePath: string, entry: BibEntry) => {
      await assertAllowedPath(bibFilePath);
      const r = await autoSaveAbstract(bibFilePath, entry);
      if (!r.ok) return { ok: false as const, error: r.error };
      return {
        ok: true as const,
        skipped: r.skipped,
        path: r.path,
        relPath: r.relPath,
      };
    },
  );
}
