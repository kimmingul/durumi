import { resolve, sep } from 'node:path';
import { getPreferences } from './preferences';

/**
 * Trust-scope guard for renderer-supplied paths.
 *
 * Threat model: the renderer is untrusted code (XSS, malicious extension,
 * compromised dependency). Main accepts paths over IPC for file ops,
 * bibliography writes, reference reads, etc. Without a guard a single
 * `file:openPath('/etc/passwd')` exfiltrates arbitrary files.
 *
 * Trust sources, in order of cost:
 *
 *   1. **Session allowlist** — paths returned by main-side dialogs
 *      (`file:open`, `file:saveAs`, `export:file`, `dialog:openFolder`,
 *      `dialog:pickFile`). Populated by the dialog handlers themselves.
 *      Cleared when the app process exits.
 *
 *   2. **Workspace folders** — `prefs.workspaceFolders`. The renderer can
 *      only *add* a folder here by going through `dialog:openFolder`, and
 *      `prefs:set` is guarded so it refuses to add a workspace folder
 *      that didn't come through a dialog this session.
 *
 *   3. **Recent files** — `prefs.recentFiles`. Same logic as above:
 *      `prefs:set` won't accept a `recentFiles` entry the session
 *      didn't see come from a dialog.
 *
 * Paths are compared after `path.resolve` so `..` traversal collapses and
 * `/workspace/../etc/passwd` ends up as `/etc/passwd` — not matching any
 * workspace prefix. Symlink resolution via `fs.realpath` is intentionally
 * NOT performed (would add an async disk hit to every guarded call); a
 * user who symlinks `/etc/shadow` *into* their own workspace is an
 * exotic threat we accept.
 */

const sessionAllowed = new Set<string>();

export class PathNotAllowedError extends Error {
  readonly code = 'path-not-allowed' as const;
  constructor(public readonly attempted: string) {
    super(`path not allowed: ${attempted}`);
    this.name = 'PathNotAllowedError';
  }
}

/**
 * Register a path as trusted for the rest of this session. Called by
 * every IPC dialog handler immediately after the dialog resolves.
 */
export function allowSessionPath(absPath: string): void {
  if (!absPath) return;
  sessionAllowed.add(resolve(absPath));
}

/** Test-only: reset session state. */
export function _resetSessionForTests(): void {
  sessionAllowed.clear();
}

/** Test seam — lets unit tests inject a deterministic prefs source. */
export interface PrefsLike {
  workspaceFolders?: string[];
  recentFiles?: string[];
}
let prefsReader: () => Promise<PrefsLike> =
  getPreferences as unknown as () => Promise<PrefsLike>;
export function _setPrefsReaderForTests(
  reader: () => Promise<PrefsLike>,
): void {
  prefsReader = reader;
}
export function _resetPrefsReaderForTests(): void {
  prefsReader = getPreferences as unknown as () => Promise<PrefsLike>;
}

function isInside(target: string, root: string): boolean {
  const r = resolve(root);
  return target === r || target.startsWith(r + sep);
}

/**
 * Returns true iff `targetPath` is trusted under the rules above.
 * Resolves `..` segments before checking, so traversal attempts collapse.
 */
export async function isAllowedPath(targetPath: string): Promise<boolean> {
  if (!targetPath) return false;
  const target = resolve(targetPath);
  if (sessionAllowed.has(target)) return true;
  const prefs = await prefsReader();
  for (const root of prefs.workspaceFolders ?? []) {
    if (isInside(target, root)) return true;
  }
  for (const recent of prefs.recentFiles ?? []) {
    if (resolve(recent) === target) return true;
  }
  return false;
}

/** Throws PathNotAllowedError if the path is outside the trust scope. */
export async function assertAllowedPath(targetPath: string): Promise<void> {
  if (!(await isAllowedPath(targetPath))) {
    throw new PathNotAllowedError(targetPath);
  }
}

/**
 * `prefs:set` guard. The renderer can't smuggle a new workspace folder
 * or recent-files entry into preferences without it having been seen by
 * a main-side dialog first. Existing entries (already persisted from a
 * prior session) are preserved.
 */
export async function assertPrefsPatchAllowed(patch: {
  workspaceFolders?: string[];
  recentFiles?: string[];
}): Promise<void> {
  if (!patch.workspaceFolders && !patch.recentFiles) return;
  const current = await prefsReader();
  const existingFolders = new Set((current.workspaceFolders ?? []).map((p) => resolve(p)));
  const existingRecents = new Set((current.recentFiles ?? []).map((p) => resolve(p)));
  for (const wf of patch.workspaceFolders ?? []) {
    const r = resolve(wf);
    if (existingFolders.has(r)) continue;
    if (sessionAllowed.has(r)) continue;
    throw new PathNotAllowedError(wf);
  }
  for (const rf of patch.recentFiles ?? []) {
    const r = resolve(rf);
    if (existingRecents.has(r)) continue;
    if (sessionAllowed.has(r)) continue;
    throw new PathNotAllowedError(rf);
  }
}
