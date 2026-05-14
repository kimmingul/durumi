import { promises as fs } from 'node:fs';
import { extname, join } from 'node:path';
import { app, protocol } from 'electron';
import { ASSET_SCHEME } from '@shared/assetProtocol';
import { isAllowedPath } from './pathGuard';

/**
 * Custom protocol that serves local assets (images, PDFs, etc.) to the
 * renderer through a path-guarded handler in main.
 *
 * Why a custom scheme:
 *   - The editor's image widget receives a Markdown `![](src)` where `src`
 *     is typically `assets/img-…png` — a path *relative to the document*.
 *     Setting `<img src="assets/…">` lets the browser resolve it against
 *     the renderer URL (`file:///…/out/renderer/`), which is the wrong
 *     directory. The image silently fails to load.
 *   - Embedding the resolved absolute path as a `file:///…` URL works in
 *     production but is brittle: dev (http://localhost) blocks
 *     cross-protocol fetches, and `sandbox: true` further restricts what
 *     a renderer can read off the local filesystem.
 *   - A custom scheme handled in main lets us serve assets in BOTH dev
 *     and production through the same URL shape, while a server-side
 *     path guard rejects anything outside the trust scope.
 *
 * URL shape:
 *   `durumi-asset://x/?p=<encoded-absolute-path>`
 *
 * The absolute path lives in the query string, NOT the pathname.
 * Chromium's standard-scheme URL parser normalizes percent-encoded
 * slashes inside the pathname (`%2F` → `/`), which would corrupt an
 * absolute filesystem path encoded there. Query-string encoding
 * survives the parser round-trip unchanged. The `x` host segment is
 * a placeholder that satisfies the parser's authority requirement.
 */

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.pdf': 'application/pdf',
};

/**
 * Must be called BEFORE `app.whenReady()` resolves. Registers the scheme
 * with the privileges the renderer needs for `<img>` and `fetch()`:
 *
 *   - `standard: true` — applies same-origin policy + standard URL
 *     parsing.
 *   - `secure: true` — treated as a secure origin so the renderer
 *     doesn't downgrade or block mixed-content in dev.
 *   - `supportFetchAPI: true` — lets fetch() / `<img>` request this
 *     scheme.
 *   - `stream: true` — allows large media without buffering the whole
 *     file in memory.
 */
export function registerAssetProtocolSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
}

/**
 * Append a diagnostic line to `<userData>/asset-protocol.log` for
 * **non-success** responses. The renderer's `<img onerror>` surfaces
 * the load failure, but not the main-side cause (403 vs 404 vs read
 * error). Catting this file shows the per-request outcome when an
 * image silently fails to load.
 *
 * Success (200) requests are NOT logged — the file would grow
 * unboundedly in normal use. Best-effort; logging failures swallowed.
 */
async function logAssetError(line: string): Promise<void> {
  try {
    const userData = app.getPath('userData');
    await fs.appendFile(join(userData, 'asset-protocol.log'), `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* logging is best-effort */
  }
}

/**
 * Must be called AFTER `app.whenReady()`. Hooks the actual request
 * handler. The handler:
 *
 *   1. Reads the absolute path from the URL's `?p=…` query parameter.
 *   2. Checks the path against the same allowlist used by the IPC
 *      guard (workspace folders + recent files + dialog-returned paths
 *      this session). A renderer that constructs
 *      `durumi-asset://x/?p=%2Fetc%2Fpasswd` is rejected with 403.
 *   3. Reads the file and replies with a guessed MIME type.
 */
export function registerAssetProtocolHandler(): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    let absPath: string;
    try {
      const url = new URL(request.url);
      // `searchParams.get` returns the already-percent-decoded value.
      const p = url.searchParams.get('p');
      if (!p) {
        await logAssetError(`400 bad-request url=${request.url}`);
        return new Response('bad request: missing p', { status: 400 });
      }
      absPath = p;
    } catch (err) {
      await logAssetError(`400 url-parse-error url=${request.url} err=${(err as Error).message}`);
      return new Response('bad request', { status: 400 });
    }
    if (!(await isAllowedPath(absPath))) {
      await logAssetError(`403 path-not-allowed absPath=${absPath}`);
      return new Response('forbidden', { status: 403 });
    }
    try {
      const data = await fs.readFile(absPath);
      const mime = MIME_BY_EXT[extname(absPath).toLowerCase()] ?? 'application/octet-stream';
      return new Response(data, { headers: { 'Content-Type': mime } });
    } catch (err) {
      await logAssetError(`404 read-failed absPath=${absPath} err=${(err as Error).message}`);
      return new Response('not found', { status: 404 });
    }
  });
}
