import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
};

export function extFromMime(mime: string): string {
  return MIME_EXT[mime.toLowerCase()] ?? 'png';
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function rand(): string {
  return Math.random().toString(36).slice(2, 8);
}

export type SaveImageResult =
  | { relPath: string }
  | { error: 'no-file' };

export async function saveImage(
  buffer: Uint8Array,
  mimeType: string,
  contextFilePath: string | null,
): Promise<SaveImageResult> {
  if (!contextFilePath) return { error: 'no-file' };
  const dir = dirname(contextFilePath);
  const assetsDir = join(dir, 'assets');
  await mkdir(assetsDir, { recursive: true });
  const ext = extFromMime(mimeType);
  const filename = `img-${timestamp()}-${rand()}.${ext}`;
  const fullPath = join(assetsDir, filename);
  await writeFile(fullPath, buffer);
  // Forward slash for markdown link, even on Windows.
  return { relPath: `assets/${filename}` };
}
