import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const trashItemMock = vi.hoisted(() => vi.fn());
const showItemInFolderMock = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  default: { shell: { trashItem: trashItemMock, showItemInFolder: showItemInFolderMock } },
  shell: { trashItem: trashItemMock, showItemInFolder: showItemInFolderMock },
}));

import {
  createFile,
  createFolder,
  duplicate,
  moveToTrash,
  rename,
  revealInFolder,
} from '../../electron/fileOps';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'durumi-fileops-'));
  trashItemMock.mockReset();
  showItemInFolderMock.mockReset();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('createFile', () => {
  it('creates an empty file at the given path', async () => {
    const target = join(dir, 'new.md');
    const r = await createFile(target);
    expect(r.ok).toBe(true);
    const txt = await readFile(target, 'utf8');
    expect(txt).toBe('');
  });
  it('refuses to overwrite an existing file', async () => {
    const target = join(dir, 'kept.md');
    await writeFile(target, 'preserved');
    const r = await createFile(target);
    expect(r.ok).toBe(false);
    const txt = await readFile(target, 'utf8');
    expect(txt).toBe('preserved');
  });
});

describe('createFolder', () => {
  it('creates a new folder', async () => {
    const r = await createFolder(join(dir, 'sub'));
    expect(r.ok).toBe(true);
    await access(join(dir, 'sub'));
  });
  it('reports an error when the folder exists', async () => {
    await mkdir(join(dir, 'dup'));
    const r = await createFolder(join(dir, 'dup'));
    expect(r.ok).toBe(false);
  });
});

describe('rename', () => {
  it('renames an existing file', async () => {
    await writeFile(join(dir, 'a.md'), 'x');
    const r = await rename(join(dir, 'a.md'), join(dir, 'b.md'));
    expect(r.ok).toBe(true);
    await access(join(dir, 'b.md'));
  });
  it('refuses to overwrite an existing target', async () => {
    await writeFile(join(dir, 'a.md'), 'x');
    await writeFile(join(dir, 'b.md'), 'keep');
    const r = await rename(join(dir, 'a.md'), join(dir, 'b.md'));
    expect(r.ok).toBe(false);
    expect(await readFile(join(dir, 'b.md'), 'utf8')).toBe('keep');
  });
});

describe('duplicate', () => {
  it('creates an alongside copy with a -copy suffix', async () => {
    await writeFile(join(dir, 'note.md'), 'content');
    const r = await duplicate(join(dir, 'note.md'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.path).toBe(join(dir, 'note-copy.md'));
  });
  it('appends a numeric suffix on collision', async () => {
    await writeFile(join(dir, 'note.md'), 'a');
    await writeFile(join(dir, 'note-copy.md'), 'b');
    const r = await duplicate(join(dir, 'note.md'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.path).toBe(join(dir, 'note-copy-2.md'));
  });
});

describe('moveToTrash', () => {
  it('delegates to electron.shell.trashItem', async () => {
    trashItemMock.mockResolvedValue(undefined);
    const r = await moveToTrash('/some/path');
    expect(r.ok).toBe(true);
    expect(trashItemMock).toHaveBeenCalledWith('/some/path');
  });
  it('reports an error when shell trashing fails', async () => {
    trashItemMock.mockRejectedValue(new Error('boom'));
    const r = await moveToTrash('/x');
    expect(r.ok).toBe(false);
  });
});

describe('revealInFolder', () => {
  it('delegates to electron.shell.showItemInFolder', async () => {
    showItemInFolderMock.mockReturnValue(undefined);
    const r = await revealInFolder('/x');
    expect(r.ok).toBe(true);
    expect(showItemInFolderMock).toHaveBeenCalledWith('/x');
  });
});
