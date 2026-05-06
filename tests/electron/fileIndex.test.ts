import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { indexWorkspace } from '../../electron/fileIndex';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'durumi-fileidx-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('indexWorkspace', () => {
  it('lists text files across nested folders', async () => {
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'a.md'), 'x');
    await writeFile(join(dir, 'sub', 'b.md'), 'x');
    await writeFile(join(dir, 'sub', 'c.txt'), 'x');
    const r = await indexWorkspace([dir]);
    const rels = r.map((e) => e.relPath).sort();
    expect(rels).toEqual(['a.md', 'sub/b.md', 'sub/c.txt']);
  });

  it('skips excluded directories and binary extensions', async () => {
    await mkdir(join(dir, 'node_modules'));
    await writeFile(join(dir, 'node_modules', 'x.md'), 'x');
    await writeFile(join(dir, 'kept.md'), 'x');
    await writeFile(join(dir, 'image.png'), 'x');
    const r = await indexWorkspace([dir]);
    expect(r.map((e) => e.relPath)).toEqual(['kept.md']);
  });

  it('handles multiple roots', async () => {
    const second = await mkdtemp(join(tmpdir(), 'durumi-fileidx2-'));
    try {
      await writeFile(join(dir, 'a.md'), 'x');
      await writeFile(join(second, 'b.md'), 'x');
      const r = await indexWorkspace([dir, second]);
      expect(r.length).toBe(2);
    } finally {
      await rm(second, { recursive: true, force: true });
    }
  });
});
