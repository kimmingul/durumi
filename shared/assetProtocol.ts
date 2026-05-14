/**
 * URL scheme + helper for serving local assets to the renderer through
 * a path-guarded handler in main. Both sides need to agree on the
 * scheme name — keeping it here means a single source of truth.
 *
 * See `electron/assetProtocol.ts` for the handler that resolves these
 * URLs, and `src/utils/resolveImageSrc.ts` for the renderer-side caller
 * that builds them.
 */

export const ASSET_SCHEME = 'durumi-asset' as const;

/**
 * Build a `durumi-asset://x/?p=<encoded-abs-path>` URL from an absolute
 * filesystem path. Used by the editor's image widget (and any future
 * media widget) to ask main to read a workspace-local file.
 *
 * The path lives in the URL query string — NOT the path component —
 * because Chromium's standard-scheme URL parser normalizes percent-
 * encoded slashes inside the pathname (`%2F` → `/`), which corrupts an
 * absolute filesystem path encoded there. Query-parameter encoding
 * survives the parser round-trip unchanged. The hostname `x` is a
 * placeholder that satisfies the parser's authority requirement for a
 * standard scheme.
 */
export function assetUrlFor(absPath: string): string {
  return `${ASSET_SCHEME}://x/?p=${encodeURIComponent(absPath)}`;
}
