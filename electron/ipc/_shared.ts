import { BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import { type MemoSidecar, parseSidecar } from '@shared/memoSidecar';
import { writeFileAtomic } from '../fs';

/**
 * Allowlist for `shell:openExternal`. Renderer code is untrusted by default,
 * so we gate every URL handed to `shell.openExternal` here.
 *
 * Pre-v0.2.19 this allowlist was restricted to a tiny set of hostnames
 * (pandoc.org / github.com) because the only caller was the install dialog
 * and the DOI hover tooltip. v0.2.19 adds in-editor link clicks for
 * `[text](url)` constructs, so the allowlist now accepts:
 *
 *   - `http:` / `https:` — any host. This is the markdown link contract;
 *     the user already typed the URL into their own document, so we treat
 *     it the same way a browser would.
 *   - `mailto:` — anything parseable. Letting users click `mailto:` links
 *     hands the message off to the OS mail client; same trust model.
 *
 * Explicitly REJECTED protocols (these are the dangerous ones a compromised
 * renderer could try to abuse):
 *   - `javascript:` — executes script in whatever process opens it.
 *   - `file:` — could escape the document tree (and `shell.openExternal`
 *     would happily launch the system handler for the file).
 *   - `data:` — embedded payloads.
 *   - `vbscript:` — IE-era script protocol still respected by some shells.
 *
 * If a NEW protocol needs adding in future, add it to the allowlist below
 * AFTER auditing whether `shell.openExternal` can be tricked into doing
 * something it shouldn't with that scheme.
 */
const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:', 'mailto:']);

export function isExternalUrlAllowed(rawUrl: string): boolean {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return false;
  // Quick reject for the dangerous schemes BEFORE handing to `new URL`,
  // since some malformed inputs can still parse but the protocol check below
  // will catch them. The redundancy is intentional defence-in-depth.
  const lowered = rawUrl.trim().toLowerCase();
  if (
    lowered.startsWith('javascript:') ||
    lowered.startsWith('vbscript:') ||
    lowered.startsWith('data:') ||
    lowered.startsWith('file:')
  ) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  return ALLOWED_PROTOCOLS.has(parsed.protocol);
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
