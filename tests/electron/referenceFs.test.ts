import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defaultDownloadPath,
  ensureReferenceDir,
  REFERENCE_DIR_NAME,
  referenceDir,
  referenceStatus,
  resolveFileField,
  sanitizeFilename,
  scanReferenceDir,
} from '../../electron/referenceFs';

let dir: string;
let bibPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'durumi-refs-'));
  bibPath = join(dir, 'references.bib');
  await writeFile(bibPath, '');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('referenceDir / defaultDownloadPath', () => {
  it('locates the reference dir as a sibling of references.bib', () => {
    expect(referenceDir(bibPath)).toBe(join(dir, REFERENCE_DIR_NAME));
  });

  it('builds the canonical download path with key.ext', () => {
    const r = defaultDownloadPath(bibPath, 'smith2024deep', 'pdf');
    expect(r.absPath).toBe(join(dir, REFERENCE_DIR_NAME, 'smith2024deep.pdf'));
    expect(r.relPath).toBe('reference/smith2024deep.pdf');
  });

  it('sanitises path-hostile characters in the key', () => {
    const r = defaultDownloadPath(bibPath, 'a/b\\c?d', 'md');
    expect(r.absPath).toContain('a_b_c_d.md');
    expect(r.relPath).toBe('reference/a_b_c_d.md');
  });
});

describe('sanitizeFilename', () => {
  it('replaces /, \\, ?, %, *, :, |, ", <, >', () => {
    expect(sanitizeFilename('a/b\\c?d%e*f:g|h"i<j>k')).toBe('a_b_c_d_e_f_g_h_i_j_k');
  });

  it('leaves safe characters alone', () => {
    expect(sanitizeFilename('smith2024-deep_v2.bib')).toBe('smith2024-deep_v2.bib');
  });
});

describe('referenceStatus', () => {
  it('returns exists=false when nothing is on disk', async () => {
    const r = await referenceStatus(bibPath, 'smith2024');
    expect(r.exists).toBe(false);
    expect(r.absPath).toBeNull();
  });

  it('finds <key>.pdf in the canonical location', async () => {
    await mkdir(join(dir, REFERENCE_DIR_NAME), { recursive: true });
    await writeFile(join(dir, REFERENCE_DIR_NAME, 'smith2024.pdf'), 'PDF');
    const r = await referenceStatus(bibPath, 'smith2024');
    expect(r.exists).toBe(true);
    expect(r.type).toBe('pdf');
    expect(r.relPath).toBe('reference/smith2024.pdf');
  });

  it('finds <key>.md when no PDF exists', async () => {
    await mkdir(join(dir, REFERENCE_DIR_NAME), { recursive: true });
    await writeFile(join(dir, REFERENCE_DIR_NAME, 'smith2024.md'), '# x');
    const r = await referenceStatus(bibPath, 'smith2024');
    expect(r.type).toBe('md');
  });

  it('respects an explicit `file` field over the canonical name', async () => {
    await mkdir(join(dir, REFERENCE_DIR_NAME), { recursive: true });
    await writeFile(join(dir, REFERENCE_DIR_NAME, 'paper-from-email.pdf'), 'PDF');
    const r = await referenceStatus(
      bibPath,
      'smith2024',
      'reference/paper-from-email.pdf',
    );
    expect(r.exists).toBe(true);
    expect(r.relPath).toBe('reference/paper-from-email.pdf');
  });

  it('falls back to the canonical name when file field points at a missing file', async () => {
    await mkdir(join(dir, REFERENCE_DIR_NAME), { recursive: true });
    await writeFile(join(dir, REFERENCE_DIR_NAME, 'smith2024.pdf'), 'PDF');
    const r = await referenceStatus(bibPath, 'smith2024', 'reference/missing.pdf');
    expect(r.exists).toBe(true);
    expect(r.relPath).toBe('reference/smith2024.pdf');
  });
});

describe('resolveFileField', () => {
  it('joins relative paths against the bib directory', () => {
    expect(resolveFileField(bibPath, 'reference/x.pdf')).toBe(
      join(dir, 'reference/x.pdf'),
    );
  });

  it('returns absolute paths verbatim', () => {
    const abs = '/abs/path/x.pdf';
    expect(resolveFileField(bibPath, abs)).toBe(abs);
  });

  it('strips Zotero "path:application/pdf" suffix', () => {
    expect(resolveFileField(bibPath, ':files/x.pdf:application/pdf')).toContain('files/x.pdf');
  });
});

describe('scanReferenceDir', () => {
  it('returns an empty array when the dir does not exist', async () => {
    const r = await scanReferenceDir(bibPath);
    expect(r).toEqual([]);
  });

  it('lists every file in reference/ with type detection', async () => {
    await ensureReferenceDir(bibPath);
    await writeFile(join(dir, REFERENCE_DIR_NAME, 'a.pdf'), 'PDF');
    await writeFile(join(dir, REFERENCE_DIR_NAME, 'b.md'), '# x');
    await writeFile(join(dir, REFERENCE_DIR_NAME, 'c.txt'), 'plain');
    const r = await scanReferenceDir(bibPath);
    expect(r).toHaveLength(3);
    expect(r.find((f) => f.fileName === 'a.pdf')?.type).toBe('pdf');
    expect(r.find((f) => f.fileName === 'b.md')?.type).toBe('md');
    expect(r.find((f) => f.fileName === 'c.txt')?.type).toBeNull();
  });

  it('skips dotfiles', async () => {
    await ensureReferenceDir(bibPath);
    await writeFile(join(dir, REFERENCE_DIR_NAME, '.DS_Store'), 'ds');
    await writeFile(join(dir, REFERENCE_DIR_NAME, 'visible.pdf'), 'PDF');
    const r = await scanReferenceDir(bibPath);
    expect(r.map((f) => f.fileName)).toEqual(['visible.pdf']);
  });
});
