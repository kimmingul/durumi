import { promises as fs } from 'node:fs';
import { join, sep } from 'node:path';

export interface FileIndexEntry {
  /** Workspace-relative path with forward slashes. */
  relPath: string;
  /** Absolute path. */
  absPath: string;
  /** File name only. */
  name: string;
}

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

const TEXT_EXT = /\.(md|markdown|txt|tex|csv|json|yaml|yml)$/i;
const MAX_ENTRIES = 5000;

/**
 * Walks the workspace and returns every text file's path. Used by Quick Open
 * to back the fuzzy match list. Cheap to compute on small projects; on large
 * ones the MAX_ENTRIES guard prevents unbounded memory use.
 */
export async function indexWorkspace(roots: readonly string[]): Promise<FileIndexEntry[]> {
  const out: FileIndexEntry[] = [];
  for (const root of roots) {
    if (out.length >= MAX_ENTRIES) break;
    await walk(root, root, out);
  }
  return out;
}

async function walk(rootPath: string, current: string, out: FileIndexEntry[]): Promise<void> {
  if (out.length >= MAX_ENTRIES) return;
  let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    entries = (await fs.readdir(current, { withFileTypes: true })) as never;
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_ENTRIES) return;
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      await walk(rootPath, join(current, entry.name), out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!TEXT_EXT.test(entry.name)) continue;
    const abs = join(current, entry.name);
    out.push({
      name: entry.name,
      absPath: abs,
      relPath: relativise(rootPath, abs),
    });
  }
}

function relativise(root: string, abs: string): string {
  if (abs.startsWith(root + sep)) {
    return abs.slice(root.length + 1).replace(/\\/g, '/');
  }
  return abs.replace(/\\/g, '/');
}
