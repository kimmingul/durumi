import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findBibliographyFor } from '../../electron/bibliography';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'durumi-bib-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('findBibliographyFor', () => {
  it('returns null when no bib file exists in any candidate dir', async () => {
    await writeFile(join(dir, 'doc.md'), '# x');
    const r = await findBibliographyFor(join(dir, 'doc.md'), [dir]);
    expect(r).toBeNull();
  });

  it('finds references.bib in the same directory as the source file', async () => {
    await writeFile(join(dir, 'doc.md'), '# x');
    await writeFile(join(dir, 'references.bib'), '@article{x, title={t}}');
    const r = await findBibliographyFor(join(dir, 'doc.md'), [dir]);
    expect(r?.path).toBe(join(dir, 'references.bib'));
    expect(r?.source).toContain('@article');
  });

  it('walks up to a parent directory inside the workspace root', async () => {
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'sub', 'doc.md'), '# x');
    await writeFile(join(dir, 'references.bib'), '@article{a}');
    const r = await findBibliographyFor(join(dir, 'sub', 'doc.md'), [dir]);
    expect(r?.path).toBe(join(dir, 'references.bib'));
  });

  it('does not climb above the workspace root', async () => {
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'sub', 'doc.md'), '# x');
    // Bib file ABOVE the workspace boundary
    await writeFile(join(dir, 'references.bib'), '@article{above}');
    // Workspace root pinned to sub/
    const r = await findBibliographyFor(join(dir, 'sub', 'doc.md'), [join(dir, 'sub')]);
    expect(r).toBeNull();
  });

  it('falls back to scanning workspace roots when no file is open', async () => {
    await writeFile(join(dir, 'references.bib'), '@article{root}');
    const r = await findBibliographyFor(null, [dir]);
    expect(r?.path).toBe(join(dir, 'references.bib'));
  });

  it('also recognises bibliography.bib as an alternate name', async () => {
    await writeFile(join(dir, 'doc.md'), '# x');
    await writeFile(join(dir, 'bibliography.bib'), '@article{alt}');
    const r = await findBibliographyFor(join(dir, 'doc.md'), [dir]);
    expect(r?.path).toBe(join(dir, 'bibliography.bib'));
  });
});
