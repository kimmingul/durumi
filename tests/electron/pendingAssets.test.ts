import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * pendingAssets uses `app.getPath('userData')` for the root of its
 * pending-asset session dirs. We mock the Electron `app` module to point
 * at a per-test tmpdir so each test gets an isolated filesystem state.
 */
let userDataDir: string;

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
}));

beforeEach(async () => {
  userDataDir = await mkdtemp(join(tmpdir(), 'durumi-pending-test-'));
  // Reset the module-level session cache so each test starts fresh.
  const mod = await import('../../electron/pendingAssets');
  mod._resetPendingForTests();
});

afterEach(async () => {
  await rm(userDataDir, { recursive: true, force: true });
});

describe('savePendingImage', () => {
  it('writes bytes into <userData>/pending-assets/<session>/img-*.<ext>', async () => {
    const { savePendingImage } = await import('../../electron/pendingAssets');
    const r = await savePendingImage(new Uint8Array([1, 2, 3]), 'image/png');
    expect(r.absPath.startsWith(join(userDataDir, 'pending-assets'))).toBe(true);
    expect(r.absPath.endsWith('.png')).toBe(true);
    const bytes = await readFile(r.absPath);
    expect(bytes[0]).toBe(1);
    expect(bytes[1]).toBe(2);
    expect(bytes[2]).toBe(3);
  });

  it('two saves land in the same session dir with distinct names', async () => {
    const { savePendingImage } = await import('../../electron/pendingAssets');
    const a = await savePendingImage(new Uint8Array([1]), 'image/png');
    const b = await savePendingImage(new Uint8Array([2]), 'image/jpeg');
    expect(a.absPath).not.toBe(b.absPath);
    // Same session dir.
    expect(a.absPath.slice(0, a.absPath.lastIndexOf('/'))).toBe(
      b.absPath.slice(0, b.absPath.lastIndexOf('/')),
    );
    // Mime-driven extension.
    expect(b.absPath.endsWith('.jpg')).toBe(true);
  });
});

describe('isPendingPath', () => {
  it('matches paths under the pending-assets root', async () => {
    const { isPendingPath, savePendingImage } = await import('../../electron/pendingAssets');
    const r = await savePendingImage(new Uint8Array([1]), 'image/png');
    expect(isPendingPath(r.absPath)).toBe(true);
  });

  it('rejects paths outside the pending root', async () => {
    const { isPendingPath } = await import('../../electron/pendingAssets');
    expect(isPendingPath('/etc/passwd')).toBe(false);
    expect(isPendingPath(join(userDataDir, 'preferences.json'))).toBe(false);
  });

  it('rejects empty / missing paths', async () => {
    const { isPendingPath } = await import('../../electron/pendingAssets');
    expect(isPendingPath('')).toBe(false);
  });
});

