import { BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron';
import { promises as fs } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DiscardChoice, FilePickerOptions, FileResult, Preferences } from '@shared/ipc-contract';
import { type MemoSidecar, parseSidecar } from '@shared/memoSidecar';
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
import { resolveDOI, resolveORCID, searchCrossref, searchKoreaMed, searchPubMed } from './bibliographyFetch';
import { appendEntry as appendBibEntry, ensureBibFile, removeEntry as removeBibEntry, renameEntryKey as renameBibEntryKey, upsertEntry as upsertBibEntry } from './bibliographyWrite';
import { autoSaveAbstract, downloadReference } from './referenceDownload';
import { referenceStatus, resolveFileField, scanReferenceDir } from './referenceFs';
import { extractDoiFromFile } from './referenceImport';
import { extractPdfText } from './pdfText';
import { extname } from 'node:path';
import { aiChat as aiChatCall, aiVerify as aiVerifyCall, type AiMessage } from './aiClient';
import { makeKeyVault } from './aiKeys';
import { parseBibTeX } from '@shared/bibtex';
import { parseRis } from '@shared/ris';
import { extname } from 'node:path';
import type { BibEntry } from '@shared/bibtex';
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

/**
 * Materialise an `AiCallOptions` from the prefs blob. Returns null when the
 * active provider has no API key (Anthropic without a key has no fallback;
 * OpenAI-compat without a key works for keyless self-hosted endpoints, so
 * we still return options in that case).
 */
function aiOptionsFor(
  provider: 'anthropic' | 'openai-compatible',
  prefs: Preferences,
  vault: ReturnType<typeof makeKeyVault>,
): {
  provider: 'anthropic' | 'openai-compatible';
  apiKey: string;
  model: string;
  baseUrl?: string;
} | null {
  if (provider === 'anthropic') {
    const stored = prefs.ai?.anthropicKey ?? '';
    const apiKey = stored ? vault.decrypt(stored) : '';
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      model: prefs.ai?.anthropicModel || 'claude-sonnet-4-6',
    };
  }
  const stored = prefs.ai?.openaiKey ?? '';
  const apiKey = stored ? vault.decrypt(stored) : '';
  return {
    provider,
    apiKey,
    model: prefs.ai?.openaiModel || 'gpt-4o-mini',
    baseUrl: prefs.ai?.openaiBaseUrl || 'https://api.openai.com',
  };
}

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

/** Path of the sidecar JSON living next to a markdown document. */
export function memoSidecarPathFor(docPath: string): string {
  return `${docPath}.comments.json`;
}

/**
 * Read the sidecar that sits next to `docPath`. Returns null when the file
 * does not exist or is malformed — callers fall back to an empty sidecar.
 */
