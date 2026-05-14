import { BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import { type MemoSidecar, parseSidecar } from '@shared/memoSidecar';
import { writeFileAtomic } from '../fs';

/**
 * Allowlist for `shell:openExternal`. Renderer code is untrusted by default;
 * we only let it open the small set of URLs the install dialog needs. URLs
 * must parse, must be `https:`, and the hostname must be in the allowlist.
 */
const SHELL_OPEN_HOST_ALLOWLIST: ReadonlyArray<string> = [
  'pandoc.org',
  'www.pandoc.org',
  'github.com',
];

export function isExternalUrlAllowed(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return SHELL_OPEN_HOST_ALLOWLIST.includes(parsed.hostname);
}

/**
 * Pick the longest workspace root that is a prefix of `savedPath`.
 * Treats both `<root>` and `<root>/` as a match (so paths equal to the root
 * itself also match). Returns `null` if no root contains the path.
 */
export function findOwningRoot(savedPath: string, roots: readonly string[]): string | null {
  let best: string | null = null;
  for (const root of roots) {
    if (savedPath === root || savedPath.startsWith(root + '/') || savedPath.startsWith(root + '\\')) {
      if (!best || root.length > best.length) best = root;
    }
  }
  return best;
}

export function broadcastGitStatusInvalidated(root: string): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('git:status:invalidated', root);
  }
}

/** Path of the sidecar JSON living next to a markdown document. */
export function memoSidecarPathFor(docPath: string): string {
  return `${docPath}.comments.json`;
}

/**
 * Read the sidecar that sits next to `docPath`. Returns null when the file
 * does not exist or is malformed — callers fall back to an empty sidecar.
 */
export async function readMemoSidecar(docPath: string): Promise<MemoSidecar | null> {
  const sidecarPath = memoSidecarPathFor(docPath);
  try {
    const raw = await fs.readFile(sidecarPath, 'utf8');
    return parseSidecar(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

export async function writeMemoSidecar(
  docPath: string,
  sidecar: MemoSidecar,
): Promise<void> {
  await writeFileAtomic(memoSidecarPathFor(docPath), JSON.stringify(sidecar, null, 2));
}
