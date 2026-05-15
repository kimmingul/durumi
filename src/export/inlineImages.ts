/**
 * v0.2.10 — optional HTML export image inlining.
 *
 * The default HTML export keeps `<img src="...">` URLs as-is so the file
 * stays small and the user can ship it next to its `assets/` folder.
 * That breaks single-file sharing — attaching just the `.html` to an
 * email yields broken images. With `exportInlineImages` on, every local
 * image is fetched, base64-encoded, and rewritten as a `data:` URI so
 * the resulting HTML is fully self-contained.
 *
 * Scope (what we DO inline):
 *   - `durumi-asset://x/?p=<abs>` URLs from the editor's image widget.
 *   - Relative paths resolved against the document directory (the same
 *     resolution the editor performs at decoration build time).
 *   - Bare absolute paths (`/abs/file.png`).
 *
 * Scope (what we DO NOT touch):
 *   - `http(s):` URLs — left as remote references (the user can opt
 *     into an offline copy by saving them locally first).
 *   - Already-inlined `data:` URIs — pass through unchanged.
 *   - Unknown extensions / unreadable files — skipped with a warning
 *     so a single broken `<img>` doesn't fail the entire export.
 */

import { resolveImageSrc } from '../utils/resolveImageSrc';

const DATA_URI_PREFIX = /^data:/i;
const REMOTE_PREFIX = /^(?:https?:|ftp:|mailto:)/i;

/**
 * Defensive per-image cap. A single image above this size is skipped
 * (with a warning) rather than base64-encoded — the encode step roughly
 * triples bytes in renderer memory, so a 100MB asset would briefly hold
 * ~300MB of binary string + ~130MB base64 string. The feature is
 * default-OFF, but the cap closes the foot-gun cleanly.
 */
const MAX_INLINE_IMAGE_BYTES = 25 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
};

function mimeFromUrl(url: string): string | null {
  const noFragment = url.split('#')[0]!;
  const noQuery = noFragment.split('?')[0]!;
  const dot = noQuery.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = noQuery.slice(dot + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? null;
}

function uint8ToBase64(bytes: Uint8Array): string {
  // btoa is happy with binary strings (one char per byte). Build the binary
  // string in chunks so a multi-MB image doesn't blow the apply() arg-limit.
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Test seam — lets unit tests inject a deterministic fetcher instead of
 * relying on the ambient global fetch (which can't reach `durumi-asset://`
 * outside a real Electron renderer).
 */
export type ImageFetcher = (
  url: string,
) => Promise<{ ok: true; bytes: Uint8Array; mime: string } | { ok: false }>;

const defaultFetcher: ImageFetcher = async (url) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false };
    const buf = await res.arrayBuffer();
    const mime =
      res.headers.get('content-type') || mimeFromUrl(url) || 'application/octet-stream';
    return { ok: true, bytes: new Uint8Array(buf), mime };
  } catch {
    return { ok: false };
  }
};

export interface InlineImagesOptions {
  /** Document path used to resolve relative image references. */
  docPath: string | null;
  /** Override the default fetcher (used by tests). */
  fetcher?: ImageFetcher;
  /** Sink for skip warnings. Defaults to console.warn. */
  warn?: (msg: string) => void;
}

const IMG_TAG_RE = /<img\b([^>]*)>/gi;
const SRC_ATTR_RE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

/**
 * Scan an HTML string, fetch every local image, and rewrite its `src`
 * attribute to a `data:` URI. Remote URLs and already-inlined data URIs
 * pass through unchanged. Failed fetches are skipped (warned) rather
 * than aborting the whole export.
 */
export async function inlineImagesInHtml(
  html: string,
  options: InlineImagesOptions,
): Promise<string> {
  const fetcher = options.fetcher ?? defaultFetcher;
  const warn = options.warn ?? ((m: string) => console.warn(`[exportInlineImages] ${m}`));
  const matches: Array<{ start: number; end: number; tag: string; src: string }> = [];
  IMG_TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMG_TAG_RE.exec(html)) !== null) {
    const attrs = m[1] ?? '';
    const srcMatch = SRC_ATTR_RE.exec(attrs);
    if (!srcMatch) continue;
    const src = srcMatch[1] ?? srcMatch[2] ?? '';
    if (!src) continue;
    matches.push({ start: m.index, end: m.index + m[0].length, tag: m[0], src });
  }
  if (matches.length === 0) return html;

  const replacements = await Promise.all(
    matches.map(async ({ src }) => {
      if (DATA_URI_PREFIX.test(src) || REMOTE_PREFIX.test(src)) return null;
      const resolved = resolveImageSrc(src, options.docPath);
      // resolveImageSrc returns the original string when it can't resolve
      // (relative path with no docPath). Don't try to fetch that.
      if (resolved === src && !/^(?:durumi-asset:|file:|\/)/i.test(src)) {
        warn(`skip ${src}: no doc path to resolve relative URL`);
        return null;
      }
      const result = await fetcher(resolved);
      if (!result.ok) {
        warn(`skip ${src}: fetch failed`);
        return null;
      }
      if (result.bytes.length > MAX_INLINE_IMAGE_BYTES) {
        warn(
          `skip ${src}: ${result.bytes.length} bytes exceeds ${MAX_INLINE_IMAGE_BYTES} byte cap`,
        );
        return null;
      }
      const mime = result.mime || mimeFromUrl(src) || 'application/octet-stream';
      return `data:${mime};base64,${uint8ToBase64(result.bytes)}`;
    }),
  );

  // Splice each rewritten <img> back into the HTML in reverse order so
  // earlier offsets stay valid.
  let out = html;
  for (let i = matches.length - 1; i >= 0; i--) {
    const dataUri = replacements[i];
    if (!dataUri) continue;
    const { start, end, tag, src } = matches[i]!;
    const replaced = tag.replace(src, dataUri);
    out = out.slice(0, start) + replaced + out.slice(end);
  }
  return out;
}
