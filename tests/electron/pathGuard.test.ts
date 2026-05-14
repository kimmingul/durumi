import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join, resolve, sep } from 'node:path';

// safeStorage isn't available under node-env vitest; preferences mocks aren't
// needed because pathGuard reads through an injectable seam (see below).
vi.mock('electron', () => ({}));

import {
  PathNotAllowedError,
  _resetPrefsReaderForTests,
  _resetSessionForTests,
  _setPrefsReaderForTests,
  allowSessionPath,
  allowSessionTree,
  assertAllowedPath,
  assertPrefsPatchAllowed,
  bootstrapSessionTreesFromRecents,
  isAllowedPath,
  type PrefsLike,
} from '../../electron/pathGuard';

function setPrefs(prefs: PrefsLike): void {
  _setPrefsReaderForTests(async () => prefs);
}

beforeEach(() => {
  _resetSessionForTests();
  setPrefs({ workspaceFolders: [], recentFiles: [] });
});

afterEach(() => {
  _resetSessionForTests();
  _resetPrefsReaderForTests();
});

describe('isAllowedPath — workspace folders', () => {
  it('allows paths inside a workspace folder', async () => {
    const root = resolve('/Users/min/Projects/durumi');
    setPrefs({ workspaceFolders: [root] });
    expect(await isAllowedPath(join(root, 'doc.md'))).toBe(true);
    expect(await isAllowedPath(join(root, 'sub', 'file.bib'))).toBe(true);
  });

  it('allows the workspace folder path itself', async () => {
    const root = resolve('/Users/min/Projects/durumi');
    setPrefs({ workspaceFolders: [root] });
    expect(await isAllowedPath(root)).toBe(true);
  });

  it('rejects paths outside any workspace', async () => {
    setPrefs({ workspaceFolders: [resolve('/Users/min/Projects/durumi')] });
    expect(await isAllowedPath('/etc/passwd')).toBe(false);
    expect(await isAllowedPath('/Users/min/Documents/other.md')).toBe(false);
  });

  it('rejects a sibling whose path starts with the same characters (no separator)', async () => {
    // /Users/min/Projects/durumi and /Users/min/Projects/durumi-clone share a
    // prefix but the second is NOT inside the first. `startsWith(root + sep)`
    // is what enforces this — a plain startsWith would let it through.
    const root = resolve('/Users/min/Projects/durumi');
    setPrefs({ workspaceFolders: [root] });
    const sibling = `${root}-clone${sep}doc.md`;
    expect(await isAllowedPath(sibling)).toBe(false);
  });

  it('collapses .. traversal before comparing', async () => {
    // A compromised renderer tries to bypass the workspace check by sending
    // `<workspace>/../etc/passwd`. After resolve() this becomes /etc/passwd
    // which isn't inside the workspace.
    const root = resolve('/Users/min/Projects/durumi');
    setPrefs({ workspaceFolders: [root] });
    expect(await isAllowedPath(`${root}/../../../../etc/passwd`)).toBe(false);
  });
});

describe('isAllowedPath — recent files', () => {
  it('allows an exact match with a recent-files entry', async () => {
    setPrefs({ recentFiles: ['/Users/min/Documents/old.md'] });
    expect(await isAllowedPath('/Users/min/Documents/old.md')).toBe(true);
  });

  it('does not allow other files in the same dir as a recent-files entry (pre-bootstrap)', async () => {
    // Recent-files trust is exact-match by default; the dir-tree expansion
    // only kicks in after `bootstrapSessionTreesFromRecents()` runs at app
    // startup. Without it, listing /Users/min/Documents/other.md because
    // old.md is recent would over-share.
    setPrefs({ recentFiles: ['/Users/min/Documents/old.md'] });
    expect(await isAllowedPath('/Users/min/Documents/other.md')).toBe(false);
  });
});

describe('isAllowedPath — session allowlist', () => {
  it('allows a path that was registered via allowSessionPath', async () => {
    allowSessionPath('/Users/min/Downloads/from-dialog.md');
    expect(await isAllowedPath('/Users/min/Downloads/from-dialog.md')).toBe(true);
  });

  it('normalises before comparing — session entries match resolved paths', async () => {
    allowSessionPath('/Users/min/Downloads/from-dialog.md');
    expect(await isAllowedPath('/Users/min/Downloads/./from-dialog.md')).toBe(true);
  });
});

