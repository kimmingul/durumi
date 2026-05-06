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
  it('returns an empty map when the path is not inside a git work tree', async () => {
    revparse.mockResolvedValue('false\n');
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
    revparse.mockResolvedValue('true\n');
    raw.mockRejectedValue(new Error('boom'));
    const result = await getRepoStatus('/repo');
    expect(result).toEqual({});
  });

  it('parses a porcelain v1 sample into its status buckets', async () => {
    revparse.mockResolvedValue('true\n');
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
    revparse.mockResolvedValue('true\n');
    raw.mockResolvedValue('\n\n M short.md\n');
    const result = await getRepoStatus('/repo');
    expect(result).toEqual({ 'short.md': 'modified' });
  });
});
