import { promises as fs } from 'node:fs';
import { extname, join } from 'node:path';
import { shell } from 'electron';

export type FileOpResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

/**
 * Creates an empty file at `path`. Fails when the file already exists rather
 * than overwriting silently — that would be data loss.
 */
export async function createFile(path: string): Promise<FileOpResult> {
  try {
    const handle = await fs.open(path, 'wx');
    await handle.close();
    return { ok: true, path };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function createFolder(path: string): Promise<FileOpResult> {
  try {
    await fs.mkdir(path);
    return { ok: true, path };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function rename(oldPath: string, newPath: string): Promise<FileOpResult> {
  try {
    // `fs.rename` overwrites silently on POSIX. Refuse if target exists.
    try {
      await fs.access(newPath);
      return { ok: false, error: `target already exists: ${newPath}` };
    } catch {
      // not found — good.
    }
    await fs.rename(oldPath, newPath);
    return { ok: true, path: newPath };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function duplicate(path: string): Promise<FileOpResult> {
  try {
    const ext = extname(path);
    const base = path.slice(0, path.length - ext.length);
    let candidate = `${base}-copy${ext}`;
    let n = 2;
    while (await exists(candidate)) {
      candidate = `${base}-copy-${n}${ext}`;
      n++;
      if (n > 1000) return { ok: false, error: 'could not find a free name' };
    }
    await fs.copyFile(path, candidate);
    return { ok: true, path: candidate };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function moveToTrash(path: string): Promise<FileOpResult> {
  try {
    await shell.trashItem(path);
    return { ok: true, path };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function revealInFolder(path: string): Promise<FileOpResult> {
  try {
    shell.showItemInFolder(path);
    return { ok: true, path };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

function friendly(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Compose a sibling path under `dir` with a unique numeric suffix if needed. */
export async function uniqueChildPath(dir: string, baseName: string, ext = ''): Promise<string> {
  let candidate = join(dir, baseName + ext);
  let n = 1;
  while (await exists(candidate)) {
    candidate = join(dir, `${baseName}-${n}${ext}`);
    n++;
    if (n > 1000) throw new Error('could not find a free name');
  }
  return candidate;
}
