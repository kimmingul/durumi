import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { type BibEntry, indexBibEntries, parseBibTeX } from '@shared/bibtex';
import { formatEntry, serializeForAppend } from '@shared/bibtexWriter';
import { makeCitationKey } from '@shared/citationKey';
import { writeFileAtomic } from './fs';

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

export interface ComputeBibPathResult {
  /** Absolute path of the target `.bib` (existing one, or the default we'd create). */
  path: string;
  /** True iff that file is already on disk. */
  exists: boolean;
}

/**
 * Pure path lookup. Probes the discovery order (`references.bib`,
 * `references.bibtex`, `bibliography.bib`) and returns the first match. If
 * none exist, returns the path `ensureBibFile` *would* create — but does
 * NOT touch disk. The renderer uses this when binding to a document so
 * the UI can render "Bibliography will be created at <path> on first
 * reference" without surprising the user with a new file appearing in
 * their workspace.
 */
export async function computeBibPath(
  docPath: string | null,
  dirOverride?: string | null,
): Promise<ComputeBibPathResult | { error: string }> {
  const dir = dirOverride && dirOverride.length > 0
    ? dirOverride
    : docPath
      ? dirname(docPath)
      : null;
  if (!dir) return { error: 'no-document' };
  for (const name of PREFERRED_NAMES) {
    const candidate = join(dir, name);
    try {
      await fs.access(candidate);
      return { path: candidate, exists: true };
    } catch {
      // not present — keep probing
    }
  }
  return { path: join(dir, 'references.bib'), exists: false };
}

/**
 * Locate (or create) the `.bib` file we should write into. Track A's product
 * decision is "default = same folder as the active document"; the caller can
 * override `dir` to point elsewhere later.
 *
 * v0.2.x: the renderer no longer calls this directly on document-open
 * (that was a silent write-on-open side effect). It's reached only via
 * `appendEntry`'s atomic write or an explicit user action.
 */
export async function ensureBibFile(
  docPath: string | null,
  dirOverride?: string | null,
): Promise<EnsureFileResult | { error: string }> {
  const probe = await computeBibPath(docPath, dirOverride);
  if ('error' in probe) return probe;
  if (probe.exists) return { path: probe.path, created: false };
  try {
    // `wx` flag = fail if exists. We just access-checked all three names so
    // we know it isn't there; this guards against TOCTOU on the rare race.
    await fs.writeFile(probe.path, '', { encoding: 'utf8', flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      return { path: probe.path, created: false };
    }
    return { error: (err as Error).message };
  }
  return { path: probe.path, created: true };
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
 * v0.1.10 — duplicate-DOI rejection. When the incoming entry's DOI
 * (case-normalised, prefix-stripped) is already present in the bib, we
 * refuse to add a second copy and surface the existing key so the UI can
 * highlight / focus that row.
 */
export interface AppendDuplicateDoi {
  ok: false;
  error: 'duplicate-doi';
  existingKey: string;
}

/**
 * v0.1.10 — weak-match dedup. Triggered when no DOI is available; we
 * compare normalised title + first-author surname + year. The caller is
 * expected to surface this as a "Possible duplicate — add anyway?" confirm.
 */
export interface AppendDuplicateWeak {
  ok: false;
  error: 'duplicate-weak';
  existingKey: string;
  normalizedTitle: string;
}

/**
 * Append a new entry. The caller passes a `BibEntry` with an empty `key`
 * (the Crossref pipeline always does — see `crossrefMessageToEntry`); we
 * mint a unique key by reading the existing file and asking
 * `makeCitationKey`. If the entry already has a `key` we keep it but still
 * de-collide.
 *
 * v0.1.10 — adds a duplicate-check pass before minting the key:
 *   1. If the incoming entry has a DOI and the bib already contains an
 *      entry with the same (normalised) DOI, return `duplicate-doi`.
 *   2. Otherwise, if the incoming entry has no DOI but matches an existing
 *      entry on (normalised title, first-author surname, year), return
 *      `duplicate-weak` so the renderer can surface a confirm modal.
 *
 * The caller can bypass the weak match by setting `force: true`.
 */
export interface AppendOptions {
  /** Skip the weak (title+author+year) duplicate check. */
  force?: boolean;
}

export async function appendEntry(
  filePath: string,
  entry: BibEntry,
  opts: AppendOptions = {},
): Promise<AppendResult | AppendError | AppendDuplicateDoi | AppendDuplicateWeak> {
  const existing = await readSafely(filePath);
  const parsed = parseBibTeX(existing);
  const taken = new Set(parsed.entries.map((e) => e.key));

  // --- v0.1.10 dedup ----------------------------------------------------
  // `force: true` bypasses BOTH the DOI and weak-match checks. Callers
  // (e.g. upsertEntry) use it when the user explicitly authored the entry.
  if (!opts.force) {
    const incomingDoi = normalizeDoi(entry.fields.doi ?? '');
    if (incomingDoi.length > 0) {
      for (const existingEntry of parsed.entries) {
        const existingDoi = normalizeDoi(existingEntry.fields.doi ?? '');
        if (existingDoi.length > 0 && existingDoi === incomingDoi) {
          return { ok: false, error: 'duplicate-doi', existingKey: existingEntry.key };
        }
      }
    } else {
      const weak = findWeakDuplicate(entry, parsed.entries);
      if (weak) {
        return {
          ok: false,
          error: 'duplicate-weak',
          existingKey: weak.existingKey,
          normalizedTitle: weak.normalizedTitle,
        };
      }
    }
  }

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
 * Idempotent DOI normalisation. Strips the optional `https://(dx.)?doi.org/`
 * prefix, lowercases, and drops any trailing slash + surrounding whitespace.
 * Empty / undefined input becomes the empty string so callers can `===`
 * against it without a separate null check.
 */
export function normalizeDoi(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  const stripped = trimmed.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  return stripped.replace(/\/+$/, '').toLowerCase();
}

interface WeakMatch {
  existingKey: string;
  normalizedTitle: string;
}

function findWeakDuplicate(incoming: BibEntry, existing: BibEntry[]): WeakMatch | null {
  const nt = normalizeTitle(incoming.fields.title ?? '');
  if (nt.length < 4) return null; // titles like "On X" are too noisy to match
  const surname = firstAuthorSurname(incoming.fields.author ?? incoming.fields.editor ?? '');
  const year = (incoming.fields.year ?? incoming.fields.date ?? '').match(/\d{4}/)?.[0] ?? '';
  if (!surname || !year) return null;
  for (const e of existing) {
    const eNt = normalizeTitle(e.fields.title ?? '');
    if (eNt !== nt) continue;
    const eSurname = firstAuthorSurname(e.fields.author ?? e.fields.editor ?? '');
    if (eSurname !== surname) continue;
    const eYear = (e.fields.year ?? e.fields.date ?? '').match(/\d{4}/)?.[0] ?? '';
    if (eYear !== year) continue;
    return { existingKey: e.key, normalizedTitle: nt };
  }
  return null;
}

function normalizeTitle(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}]+/gu, ' ')
    .trim();
}

