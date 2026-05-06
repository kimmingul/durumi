import { describe, it, expect, vi, beforeEach } from 'vitest';

// One revparse / raw fn pair shared across the test file. Each test resets them
// to whatever behaviour it needs.
const revparse = vi.fn();
const raw = vi.fn();

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({ revparse, raw })),
}));

import { getRepoStatus, mapStatus } from '../../electron/git';

beforeEach(() => {
  revparse.mockReset();
  raw.mockReset();
});

describe('mapStatus (porcelain XY -> bucket)', () => {
  it('maps "??" to untracked', () => {
    expect(mapStatus('?', '?')).toBe('untracked');
  });
  it('maps "!!" to ignored', () => {
    expect(mapStatus('!', '!')).toBe('ignored');
  });
  it('maps "M " / " M" / "MM" to modified', () => {
    expect(mapStatus('M', ' ')).toBe('modified');
    expect(mapStatus(' ', 'M')).toBe('modified');
    expect(mapStatus('M', 'M')).toBe('modified');
  });
  it('maps "A " to added', () => {
    expect(mapStatus('A', ' ')).toBe('added');
  });
  it('maps "D " / " D" to deleted', () => {
    expect(mapStatus('D', ' ')).toBe('deleted');
    expect(mapStatus(' ', 'D')).toBe('deleted');
  });
  it('maps "R " to renamed', () => {
    expect(mapStatus('R', ' ')).toBe('renamed');
  });
  it('returns null for unknown status', () => {
    expect(mapStatus(' ', ' ')).toBeNull();
  });
});

describe('getRepoStatus', () => {
  // Helper: program revparse to answer the two calls getRepoStatus makes.
  function mockRevparse(opts: { inside?: string; toplevel?: string } = {}) {
    const inside = opts.inside ?? 'true\n';
    const toplevel = opts.toplevel ?? '/repo\n';
    revparse.mockImplementation(async (args: string[]) => {
      if (args.includes('--is-inside-work-tree')) return inside;
      if (args.includes('--show-toplevel')) return toplevel;
      throw new Error(`unexpected revparse args: ${args.join(' ')}`);
    });
  }

  it('returns an empty map when the path is not inside a git work tree', async () => {
    mockRevparse({ inside: 'false\n' });
    const result = await getRepoStatus('/some/plain/folder');
    expect(result).toEqual({});
    expect(raw).not.toHaveBeenCalled();
  });

  it('returns an empty map when revparse throws (e.g. git missing)', async () => {
    revparse.mockRejectedValue(new Error('spawn git ENOENT'));
    const result = await getRepoStatus('/no/git');
    expect(result).toEqual({});
    expect(raw).not.toHaveBeenCalled();
  });

  it('returns an empty map when status raw call throws', async () => {
    mockRevparse();
    raw.mockRejectedValue(new Error('boom'));
    const result = await getRepoStatus('/repo');
    expect(result).toEqual({});
  });

  it('parses a porcelain v1 sample into its status buckets', async () => {
    mockRevparse();
    raw.mockResolvedValue(
      [
        '?? new-file.md',
        ' M readme.md',
        'M  staged.md',
        'A  fresh.md',
        ' D removed.md',
        '!! ignored.log',
        'R  old.md -> new.md',
        '',
      ].join('\n'),
    );
    const result = await getRepoStatus('/repo');
    expect(result).toEqual({
      'new-file.md': 'untracked',
      'readme.md': 'modified',
      'staged.md': 'modified',
      'fresh.md': 'added',
      'removed.md': 'deleted',
      'ignored.log': 'ignored',
      'new.md': 'renamed',
    });
  });

  it('skips short / blank lines without throwing', async () => {
    mockRevparse();
    raw.mockResolvedValue('\n\n M short.md\n');
    const result = await getRepoStatus('/repo');
    expect(result).toEqual({ 'short.md': 'modified' });
  });

  it('rebases repo-relative paths to be relative to a subfolder workspace root', async () => {
    // Workspace root is /repo/docs but porcelain reports paths relative to /repo.
    mockRevparse({ toplevel: '/repo\n' });
    raw.mockResolvedValue(
      [
        ' M docs/a.md',
        '?? docs/sub/new.md',
        ' M src/outside.ts',
        '',
      ].join('\n'),
    );
    const result = await getRepoStatus('/repo/docs');
    expect(result).toEqual({
      'a.md': 'modified',
      'sub/new.md': 'untracked',
    });
  });

  it('returns an empty map when --show-toplevel fails', async () => {
    revparse.mockImplementation(async (args: string[]) => {
      if (args.includes('--is-inside-work-tree')) return 'true\n';
      throw new Error('toplevel exploded');
    });
    const result = await getRepoStatus('/repo');
    expect(result).toEqual({});
    expect(raw).not.toHaveBeenCalled();
  });
});
