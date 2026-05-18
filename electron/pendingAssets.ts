import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { app } from 'electron';
import { extFromMime } from './images';
import { allowSessionTree } from './pathGuard';

/**
 * v0.2.23 — pending-asset directory for image inserts/pastes/drops that
 * happen BEFORE a document has been saved. Without an on-disk anchor, the
 * `<doc_dir>/assets/` location used by saved docs is unavailable, but
 * users still expect the image to render immediately. We bridge that gap
 * by writing the bytes into a per-session directory under
 * `<userData>/pending-assets/<session-id>/` and embedding an absolute path
 * in the markdown. The renderer's existing `resolveImageSrc` already
 * routes absolute paths through `durumi-asset://`, so display is
 * automatic — we only need to keep the session dir on the path-guard's
 * trusted-tree list (via `allowSessionTree`).
 *
 * On the first save (or any subsequent save while pending images remain),
 * `migratePendingInContent` moves each pending file into the doc's
 * `assets/` directory and rewrites the markdown link to the clean
 * relative form.
 */

const PENDING_ROOT_NAME = 'pending-assets';

function pendingRootDir(): string {
  return resolve(app.getPath('userData'), PENDING_ROOT_NAME);
}

let sessionDirCache: string | null = null;
let initPromise: Promise<string> | null = null;

async function ensureSessionDir(): Promise<string> {
  if (sessionDirCache) return sessionDirCache;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const sessionId = `s-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const dir = resolve(pendingRootDir(), sessionId);
    await mkdir(dir, { recursive: true });
    allowSessionTree(dir);
    sessionDirCache = dir;
    return dir;
  })();
  return initPromise;
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export async function savePendingImage(
  bytes: Uint8Array,
  mime: string,
): Promise<{ absPath: string }> {
  const dir = await ensureSessionDir();
  const ext = extFromMime(mime);
  const filename = `img-${timestamp()}-${randomBytes(3).toString('hex')}.${ext}`;
  const absPath = join(dir, filename);
  await writeFile(absPath, bytes);
  return { absPath };
}

/** Returns true iff `absPath` lives under the pending-assets root. */
export function isPendingPath(absPath: string): boolean {
  if (!absPath) return false;
  const root = resolve(pendingRootDir());
  const target = resolve(absPath);
  if (target === root) return false;
  return target.startsWith(root + '/') || target.startsWith(root + '\\');
}

/**
 * Best-effort sweep on app start. Removes every subdirectory of
 * `pending-assets/` so leftover files from crashed sessions don't grow
 * unboundedly. The current session dir is created lazily after this
 * call, so it cannot match anything here.
 */
export async function sweepStalePendingDirs(): Promise<void> {
  const root = pendingRootDir();
  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      await rm(join(root, e.name), { recursive: true, force: true }).catch(() => {
        /* a single broken dir shouldn't block the rest of the sweep */
      });
    }
  } catch {
    /* root doesn't exist yet — nothing to sweep */
  }
}

/**
 * Move one pending image into `<docDir>/assets/`. Returns the relative
 * form for the markdown rewrite. EXDEV (cross-device rename) falls back
 * to copy+unlink so a userData volume distinct from the doc's volume
 * still works.
 */
async function migrateOnePending(
  pendingAbsPath: string,
  docDir: string,
): Promise<{ ok: true; relPath: string } | { ok: false; error: string }> {
  if (!isPendingPath(pendingAbsPath)) {
    return { ok: false, error: 'not-a-pending-path' };
  }
  const assetsDir = join(docDir, 'assets');
  await mkdir(assetsDir, { recursive: true });
  const filename = pendingAbsPath.split(/[\\/]/).pop()!;
  const target = join(assetsDir, filename);
  try {
    await rename(pendingAbsPath, target);
  } catch {
    try {
      const data = await readFile(pendingAbsPath);
      await writeFile(target, data);
      await unlink(pendingAbsPath).catch(() => {
        /* best-effort */
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
  return { ok: true, relPath: `assets/${filename}` };
}

/**
 * Decode a markdown-link path. Best-effort percent-decode; malformed
 * input falls through unchanged rather than throwing.
 */
function decodeLinkPath(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('<') && s.endsWith('>')) s = s.slice(1, -1);
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

/**
 * Scan markdown for image links whose target is under the pending root,
 * migrate each into `<docDir>/assets/`, and rewrite the markdown to
 * point at the new relative path. Best-effort: a failure on one image
 * leaves that link untouched (reported in `failed`) but doesn't abort.
 */
export async function migratePendingInContent(
  content: string,
  docDir: string,
): Promise<{ content: string; changed: boolean; moved: number; failed: number }> {
  let changed = false;
  let moved = 0;
  let failed = 0;
  const re = /!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g;
  const matches: Array<{ match: RegExpExecArray; abs: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const decoded = decodeLinkPath(m[2]!);
    if (isPendingPath(decoded)) matches.push({ match: m, abs: decoded });
  }
  if (matches.length === 0) return { content, changed: false, moved: 0, failed: 0 };
  let out = content;
  for (let i = matches.length - 1; i >= 0; i--) {
    const { match, abs } = matches[i]!;
    const r = await migrateOnePending(abs, docDir);
    if (!r.ok) {
      failed++;
      continue;
    }
    const alt = match[1] ?? '';
    const title = match[3] ?? '';
    const replacement = `![${alt}](${r.relPath}${title})`;
    out = out.slice(0, match.index) + replacement + out.slice(match.index + match[0].length);
    moved++;
    changed = true;
  }
  return { content: out, changed, moved, failed };
}

/** Test-only: reset module-level session state so each test starts fresh. */
export function _resetPendingForTests(): void {
  sessionDirCache = null;
  initPromise = null;
}
