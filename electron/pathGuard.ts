import { dirname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { getPreferences } from './preferences';

/**
 * Test-only escape hatch. When `DURUMI_E2E=1` is set in the environment
 * (the Playwright `pnpm test:e2e` script forwards it), paths under the
 * OS tmpdir are treated as session-trusted trees. This lets e2e specs
 * inject ephemeral workspace folders (`fs.mkdtempSync(os.tmpdir(), …)`)
 * via `prefs:set` without going through the file-dialog round trip —
 * something Playwright cannot drive against Electron's native dialog.
 *
 * Production builds set `DURUMI_E2E` exactly nowhere; the flag is opt-in
 * via the test script and the renderer cannot influence the main-process
 * environment, so this does not widen the attack surface for shipped
 * builds.
 */
const E2E_BYPASS_ENABLED = process.env.DURUMI_E2E === '1';
const E2E_TMPDIR = E2E_BYPASS_ENABLED ? resolve(tmpdir()) : null;

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
 *   2. **Session-trusted directory trees** — when a dialog (or any other
 *      legitimate flow) hands us a file path, the file's parent directory
 *      is registered here so the editor can also load sibling assets
 *      (e.g. `assets/img-*.png` written by the image-paste flow). The
 *      semantics mirror workspace folders: any descendant path is
 *      trusted, normalised via `path.resolve` so `..` traversal collapses.
 *      Bootstrapped at startup from `dirname` of every recent file in
 *      preferences, so reopening a recent doc reaches its assets even on
 *      a cold start.
 *
 *   3. **Workspace folders** — `prefs.workspaceFolders`. The renderer can
 *      only *add* a folder here by going through `dialog:openFolder`, and
 *      `prefs:set` is guarded so it refuses to add a workspace folder
 *      that didn't come through a dialog this session.
 *
 *   4. **Recent files** — `prefs.recentFiles`. Same logic as above:
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
const sessionAllowedTrees = new Set<string>();

export class PathNotAllowedError extends Error {
  readonly code = 'path-not-allowed' as const;
  constructor(public readonly attempted: string) {
    super(`path not allowed: ${attempted}`);
    this.name = 'PathNotAllowedError';
  }
}

/**
 * Register a path as trusted for the rest of this session. Called by
 * every IPC dialog handler immediately after the dialog resolves. Also
 * registers the parent directory as a session-trusted tree so sibling
 * assets (e.g. `<doc_dir>/assets/img-*.png` from the image-paste flow)
 * are reachable without a separate trust step.
 */
export function allowSessionPath(absPath: string): void {
  if (!absPath) return;
  const r = resolve(absPath);
  sessionAllowed.add(r);
  const parent = dirname(r);
  if (parent && parent !== r) sessionAllowedTrees.add(parent);
}

/**
 * Register a directory as a session-trusted tree. Any descendant path
 * passes `isAllowedPath`. Use for folders the user explicitly picked
 * (e.g. `dialog:openFolder` even when not adding it to workspaceFolders)
 * or to bootstrap recent-file ancestors at startup.
 */
export function allowSessionTree(absDir: string): void {
  if (!absDir) return;
  sessionAllowedTrees.add(resolve(absDir));
}

/** Test-only: reset session state. */
export function _resetSessionForTests(): void {
  sessionAllowed.clear();
  sessionAllowedTrees.clear();
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
  // Test-only: accept any path under the OS tmpdir when DURUMI_E2E=1 is set.
  if (E2E_TMPDIR && isInside(target, E2E_TMPDIR)) return true;
  if (sessionAllowed.has(target)) return true;
  for (const tree of sessionAllowedTrees) {
    if (isInside(target, tree)) return true;
  }
  const prefs = await prefsReader();
  for (const root of prefs.workspaceFolders ?? []) {
    if (isInside(target, root)) return true;
  }
  for (const recent of prefs.recentFiles ?? []) {
    if (resolve(recent) === target) return true;
  }
  return false;
}

/**
 * One-shot at app start: register the parent directory of every recent
 * file as a session-trusted tree. Reopening a recent doc then "just
 * works" for its sibling assets without requiring the user to add the
 * folder as a workspace.
 *
 * Idempotent — safe to call multiple times.
 */
export async function bootstrapSessionTreesFromRecents(): Promise<void> {
  const prefs = await prefsReader();
  for (const rf of prefs.recentFiles ?? []) {
    const parent = dirname(resolve(rf));
    if (parent) sessionAllowedTrees.add(parent);
  }
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
    // Test-only: tmpdir-rooted paths are accepted under DURUMI_E2E=1.
    if (E2E_TMPDIR && isInside(r, E2E_TMPDIR)) continue;
    throw new PathNotAllowedError(wf);
  }
  for (const rf of patch.recentFiles ?? []) {
    const r = resolve(rf);
    if (existingRecents.has(r)) continue;
    if (sessionAllowed.has(r)) continue;
    if (E2E_TMPDIR && isInside(r, E2E_TMPDIR)) continue;
    throw new PathNotAllowedError(rf);
  }
}
