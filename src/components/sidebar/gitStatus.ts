import type { DirEntry } from '@shared/ipc-contract';

export type StatusBucket =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'ignored';

const BUCKETS: ReadonlyArray<StatusBucket> = [
  'modified',
  'added',
  'deleted',
  'renamed',
  'untracked',
  'ignored',
];

/**
 * Returns the path of `entry` relative to `rootPath` using forward slashes
 * (matching `git status --porcelain` output). Returns `null` if `entry` is
 * not under `rootPath`.
 */
export function relativeFromRoot(rootPath: string, entryPath: string): string | null {
  if (entryPath === rootPath) return '';
  // Both `<root>/` and `<root>\` (Windows) need to match.
  for (const sep of ['/', '\\']) {
    const prefix = rootPath + sep;
    if (entryPath.startsWith(prefix)) {
      return entryPath.slice(prefix.length).replace(/\\/g, '/');
    }
  }
  return null;
}

/**
 * For a file: direct lookup of `relPath` in `statuses`.
 * For a directory: walk the file tree (rootEntries + childCache) and pick the
 * highest-priority bucket from any descendant. Walks ONLY through the cached
 * tree — un-expanded folders are inspected via path-prefix matching against
 * the keys of `statuses` so we still report status for collapsed branches
 * (where children haven't been loaded yet).
 */
export function bucketForEntry(
  entry: DirEntry,
  rootPath: string,
  statuses: Record<string, string> | undefined,
  childCache: Map<string, DirEntry[]>,
): StatusBucket | null {
  if (!statuses) return null;
  const rel = relativeFromRoot(rootPath, entry.path);
  if (rel === null) return null;
  if (!entry.isDir) {
    const v = statuses[rel];
    return isBucket(v) ? v : null;
  }
  // Directory: aggregate.
  // Strategy 1: iterate statuses keys, pick those under `rel/`.
  // Strategy 2: walk tree via childCache for visited subtrees (no status lookup
  //   needed beyond the keys check, but supports an early bail-out on
  //   highest-priority hit).
  // We use strategy 1 because it covers collapsed folders.
  const prefix = rel === '' ? '' : rel + '/';
  let best: StatusBucket | null = null;
  let bestPriority = BUCKETS.length;
  for (const key of Object.keys(statuses)) {
    if (prefix === '' ? true : key === rel || key.startsWith(prefix)) {
      const v = statuses[key];
      if (!isBucket(v)) continue;
      const p = BUCKETS.indexOf(v);
      if (p >= 0 && p < bestPriority) {
        best = v;
        bestPriority = p;
        if (bestPriority === 0) break;
      }
    }
  }
  // Avoid unused-parameter complaints; childCache is reserved for future
  // optimisations that walk only loaded subtrees.
  void childCache;
  return best;
}

function isBucket(v: unknown): v is StatusBucket {
  return typeof v === 'string' && (BUCKETS as ReadonlyArray<string>).includes(v);
}