describe('isAllowedPath — session-trusted directory trees', () => {
  it('allowSessionPath implicitly trusts the file\'s parent dir for descendants', async () => {
    // The image-paste flow writes to `<doc_dir>/assets/img-*.png`. Once the
    // doc is dialog-picked we want sibling assets to load through the
    // durumi-asset:// protocol without each being registered separately.
    allowSessionPath('/Users/min/Documents/manuscript.md');
    expect(await isAllowedPath('/Users/min/Documents/assets/img-1.png')).toBe(true);
    expect(await isAllowedPath('/Users/min/Documents/figs/fig.png')).toBe(true);
  });

  it('does not trust paths outside the file\'s parent', async () => {
    allowSessionPath('/Users/min/Documents/manuscript.md');
    expect(await isAllowedPath('/Users/min/Pictures/wallpaper.png')).toBe(false);
    expect(await isAllowedPath('/etc/passwd')).toBe(false);
  });

  it('allowSessionTree directly trusts a directory and its descendants', async () => {
    allowSessionTree('/Users/min/explicit-tree');
    expect(await isAllowedPath('/Users/min/explicit-tree/a.txt')).toBe(true);
    expect(await isAllowedPath('/Users/min/explicit-tree/sub/b.txt')).toBe(true);
    expect(await isAllowedPath('/Users/min/other')).toBe(false);
  });

  it('rejects prefix-sibling escapes from session trees', async () => {
    // /Users/min/foo as a session tree must NOT allow /Users/min/foo-clone.
    allowSessionTree('/Users/min/foo');
    expect(await isAllowedPath('/Users/min/foo-clone/x')).toBe(false);
  });

  it('bootstrapSessionTreesFromRecents adds recent-file dirnames', async () => {
    setPrefs({ recentFiles: ['/Users/min/Documents/old.md'] });
    await bootstrapSessionTreesFromRecents();
    // Sibling asset of a recent file now passes the guard — the user
    // re-opening a recent doc sees its assets without re-adding the
    // folder as a workspace.
    expect(await isAllowedPath('/Users/min/Documents/assets/legacy.png')).toBe(true);
    // The recent file itself still passes via exact-match too.
    expect(await isAllowedPath('/Users/min/Documents/old.md')).toBe(true);
  });
});

describe('assertAllowedPath', () => {
  it('resolves normally for an allowed path', async () => {
    allowSessionPath('/Users/min/Downloads/ok.md');
    await expect(assertAllowedPath('/Users/min/Downloads/ok.md')).resolves.toBeUndefined();
  });

  it('throws PathNotAllowedError for an outside path', async () => {
    await expect(assertAllowedPath('/etc/passwd')).rejects.toBeInstanceOf(PathNotAllowedError);
  });

  it('PathNotAllowedError carries the attempted path + a stable code', async () => {
    try {
      await assertAllowedPath('/etc/passwd');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PathNotAllowedError);
      expect((err as PathNotAllowedError).attempted).toBe('/etc/passwd');
      expect((err as PathNotAllowedError).code).toBe('path-not-allowed');
    }
  });
});

describe('assertPrefsPatchAllowed', () => {
  it('passes when patch carries no workspaceFolders or recentFiles', async () => {
    await expect(assertPrefsPatchAllowed({})).resolves.toBeUndefined();
  });

  it('allows existing workspaceFolders entries (round-trip on settings save)', async () => {
    const existing = resolve('/Users/min/Projects/durumi');
    setPrefs({ workspaceFolders: [existing] });
    await expect(
      assertPrefsPatchAllowed({ workspaceFolders: [existing] }),
    ).resolves.toBeUndefined();
  });

  it('allows a new workspaceFolders entry that the session saw via dialog', async () => {
    allowSessionPath('/Users/min/NewFolder');
    await expect(
      assertPrefsPatchAllowed({ workspaceFolders: ['/Users/min/NewFolder'] }),
    ).resolves.toBeUndefined();
  });

  it('rejects a workspaceFolders entry that did not come through a dialog', async () => {
    // The whole point: a compromised renderer cannot poison the allowlist
    // by smuggling /etc into prefs.workspaceFolders.
    await expect(
      assertPrefsPatchAllowed({ workspaceFolders: ['/etc'] }),
    ).rejects.toBeInstanceOf(PathNotAllowedError);
  });

  it('applies the same rule to recentFiles', async () => {
    await expect(
      assertPrefsPatchAllowed({ recentFiles: ['/etc/passwd'] }),
    ).rejects.toBeInstanceOf(PathNotAllowedError);
  });
});
