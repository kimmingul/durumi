import { assetUrlFor } from '@shared/assetProtocol';
import { dirnameOf, joinPath } from './path';

/**
 * Resolves a Markdown image `src` to a URL the renderer can actually
 * load. The widget uses this at decoration-build time.
 *
 *   - Remote / data / already-resolved URLs (`http://`, `https://`,
 *     `data:`, `file://`, `durumi-asset://`) pass through untouched.
 *   - Absolute filesystem paths (`/abs/path` POSIX, `C:\path` or `\\srv`
 *     Windows) get wrapped in `durumi-asset:///`.
 *   - Relative paths need a `docPath` for resolution; with one we join
 *     against `dirname(docPath)` and wrap in `durumi-asset:///`. Without
 *     one (new unsaved buffer), we return the original string — the
 *     `<img>` will fail to load, which is the correct UX: the user
 *     needs to save the file before pasted assets can be addressed.
 *
 * The custom protocol handler in main is what actually reads the file;
 * see `electron/assetProtocol.ts`. It applies the same path-guard
 * allowlist as the IPC layer, so a renderer that smuggles
 * `durumi-asset:///%2Fetc%2Fpasswd` is rejected with 403.
 */
export function resolveImageSrc(src: string, docPath: string | null): string {
  if (!src) return src;
  if (isUrlLike(src)) return src;
  if (isAbsolutePath(src)) return assetUrlFor(src);
  if (!docPath) return src;
  const abs = joinPath(dirnameOf(docPath), src);
  return assetUrlFor(abs);
}

const URL_PROTOCOLS = ['http:', 'https:', 'data:', 'file:', 'blob:', 'durumi-asset:'];

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
