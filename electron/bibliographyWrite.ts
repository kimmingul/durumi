import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { type BibEntry, indexBibEntries, parseBibTeX } from '@shared/bibtex';
import { formatEntry, serializeForAppend } from '@shared/bibtexWriter';
import { makeCitationKey } from '@shared/citationKey';

/**
 * Bibliography write paths. v0.1.6 keeps the `.bib` file as the single source
 * of truth — no sidecar JSON, no DB. All writes are atomic (tmp+rename in
 * the same directory) so a crash mid-write never half-corrupts a multi-MB
 * `.bib`.
 *
 * Discovery order when picking a target file (matches `bibliography.ts` so
 * the read and write paths agree):
 *   1. references.bib in the document's folder
 *   2. references.bibtex
 *   3. bibliography.bib
 *   4. (none → create `references.bib` next to the document)
 */
const PREFERRED_NAMES = ['references.bib', 'references.bibtex', 'bibliography.bib'] as const;

export interface EnsureFileResult {
  /** Absolute path of the chosen `.bib` file. */
  path: string;
  /** True iff this call created the file (was missing on disk before). */
  created: boolean;
}

/**
 * Locate (or create) the `.bib` file we should write into. Track A's product
 * decision is "default = same folder as the active document"; the caller can
 * override `dir` to point elsewhere later.
 */
export async function ensureBibFile(
  docPath: string | null,
  dirOverride?: string | null,
): Promise<EnsureFileResult | { error: string }> {
  const dir = dirOverride && dirOverride.length > 0
    ? dirOverride
    : docPath
      ? dirname(docPath)
      : null;
  if (!dir) {
    return { error: 'no-document' };
  }
  for (const name of PREFERRED_NAMES) {
    const candidate = join(dir, name);
    try {
      await fs.access(candidate);
      return { path: candidate, created: false };
    } catch {
      // not present — keep probing
    }
  }
  // None exist; create `references.bib` (UTF-8, empty).
  const newPath = join(dir, 'references.bib');
  try {
    // `wx` flag = fail if exists. We just access-checked all three names so
    // we know it isn't there; this guards against TOCTOU on the rare race.
    await fs.writeFile(newPath, '', { encoding: 'utf8', flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      return { path: newPath, created: false };
    }
    return { error: (err as Error).message };
  }
  return { path: newPath, created: true };
}

export interface AppendResult {
  ok: true;
  /** Final citation key actually written (after collision resolution). */
  key: string;
  /** Absolute path of the file that was written. */
  path: string;
}

export interface AppendError {
  ok: false;
  error: string;
}

/**
 * Append a new entry. The caller passes a `BibEntry` with an empty `key`
 * (the Crossref pipeline always does — see `crossrefMessageToEntry`); we
 * mint a unique key by reading the existing file and asking
 * `makeCitationKey`. If the entry already has a `key` we keep it but still
 * de-collide.
 */
export async function appendEntry(
  filePath: string,
  entry: BibEntry,
): Promise<AppendResult | AppendError> {
  const existing = await readSafely(filePath);
  const parsed = parseBibTeX(existing);
  const taken = new Set(parsed.entries.map((e) => e.key));

  const desiredKey = entry.key && entry.key.length > 0 ? entry.key : null;
  const key = desiredKey && !taken.has(desiredKey)
    ? desiredKey
    : makeCitationKey({ ...entry, key: desiredKey ?? '' }, { existingKeys: taken });

  const finalEntry: BibEntry = { ...entry, key };
  const sep = needsSeparator(existing) ? '\n\n' : '';
  const next = existing + sep + serializeForAppend(finalEntry);

  const writeResult = await atomicWrite(filePath, next);
  if (!writeResult.ok) return { ok: false, error: writeResult.error };
  return { ok: true, key, path: filePath };
}

/**
 * Replace an entry by key, or append if not present. Used by future Track B
 * "edit entry" UI; included now so the IPC surface is stable.
 */
export async function upsertEntry(
  filePath: string,
  entry: BibEntry,
): Promise<AppendResult | AppendError> {
  if (!entry.key) {
    return { ok: false, error: 'upsert requires a non-empty key' };
  }
  const existing = await readSafely(filePath);
  const parsed = parseBibTeX(existing);
  const idx = indexBibEntries(parsed);
  if (!idx.has(entry.key)) {
    return appendEntry(filePath, entry);
  }
  // Rebuild the file with `entry` replacing the old definition. We rewrite
  // every entry from the in-memory array so spacing/formatting normalises.
  const blocks: string[] = [];
  for (const e of parsed.entries) {
    blocks.push(formatEntry(e.key === entry.key ? entry : e));
  }
  const rebuilt = blocks.join('\n\n') + '\n';
  const writeResult = await atomicWrite(filePath, rebuilt);
  if (!writeResult.ok) return { ok: false, error: writeResult.error };
  return { ok: true, key: entry.key, path: filePath };
}

async function readSafely(path: string): Promise<string> {
  try {
    return await fs.readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw err;
  }
}

function needsSeparator(existing: string): boolean {
  if (existing.length === 0) return false;
  return !/\n\s*$/.test(existing);
}

interface WriteOk { ok: true }
interface WriteErr { ok: false; error: string }

async function atomicWrite(filePath: string, content: string): Promise<WriteOk | WriteErr> {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, filePath);
    return { ok: true };
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    return { ok: false, error: (err as Error).message };
  }
}