describe('migratePendingInContent', () => {
  it('moves the file into <docDir>/assets/ and rewrites the link', async () => {
    const { savePendingImage, migratePendingInContent, isPendingPath } = await import(
      '../../electron/pendingAssets'
    );
    const pending = await savePendingImage(new Uint8Array([42]), 'image/png');
    expect(isPendingPath(pending.absPath)).toBe(true);

    const docDir = await mkdtemp(join(tmpdir(), 'durumi-doc-'));
    const content = `# Title\n\n![](${pending.absPath})\n\nbody`;
    const r = await migratePendingInContent(content, docDir);

    expect(r.changed).toBe(true);
    expect(r.moved).toBe(1);
    expect(r.failed).toBe(0);
    // Filename preserved, link rewritten to relative form.
    const filename = pending.absPath.slice(pending.absPath.lastIndexOf('/') + 1);
    expect(r.content).toContain(`![](assets/${filename})`);
    expect(r.content).not.toContain(pending.absPath);
    // File now lives in <docDir>/assets/, not in the pending dir.
    const movedBytes = await readFile(join(docDir, 'assets', filename));
    expect(movedBytes[0]).toBe(42);
    await rm(docDir, { recursive: true, force: true });
  });

  it('leaves non-pending image links untouched', async () => {
    const { migratePendingInContent } = await import('../../electron/pendingAssets');
    const docDir = await mkdtemp(join(tmpdir(), 'durumi-doc-'));
    const content = `![alt](assets/already-saved.png)\n![](https://example.com/x.png)\n`;
    const r = await migratePendingInContent(content, docDir);
    expect(r.changed).toBe(false);
    expect(r.moved).toBe(0);
    expect(r.content).toBe(content);
    await rm(docDir, { recursive: true, force: true });
  });

  it('handles multiple pending refs in one doc', async () => {
    const { savePendingImage, migratePendingInContent } = await import(
      '../../electron/pendingAssets'
    );
    const a = await savePendingImage(new Uint8Array([1]), 'image/png');
    const b = await savePendingImage(new Uint8Array([2]), 'image/jpeg');
    const docDir = await mkdtemp(join(tmpdir(), 'durumi-doc-'));
    const content = `before\n![](${a.absPath})\nmiddle\n![](${b.absPath})\nafter`;
    const r = await migratePendingInContent(content, docDir);
    expect(r.moved).toBe(2);
    expect(r.content).toContain('assets/');
    expect(r.content).not.toContain(a.absPath);
    expect(r.content).not.toContain(b.absPath);
    const entries = await readdir(join(docDir, 'assets'));
    expect(entries.length).toBe(2);
    await rm(docDir, { recursive: true, force: true });
  });

  it('preserves alt text and title on the rewritten link', async () => {
    const { savePendingImage, migratePendingInContent } = await import(
      '../../electron/pendingAssets'
    );
    const pending = await savePendingImage(new Uint8Array([1]), 'image/png');
    const docDir = await mkdtemp(join(tmpdir(), 'durumi-doc-'));
    const content = `![figure 1](${pending.absPath} "caption")`;
    const r = await migratePendingInContent(content, docDir);
    expect(r.content).toMatch(/^!\[figure 1\]\(assets\/img-[^)]+ "caption"\)$/);
    await rm(docDir, { recursive: true, force: true });
  });

  it('reports failed=1 and leaves the link untouched when the pending file is missing', async () => {
    const { migratePendingInContent } = await import('../../electron/pendingAssets');
    const docDir = await mkdtemp(join(tmpdir(), 'durumi-doc-'));
    // Construct a path that LOOKS like a pending one but doesn't exist.
    const bogus = join(userDataDir, 'pending-assets', 's-fake', 'img-missing.png');
    const content = `![](${bogus})`;
    const r = await migratePendingInContent(content, docDir);
    expect(r.failed).toBe(1);
    expect(r.moved).toBe(0);
    expect(r.changed).toBe(false);
    expect(r.content).toBe(content);
    await rm(docDir, { recursive: true, force: true });
  });
});

describe('sweepStalePendingDirs', () => {
  it('removes leftover session dirs from prior runs', async () => {
    const { sweepStalePendingDirs } = await import('../../electron/pendingAssets');
    // Create a stale session dir manually.
    const stale = join(userDataDir, 'pending-assets', 's-old');
    await writeFile(join(userDataDir, 'pending-assets-placeholder'), 'x').catch(() => {});
    const { mkdir } = await import('node:fs/promises');
    await mkdir(stale, { recursive: true });
    await writeFile(join(stale, 'img-leftover.png'), new Uint8Array([9]));

    await sweepStalePendingDirs();
    const entries = await readdir(join(userDataDir, 'pending-assets')).catch(() => []);
    expect(entries.find((e) => e === 's-old')).toBeUndefined();
  });

  it('is a no-op when the pending root does not exist yet', async () => {
    const { sweepStalePendingDirs } = await import('../../electron/pendingAssets');
    await expect(sweepStalePendingDirs()).resolves.toBeUndefined();
  });
});
