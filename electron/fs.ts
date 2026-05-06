import { readdir, stat } from 'node:fs/promises';
import * as fs from 'node:fs';
import * as pathLib from 'node:path';
import { dialog, BrowserWindow } from 'electron';
import type { DirEntry } from '../shared/ipc-contract';

const EXCLUDE_DIRS = new Set([
  'node_modules',
  'out',
  'dist',
  'dist-build',
  'target',
  'build',
  '.git',
  '.DS_Store',
  '.vscode',
  '.idea',
  '.next',
  '.nuxt',
]);

const MD_EXT = /\.(md|markdown)$/i;

function isMarkdownFile(name: string): boolean {
  return MD_EXT.test(name);
}

function isHidden(name: string): boolean {
  return name.startsWith('.');
}

function isExcluded(name: string): boolean {
  return EXCLUDE_DIRS.has(name);
}

export async function listDirectory(absPath: string): Promise<DirEntry[]> {
  let entries: Array<{ name: string; isDirectory: () => boolean }>;
  try {
    entries = (await readdir(absPath, { withFileTypes: true })) as never;
  } catch (err) {
    console.warn('listDirectory: failed to read', absPath, err);
    return [];
  }
  const out: DirEntry[] = [];
  for (const e of entries) {
    if (isHidden(e.name)) continue;
    if (isExcluded(e.name)) continue;
    const isDir = e.isDirectory();
    if (!isDir && !isMarkdownFile(e.name)) continue;
    const full = pathLib.join(absPath, e.name);
    let mtimeMs = 0;
    try {
      const st = await stat(full);
      mtimeMs = st.mtimeMs;
    } catch {
      // permission denied on stat — keep entry with mtimeMs=0
    }
    out.push({ name: e.name, path: full, isDir, mtimeMs });
  }
  out.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

interface RootWatchEntry {
  watcher: fs.FSWatcher | null;
  pollInterval: NodeJS.Timeout | null;
  pollSnapshot: Map<string, number>;
  pendingTimer: NodeJS.Timeout | null;
}

const watchers: Map<string, RootWatchEntry> = new Map();

export async function watchRoot(
  rootPath: string,
  onChange: (changedPath: string) => void,
): Promise<void> {
  // Idempotent: if this root is already being watched, no-op.
  if (watchers.has(rootPath)) return;

  const entry: RootWatchEntry = {
    watcher: null,
    pollInterval: null,
    pollSnapshot: new Map(),
    pendingTimer: null,
  };
  watchers.set(rootPath, entry);

  if (process.platform === 'linux') {
    entry.pollInterval = setInterval(async () => {
      const cur = new Map<string, number>();
      try {
        const list = await listDirectory(rootPath);
        for (const e of list) cur.set(e.path, e.mtimeMs);
      } catch {
        return;
      }
      let changed = false;
      if (cur.size !== entry.pollSnapshot.size) changed = true;
      else {
        for (const [k, v] of cur) {
          if (entry.pollSnapshot.get(k) !== v) {
            changed = true;
            break;
          }
        }
      }
      if (changed) {
        entry.pollSnapshot = cur;
        onChange(rootPath);
      }
    }, 5000);
    const initList = await listDirectory(rootPath);
    entry.pollSnapshot = new Map(initList.map((e) => [e.path, e.mtimeMs]));
  } else {
    let pendingPath = rootPath;
    entry.watcher = fs.watch(rootPath, { recursive: true }, (_event, filename) => {
      pendingPath = filename ? pathLib.join(rootPath, String(filename)) : rootPath;
      if (entry.pendingTimer) clearTimeout(entry.pendingTimer);
      entry.pendingTimer = setTimeout(() => {
        const changed = pendingPath;
        entry.pendingTimer = null;
        onChange(changed);
      }, 200);
    });
  }
}

export async function unwatchRoot(rootPath: string): Promise<void> {
  const entry = watchers.get(rootPath);
  if (!entry) return;
  if (entry.watcher) {
    entry.watcher.close();
    entry.watcher = null;
  }
  if (entry.pollInterval) {
    clearInterval(entry.pollInterval);
    entry.pollInterval = null;
  }
  if (entry.pendingTimer) {
    clearTimeout(entry.pendingTimer);
    entry.pendingTimer = null;
  }
  entry.pollSnapshot = new Map();
  watchers.delete(rootPath);
}

export async function unwatchAllRoots(): Promise<void> {
  const paths = Array.from(watchers.keys());
  for (const p of paths) {
    await unwatchRoot(p);
  }
}

export async function openFolderDialog(): Promise<string | null> {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return null;
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (r.canceled || r.filePaths.length === 0) return null;
  return r.filePaths[0];
}
