import { simpleGit } from 'simple-git';

export type StatusBucket =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'ignored';

/**
 * Returns a map of repo-relative paths to their status bucket for the given
 * workspace root.
 *
 * Behaviour contract:
 * - If `rootPath` is not inside a git work tree (e.g. plain folder, `git`
 *   binary missing, permission denied), returns an empty map. Never throws.
 * - Paths in the result are exactly as `git status --porcelain=v1` reports
 *   them, relative to the repo root. Renames are reduced to the new path
 *   (the part after `->`).
 */
export async function getRepoStatus(
  rootPath: string,
): Promise<Record<string, StatusBucket>> {
  const out: Record<string, StatusBucket> = {};
  const git = simpleGit(rootPath);

  let inside = false;
  try {
    const r = await git.revparse(['--is-inside-work-tree']);
    inside = r.trim() === 'true';
  } catch {
    return out;
  }
  if (!inside) return out;

  let raw = '';
  try {
    raw = await git.raw(['status', '--porcelain=v1', '--ignored']);
  } catch {
    return out;
  }

  for (const line of raw.split('\n')) {
    if (!line) continue;
    // Porcelain v1 lines are: `XY <path>` or `XY <old> -> <new>` (rename).
    if (line.length < 3) continue;
    const x = line[0];
    const y = line[1];
    const rest = line.slice(3);
    const path = rest.split(' -> ').pop()!;
    const bucket = mapStatus(x, y);
    if (bucket) out[path] = bucket;
  }
  return out;
}

export function mapStatus(x?: string, y?: string): StatusBucket | null {
  if (x === '?' && y === '?') return 'untracked';
  if (x === '!' && y === '!') return 'ignored';
  if (x === 'R' || y === 'R') return 'renamed';
  if (x === 'M' || y === 'M') return 'modified';
  if (x === 'A' || y === 'A') return 'added';
  if (x === 'D' || y === 'D') return 'deleted';
  return null;
}
