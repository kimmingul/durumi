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
 *   - `corsEnabled: true` — see below; without it every renderer
 *     `fetch()` to this scheme fails.
 *   - `stream: true` — allows large media without buffering the whole
 *     file in memory.
 *
 * `corsEnabled`가 필요한 이유 (기본값 false):
 *
 * 렌더러는 `file://` 출처(`win.loadFile(...)`)이고 이 스킴은 `standard: true`
 * 라서 자기 자신이 별도 출처다. 즉 렌더러에서 `durumi-asset://`로 나가는
 * 요청은 항상 교차 출처다. `<img src="durumi-asset://...">`는 교차 출처
 * 표시가 허용되므로 그냥 뜨지만, `fetch()`는 스킴이 CORS 대상으로 등록돼
 * 있지 않으면 Chromium이 요청 자체를 막고 `TypeError: Failed to fetch`를
 * 던진다. 이 비대칭 때문에 이미지 위젯은 멀쩡히 동작하는데 fetch만 죽어서,
 * v0.2.10 HTML 이미지 인라인 기능이 조용히 무력화돼 있었다 —
 * `src/export/inlineImages.ts`의 기본 fetcher가 그 TypeError를
 * `{ ok: false }`로 삼켜서 내보낸 HTML에 `<img src="...">`가 그대로 남았다.
 *
 * 응답 헤더 문제가 아니다. 실측으로 확인했다: `Access-Control-Allow-Origin: *`
 * 를 붙여도 `corsEnabled` 없이는 여전히 실패하고, 반대로 헤더 없이
 * `corsEnabled: true`만 켜면 200 + `response.type === 'basic'`으로 통과한다.
 * 그래서 헤더는 넣지 않는다 — 동작에 기여하지 않는 와일드카드 헤더를
 * 굳이 남길 이유가 없다.
 *
 * 신뢰 경계는 넓어지지 않는다. 어떤 경로를 읽을 수 있는지는 아래 핸들러의
 * `isAllowedPath` 게이트가 정하고, 렌더러는 이미 `file:openPath` IPC로
 * 동일한 게이트를 통과한 파일 내용을 받아올 수 있다. `corsEnabled`는 이미
 * 열려 있는 집합을 fetch로도 읽게 할 뿐, 게이트 자체는 그대로다.
 */
export function registerAssetProtocolSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        // 렌더러 fetch()의 전제. 지우면 이미지 인라인 내보내기가 조용히
        // 죽는다 — tests/electron/assetProtocol.test.ts가 이 값을 고정한다.
        corsEnabled: true,
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
