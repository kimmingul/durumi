import { promises as fs } from 'node:fs';
import { dirname, join, relative, basename, extname } from 'node:path';

/**
 * Filesystem layer for the v0.1.7 reference library. Lives next to
 * `references.bib` in a `reference/` subfolder. The folder layout is
 * the only contract here — the bib `file` field stores
 * `references.bib`-relative paths (typically `reference/<key>.<ext>`).
 *
 * Two state lookups:
 *   1. `referenceStatus(bibPath, key)` — does a file currently match the
 *      cite key? Looks at the bib entry's `file` field if present, else
 *      probes `reference/<key>.{pdf,md}`.
 *   2. `scanReferenceDir(bibPath)` — list every file in `reference/`
 *      regardless of bib registration. The "orphan files" view (Track C)
 *      uses this to find user-dropped files.
 */
export const REFERENCE_DIR_NAME = 'reference';

export type ReferenceFileType = 'pdf' | 'md' | null;

export interface ReferenceFileStatus {
  /** True iff a file exists at the resolved path. */
  exists: boolean;
  /** Absolute path on disk (only meaningful when `exists`). */
  absPath: string | null;
  /** `references.bib`-relative path (e.g. `reference/smith2024deep.pdf`). */
  relPath: string | null;
  /** File type if recognised. */
  type: ReferenceFileType;
}

/**
 * Resolve `<bibDir>/reference/`. The directory is NOT created here — every
 * call site that needs to write also calls `mkdir(..., {recursive: true})`.
 */
export function referenceDir(bibPath: string): string {
  return join(dirname(bibPath), REFERENCE_DIR_NAME);
}

/**
 * Compose the canonical target path for a downloaded file. Auto-generated
 * downloads always land at `<reference>/<key>.<ext>`. User-dropped files
 * keep their original name and are reconciled by `entry.fields.file`.
 */
export function defaultDownloadPath(bibPath: string, key: string, type: 'pdf' | 'md'): {
  absPath: string;
  relPath: string;
} {
  const safeKey = sanitizeFilename(key);
  const fileName = `${safeKey}.${type}`;
  const absPath = join(referenceDir(bibPath), fileName);
  const relPath = `${REFERENCE_DIR_NAME}/${fileName}`;
  return { absPath, relPath };
}

/**
 * Resolve a bib `file` field (might be relative or absolute) into an
 * absolute path. Relative paths resolve against `dirname(bibPath)` to
 * match Pandoc / biber behaviour.
 */
export function resolveFileField(bibPath: string, fileField: string): string {
  if (!fileField) return '';
  // Strip Zotero-style prefix `path:application/pdf` if present.
  const cleaned = fileField.replace(/^:?(.*?):application\/[^:]+$/, '$1').trim();
  if (cleaned.startsWith('/') || /^[A-Za-z]:[\\/]/.test(cleaned)) {
    // Absolute (POSIX or Windows). Per architecture invariant we don't
    // produce these ourselves but we tolerate them on read.
    return cleaned;
  }
  return join(dirname(bibPath), cleaned);
}

/**
 * Probe whether a file exists for the given citation key. If the entry
 * has a `file` field, trust it (with a fallback existence check). Otherwise
 * scan the canonical names `<key>.pdf` then `<key>.md`.
 */
export async function referenceStatus(
  bibPath: string,
  key: string,
  fileField?: string | null,
): Promise<ReferenceFileStatus> {
  if (fileField) {
    const abs = resolveFileField(bibPath, fileField);
    if (await pathExists(abs)) {
      return {
        exists: true,
        absPath: abs,
        relPath: toBibRelative(bibPath, abs),
        type: typeFromExt(extname(abs)),
      };
    }
  }
  const dir = referenceDir(bibPath);
  for (const ext of ['pdf', 'md'] as const) {
    const abs = join(dir, `${sanitizeFilename(key)}.${ext}`);
    if (await pathExists(abs)) {
      return {
        exists: true,
        absPath: abs,
        relPath: `${REFERENCE_DIR_NAME}/${sanitizeFilename(key)}.${ext}`,
        type: ext,
      };
    }
  }
  return { exists: false, absPath: null, relPath: null, type: null };
}

export interface ScannedFile {
  absPath: string;
  relPath: string;
  fileName: string;
  type: ReferenceFileType;
}

/**
 * List every file in the reference folder. Used by the orphan-detection UI
 * (Track C) to flag files the user dropped manually that aren't registered
 * in any bib entry.
 */
export async function scanReferenceDir(bibPath: string): Promise<ScannedFile[]> {
  const dir = referenceDir(bibPath);
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const out: ScannedFile[] = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const abs = join(dir, name);
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    out.push({
      absPath: abs,
      relPath: `${REFERENCE_DIR_NAME}/${name}`,
      fileName: name,
      type: typeFromExt(extname(name)),
    });
  }
  return out.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

/** Replace path-hostile characters so a key can become a filename. */
export function sanitizeFilename(key: string): string {
  return key.replace(/[/\\?%*:|"<>]/g, '_');
}

function typeFromExt(ext: string): ReferenceFileType {
  const lower = ext.toLowerCase().replace(/^\./, '');
  if (lower === 'pdf') return 'pdf';
  if (lower === 'md' || lower === 'markdown') return 'md';
  return null;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function toBibRelative(bibPath: string, abs: string): string {
  const rel = relative(dirname(bibPath), abs);
  // Always use POSIX separators so the field round-trips cleanly across OSes.
  return rel.split(/[\\/]/).join('/');
}

/**
 * Convenience: ensure the reference dir exists. Called before any write.
 * Idempotent and silent on existing dir.
 */
export async function ensureReferenceDir(bibPath: string): Promise<string> {
  const dir = referenceDir(bibPath);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Used by tests to clean up between cases without nuking the parent. */
export function basenameOf(absPath: string): string {
  return basename(absPath);
}