export async function readMemoSidecar(docPath: string): Promise<MemoSidecar | null> {
  const sidecarPath = memoSidecarPathFor(docPath);
  try {
    const raw = await fs.readFile(sidecarPath, 'utf8');
    return parseSidecar(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

/**
 * Write the sidecar atomically: tmp file in the same directory, then rename.
 * The same-directory tmp guarantees the rename is atomic on POSIX.
 */
export async function writeMemoSidecar(
  docPath: string,
  sidecar: MemoSidecar,
): Promise<void> {
  const sidecarPath = memoSidecarPathFor(docPath);
  const tmpPath = `${sidecarPath}.tmp-${process.pid}-${Date.now()}`;
  const dir = dirname(sidecarPath);
  await fs.mkdir(dir, { recursive: true });
  const json = JSON.stringify(sidecar, null, 2);
  await fs.writeFile(tmpPath, json, 'utf8');
  try {
    await fs.rename(tmpPath, sidecarPath);
  } catch (err) {
    // Best-effort cleanup on rename failure.
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
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

  ipcMain.handle(
    'memoSidecar:read',
    async (_e, docPath: string): Promise<MemoSidecar | null> => readMemoSidecar(docPath),
  );

  ipcMain.handle(
    'memoSidecar:write',
    async (_e, docPath: string, sidecar: MemoSidecar): Promise<void> =>
      writeMemoSidecar(docPath, sidecar),
  );

  ipcMain.handle('bibliography:resolveDoi', async (_e, doi: string) => {
    const prefs = await getPreferences();
    const r = await resolveDOI(doi, {
      email: prefs.bibliography?.email ?? null,
      ncbiApiKey: prefs.bibliography?.ncbiApiKey ?? null,
    });
    if (r.ok) return { ok: true as const, entry: r.data };
    return { ok: false as const, code: r.code, message: r.message };
  });

  ipcMain.handle(
    'bibliography:ensureFile',
    async (_e, docPath: string | null) => {
      const r = await ensureBibFile(docPath);
      if ('error' in r) return { ok: false as const, error: r.error };
      return { ok: true as const, path: r.path, created: r.created };
    },
  );

  ipcMain.handle(
    'bibliography:appendEntry',
    async (_e, filePath: string, entry: BibEntry, opts?: { force?: boolean }) => {
      const r = await appendBibEntry(filePath, entry, { force: opts?.force });
      if (r.ok) return { ok: true as const, key: r.key, path: r.path };
      // v0.1.10: surface the dedup variants alongside their existingKey so
      // the renderer can highlight / focus the duplicate row.
      if (r.error === 'duplicate-doi') {
        return { ok: false as const, error: 'duplicate-doi' as const, existingKey: r.existingKey };
      }
      if (r.error === 'duplicate-weak') {
        return {
          ok: false as const,
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
    'bibliography:searchCrossref',
    async (_e, query: string, limit?: number) => {
      const prefs = await getPreferences();
      const r = await searchCrossref(query, {
        email: prefs.bibliography?.email ?? null,
        limit,
      });
      if (r.ok) return { ok: true as const, hits: r.data };
      return { ok: false as const, code: r.code, message: r.message };
    },
  );

  ipcMain.handle(
    'bibliography:searchPubmed',
    async (_e, query: string, limit?: number) => {
      const prefs = await getPreferences();
      const r = await searchPubMed(query, {
        email: prefs.bibliography?.email ?? null,
        ncbiApiKey: prefs.bibliography?.ncbiApiKey ?? null,
        limit,
      });
      if (r.ok) return { ok: true as const, hits: r.data };
      return { ok: false as const, code: r.code, message: r.message };
    },
  );

  ipcMain.handle(
    'bibliography:searchKoreamed',
    async (_e, query: string, limit?: number) => {
      const prefs = await getPreferences();
      const r = await searchKoreaMed(query, {
        email: prefs.bibliography?.email ?? null,
        limit,
      });
      if (r.ok) return { ok: true as const, hits: r.data };
      return { ok: false as const, code: r.code, message: r.message };
    },
  );

  ipcMain.handle('bibliography:resolveOrcid', async (_e, iD: string) => {
    const r = await resolveORCID(iD);
    if (r.ok) return { ok: true as const, profile: r.data };
    return { ok: false as const, code: r.code, message: r.message };
  });

  ipcMain.handle(
    'bibliography:upsertEntry',
    async (_e, filePath: string, entry: BibEntry) => {
      const r = await upsertBibEntry(filePath, entry);
      if (!r.ok) return { ok: false as const, error: r.error };
      return { ok: true as const, key: r.key, path: r.path };
    },
  );

  ipcMain.handle(
    'bibliography:removeEntry',
    async (_e, filePath: string, key: string) => {
      const r = await removeBibEntry(filePath, key);
      if (!r.ok) return { ok: false as const, error: r.error };
      return { ok: true as const, path: r.path };
    },
  );

  ipcMain.handle(
    'bibliography:renameKey',
    async (_e, filePath: string, oldKey: string, newKey: string) => {
      const r = await renameBibEntryKey(filePath, oldKey, newKey);
      if (!r.ok) return { ok: false as const, error: r.error };
      return { ok: true as const, path: r.path };
    },
  );

  ipcMain.handle('bibliography:importFile', async (_e, sourcePath: string) => {
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
    'reference:download',
    async (_e, bibFilePath: string, entry: BibEntry) => {
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

  ipcMain.handle(
    'bibliography:autoSaveAbstract',
    async (_e, bibFilePath: string, entry: BibEntry) => {
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

  ipcMain.handle('reference:open', async (_e, bibFilePath: string, relPath: string) => {
    const abs = resolveFileField(bibFilePath, relPath);
    if (!abs) return { ok: false as const, error: 'empty path' };
    const errMsg = await shell.openPath(abs);
    if (errMsg) return { ok: false as const, error: errMsg };
    return { ok: true as const };
  });

  ipcMain.handle(
    'reference:status',
    async (_e, bibFilePath: string, key: string, fileField?: string | null) =>
      referenceStatus(bibFilePath, key, fileField ?? null),
  );

  ipcMain.handle('reference:scan', async (_e, bibFilePath: string) => {
    try {
      const files = await scanReferenceDir(bibFilePath);
      return { ok: true as const, files };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  });

  ipcMain.handle('reference:extractDoi', async (_e, absPath: string) =>
    extractDoiFromFile(absPath),
  );

  ipcMain.handle(
    'reference:extractText',
    async (
      _e,
      bibFilePath: string,
      relPath: string,
      options?: { maxPages?: number; maxChars?: number },
    ) => {
      const abs = resolveFileField(bibFilePath, relPath);
      if (!abs) return { ok: false as const, error: 'empty path' };
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

  const vault = makeKeyVault();

  ipcMain.handle(
    'ai:setApiKey',
    async (_e, provider: 'anthropic' | 'openai-compatible', plainKey: string) => {
      try {
        const encrypted = vault.encrypt(plainKey);
        const prefs = await getPreferences();
        if (provider === 'anthropic') {
          await setPreferences({ ai: { ...prefs.ai, anthropicKey: encrypted } });
        } else {
          await setPreferences({ ai: { ...prefs.ai, openaiKey: encrypted } });
        }
        return { ok: true as const };
      } catch (err) {
        return { ok: false as const, error: (err as Error).message };
      }
    },
  );

  ipcMain.handle(
    'ai:hasKey',
    async (_e, provider: 'anthropic' | 'openai-compatible') => {
      const prefs = await getPreferences();
      const stored =
        provider === 'anthropic' ? prefs.ai?.anthropicKey : prefs.ai?.openaiKey;
      if (!stored) return false;
      const decrypted = vault.decrypt(stored);
      return decrypted.length > 0;
    },
  );

  ipcMain.handle('ai:verify', async () => {
    const prefs = await getPreferences();
    const provider = prefs.ai?.provider ?? 'anthropic';
    const opts = aiOptionsFor(provider, prefs, vault);
    if (!opts) {
      return { ok: false as const, code: 'auth', message: 'no API key configured' };
    }
    const r = await aiVerifyCall(opts);
    if (!r.ok) return { ok: false as const, code: r.code, message: r.message };
    return { ok: true as const, provider, model: opts.model };
  });

  ipcMain.handle(
    'ai:chat',
    async (
      _e,
      messages: AiMessage[],
      options?: { maxTokens?: number; temperature?: number },
    ) => {
      const prefs = await getPreferences();
      const provider = prefs.ai?.provider ?? 'anthropic';
      const opts = aiOptionsFor(provider, prefs, vault);
      if (!opts) {
        return { ok: false as const, code: 'auth', message: 'no API key configured' };
      }
      const r = await aiChatCall(messages, {
        ...opts,
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
      });
      if (!r.ok) return { ok: false as const, code: r.code, message: r.message };
      return {
        ok: true as const,
        text: r.data.text,
        inputTokens: r.data.inputTokens,
        outputTokens: r.data.outputTokens,
      };
    },
  );

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
      return result.filePaths[0]!;
    },
  );

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
