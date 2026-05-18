import { assetUrlFor } from '@shared/assetProtocol';
import { dirnameOf, joinPath } from './path';

/**
 * Resolves a Markdown image `src` to a URL the renderer can actually
 * load. The widget uses this at decoration-build time.
 *
 *   - Remote / data / already-resolved URLs (`http://`, `https://`,
 *     `data:`, `blob:`, `durumi-asset://`) pass through untouched.
 *   - Raw `file://` URLs are **NOT** trusted — they bypass the
 *     path-guarded `durumi-asset://` protocol. We strip the scheme
 *     and route the absolute path back through `assetUrlFor` so the
 *     main-side handler (with its allowlist) is the only thing that
 *     ever reads the bytes off disk.
 *   - Absolute filesystem paths (`/abs/path` POSIX, `C:\path` or `\\srv`
 *     Windows) get wrapped in `durumi-asset://x/?p=…`.
 *   - Relative paths need a `docPath` for resolution; with one we join
 *     against `dirname(docPath)` and wrap in `durumi-asset://x/?p=…`.
 *     Without one (new unsaved buffer), we return the original string —
 *     the `<img>` will fail to load, which is the correct UX: the user
 *     needs to save the file before pasted assets can be addressed.
 *
 * The custom protocol handler in main is what actually reads the file;
 * see `electron/assetProtocol.ts`. It applies the same path-guard
 * allowlist as the IPC layer, so a renderer that smuggles
 * `durumi-asset://x/?p=%2Fetc%2Fpasswd` is rejected with 403.
 */
export function resolveImageSrc(src: string, docPath: string | null): string {
  if (!src) return src;
  if (isFileUrl(src)) return assetUrlFor(fileUrlToAbsPath(src));
  if (isUrlLike(src)) return src;
  if (isAbsolutePath(src)) return assetUrlFor(decodePercent(src));
  if (!docPath) return src;
  const abs = joinPath(dirnameOf(docPath), decodePercent(src));
  return assetUrlFor(abs);
}

/**
 * Decode `%20` and friends in a markdown-link path. We percent-encode the
 * absolute path of pending assets at insert time so the markdown parser
 * accepts paths under `Library/Application Support/…` (CommonMark refuses
 * unwrapped spaces in URLs). assetUrlFor will re-encode for the
 * durumi-asset:// query string, so the path the main-side handler sees
 * is the real filesystem path.
 *
 * `decodeURI` throws on malformed sequences — wrap and fall through
 * unchanged rather than letting the widget pass error out.
 */
function decodePercent(src: string): string {
  if (!src.includes('%')) return src;
  try {
    return decodeURI(src);
  } catch {
    return src;
  }
}

// `file:` is intentionally NOT in this allowlist. Markdown `file://`
// references are funnelled through `assetUrlFor` so the main-side path
// guard remains the only authority on disk reads. See `isFileUrl`.
const URL_PROTOCOLS = ['http:', 'https:', 'data:', 'blob:', 'durumi-asset:'];

function isFileUrl(src: string): boolean {
  return /^file:/i.test(src);
}

/**
 * Strips the `file://` prefix and percent-decodes the remainder so the
 * result is a real filesystem path. Handles the three shapes a markdown
 * author may have produced:
 *   - `file:///abs/path/x.png`        → `/abs/path/x.png` (POSIX)
 *   - `file://host/share/x.png`       → `//host/share/x.png` (UNC-ish)
 *   - `file:C:/Users/x.png`           → `C:/Users/x.png` (Windows legacy)
 */
function fileUrlToAbsPath(src: string): string {
  // Drop the scheme, keep everything after the colon.
  let rest = src.replace(/^file:/i, '');
  // Strip the leading authority slashes: `///abs` → `/abs`, `//host/x` →
  // `//host/x` (preserve UNC), bare `file:C:/…` (no slashes) → `C:/…`.
  if (rest.startsWith('///')) rest = rest.slice(2);
  // Percent-decode so `%20` lands as a literal space etc. Wrap in a
  // try/catch because malformed sequences would otherwise throw and
  // crash the widget render pass.
  try {
    rest = decodeURI(rest);
  } catch {
    /* keep undecoded fallback rather than throwing */
  }
  return rest;
}

function isUrlLike(src: string): boolean {
  // Accept any explicit scheme (`scheme:`) we recognise; reject paths that
  // happen to contain a colon for other reasons (drive letters on Windows
  // are handled separately by `isAbsolutePath`).
  const colon = src.indexOf(':');
  if (colon < 2) return false;
  const head = src.slice(0, colon + 1).toLowerCase();
  return URL_PROTOCOLS.includes(head);
}

function isAbsolutePath(src: string): boolean {
  if (src.startsWith('/')) return true; // POSIX
  if (src.startsWith('\\\\')) return true; // Windows UNC
  // Windows drive letter (C:\..., D:/...)
  if (src.length >= 3 && /^[A-Za-z]:[\\/]/.test(src)) return true;
  return false;
}
