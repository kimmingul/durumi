import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileAtomic } from '../../electron/fs';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'durumi-atomic-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('writeFileAtomic', () => {
  it('writes a new file', async () => {
    const target = join(dir, 'doc.md');
    await writeFileAtomic(target, 'hello');
    expect(await readFile(target, 'utf8')).toBe('hello');
  });

  it('replaces an existing file', async () => {
    const target = join(dir, 'doc.md');
    await writeFile(target, 'old contents', 'utf8');
    await writeFileAtomic(target, 'new contents');
    expect(await readFile(target, 'utf8')).toBe('new contents');
  });

  it('leaves no tmp file on a successful write', async () => {
    const target = join(dir, 'doc.md');
    await writeFileAtomic(target, 'hello');
    const entries = await readdir(dir);
    expect(entries).toEqual(['doc.md']);
  });

  it('creates parent directories that do not exist yet', async () => {
    const target = join(dir, 'nested', 'deep', 'doc.md');
    await writeFileAtomic(target, 'hi');
    expect(await readFile(target, 'utf8')).toBe('hi');
  });

  it('does not corrupt the target if the rename target is a directory', async () => {
    // A directory at the target path makes `rename` fail on most platforms.
    // The original file (here, a placeholder we created beforehand) must
    // survive: atomic write means "all or nothing", never a half-written
    // state.
    const target = join(dir, 'doc.md');
    await writeFile(target, 'original', 'utf8');
    // Replace the file at `target` with a directory of the same name —
    // forces `rename(tmp, target)` to fail.
    await rm(target);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(target);
    await expect(writeFileAtomic(target, 'replacement')).rejects.toThrow();
    // The tmp file must have been cleaned up.
    const entries = await readdir(dir);
    expect(entries.filter((e) => e.startsWith('doc.md.tmp-'))).toEqual([]);
  });

  it('concurrent writes to the same path both finish without corrupting the target', async () => {
    const target = join(dir, 'doc.md');
    await Promise.all([
      writeFileAtomic(target, 'A'.repeat(1000)),
      writeFileAtomic(target, 'B'.repeat(1000)),
    ]);
    const final = await readFile(target, 'utf8');
    expect(final.length).toBe(1000);
    // Last-writer-wins: the surviving file must be one of the inputs in full,
    // never a mix.
    expect(final === 'A'.repeat(1000) || final === 'B'.repeat(1000)).toBe(true);
    // No tmp leftovers.
    const entries = await readdir(dir);
    expect(entries).toEqual(['doc.md']);
  });
});