function firstAuthorSurname(raw: string): string {
  if (!raw) return '';
  const first = raw.split(/\s+and\s+/i)[0]!.trim();
  if (!first) return '';
  const surnameRaw = first.includes(',')
    ? (first.split(',')[0] ?? '')
    : (first.split(/\s+/).pop() ?? '');
  return surnameRaw.normalize('NFKC').toLowerCase();
}

/**
 * Rename an entry's citation key. Validates that:
 *   - `oldKey` exists in the file
 *   - `newKey` is non-empty and not already taken
 * Writes the rewritten bib atomically. The associated file in `reference/`
 * is intentionally NOT renamed — it may have a path that doesn't include
 * the key (e.g. user-dropped "paper-from-email.pdf"). The caller updates
 * the document `[@oldKey]` references separately.
 */
export async function renameEntryKey(
  filePath: string,
  oldKey: string,
  newKey: string,
): Promise<{ ok: true; path: string } | AppendError> {
  if (!oldKey || !newKey) {
    return { ok: false, error: 'rename requires both keys' };
  }
  if (oldKey === newKey) {
    return { ok: false, error: 'noop' };
  }
  const existing = await readSafely(filePath);
  const parsed = parseBibTeX(existing);
  const found = parsed.entries.find((e) => e.key === oldKey);
  if (!found) return { ok: false, error: 'not-found' };
  if (parsed.entries.some((e) => e.key === newKey)) {
    return { ok: false, error: 'key-taken' };
  }
  const blocks = parsed.entries.map((e) =>
    formatEntry(e.key === oldKey ? { ...e, key: newKey } : e),
  );
  const rebuilt = blocks.length === 0 ? '' : blocks.join('\n\n') + '\n';
  const writeResult = await atomicWrite(filePath, rebuilt);
  if (!writeResult.ok) return { ok: false, error: writeResult.error };
  return { ok: true, path: filePath };
}

/**
 * Remove an entry by key. The on-disk file in `reference/` (if any) is left
 * alone — the architecture invariant says we never auto-delete user files.
 * Returns `{ ok: false, error: 'not-found' }` when the key isn't present
 * so the caller can surface a meaningful UI message (vs. silently ignoring).
 */
export async function removeEntry(
  filePath: string,
  key: string,
): Promise<{ ok: true; path: string } | AppendError> {
  if (!key) {
    return { ok: false, error: 'remove requires a non-empty key' };
  }
  const existing = await readSafely(filePath);
  const parsed = parseBibTeX(existing);
  const filtered = parsed.entries.filter((e) => e.key !== key);
  if (filtered.length === parsed.entries.length) {
    return { ok: false, error: 'not-found' };
  }
  const rebuilt = filtered.length === 0
    ? ''
    : filtered.map(formatEntry).join('\n\n') + '\n';
  const writeResult = await atomicWrite(filePath, rebuilt);
  if (!writeResult.ok) return { ok: false, error: writeResult.error };
  return { ok: true, path: filePath };
}

/**
 * Replace an entry by key, or append if not present. Used by the v0.1.7.1
 * "edit entry" UI and by the post-download persist (Track B).
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
    // Upsert is a user-driven write (edit-entry dialog Save). `force` skips
    // the v0.1.10 dedup checks so we can't accidentally surface a duplicate
    // rejection for an entry the user is explicitly authoring.
    const r = await appendEntry(filePath, entry, { force: true });
    if (r.ok) return r;
    // With force=true neither duplicate-* path can fire — narrow to AppendError.
    if (r.error === 'duplicate-doi' || r.error === 'duplicate-weak') {
      return { ok: false, error: r.error };
    }
    return r;
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
  try {
    await writeFileAtomic(filePath, content);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
