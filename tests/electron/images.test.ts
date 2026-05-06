import { describe, it, expect, vi, beforeEach } from 'vitest';

const writes = new Map<string, Uint8Array>();
const dirs = new Set<string>();

vi.mock('node:fs/promises', () => {
  const writeFile = vi.fn(async (p: string, b: Uint8Array) => {
    writes.set(p, b);
  });
  const mkdir = vi.fn(async (d: string) => {
    dirs.add(d);
  });
  return {
    default: { writeFile, mkdir },
    writeFile,
    mkdir,
    promises: { writeFile, mkdir },
  };
});

beforeEach(() => {
  writes.clear();
  dirs.clear();
});

describe('saveImage', () => {
  it('returns error when no context path', async () => {
    const { saveImage } = await import('../../electron/images');
    expect(await saveImage(new Uint8Array([1]), 'image/png', null)).toEqual({
      error: 'no-file',
    });
  });

  it('writes png next to file in assets/', async () => {
    const { saveImage } = await import('../../electron/images');
    const r = (await saveImage(
      new Uint8Array([1]),
      'image/png',
      '/foo/bar.md',
    )) as { relPath: string };
    expect(r.relPath.startsWith('assets/img-')).toBe(true);
    expect(r.relPath.endsWith('.png')).toBe(true);
    expect([...writes.keys()][0]?.startsWith('/foo/assets/img-')).toBe(true);
    expect(dirs.has('/foo/assets')).toBe(true);
  });

  it('uses .jpg for image/jpeg', async () => {
    const { saveImage } = await import('../../electron/images');
    const r = (await saveImage(
      new Uint8Array([1]),
      'image/jpeg',
      '/foo/bar.md',
    )) as { relPath: string };
    expect(r.relPath.endsWith('.jpg')).toBe(true);
  });

  it('uses .webp for image/webp', async () => {
    const { saveImage } = await import('../../electron/images');
    const r = (await saveImage(
      new Uint8Array([1]),
      'image/webp',
      '/foo/bar.md',
    )) as { relPath: string };
    expect(r.relPath.endsWith('.webp')).toBe(true);
  });

  it('falls back to .png for unknown mime', async () => {
    const { saveImage } = await import('../../electron/images');
    const r = (await saveImage(
      new Uint8Array([1]),
      'application/octet-stream',
      '/foo/bar.md',
    )) as { relPath: string };
    expect(r.relPath.endsWith('.png')).toBe(true);
  });

  it('two consecutive saves get unique names', async () => {
    const { saveImage } = await import('../../electron/images');
    const a = (await saveImage(
      new Uint8Array([1]),
      'image/png',
      '/foo/bar.md',
    )) as { relPath: string };
    const b = (await saveImage(
      new Uint8Array([2]),
      'image/png',
      '/foo/bar.md',
    )) as { relPath: string };
    expect(a.relPath).not.toBe(b.relPath);
  });

  it('extFromMime falls back to png for unknown', async () => {
    const { extFromMime } = await import('../../electron/images');
    expect(extFromMime('totally/unknown')).toBe('png');
    expect(extFromMime('image/PNG')).toBe('png');
    expect(extFromMime('image/svg+xml')).toBe('svg');
  });
});
