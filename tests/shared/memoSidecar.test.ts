import { describe, it, expect } from 'vitest';
import {
  addReply,
  emptySidecar,
  ensureMeta,
  memoIdFor,
  migrateMemoMeta,
  parseSidecar,
  pruneOrphans,
  removeReply,
  setResolved,
  type MemoSidecar,
  type ThreadEntry,
} from '../../shared/memoSidecar';

const NOW = new Date('2026-05-09T12:00:00.000Z');
const AUTHOR = 'Min Gul Kim';

function reply(id: string, text = 'hello'): ThreadEntry {
  return { id, author: 'AI', text, createdAt: '2026-05-09T12:01:00.000Z' };
}

describe('memoIdFor', () => {
  it('is stable for the same body+tag', () => {
    const a = memoIdFor({ text: 'check stats', tag: 'ai' });
    const b = memoIdFor({ text: 'check stats', tag: 'ai' });
    expect(a).toBe(b);
    expect(a).toHaveLength(12);
  });

  it('differs when body differs', () => {
    const a = memoIdFor({ text: 'check stats', tag: 'ai' });
    const b = memoIdFor({ text: 'check fig 2', tag: 'ai' });
    expect(a).not.toBe(b);
  });

  it('differs when tag differs', () => {
    const a = memoIdFor({ text: 'todo', tag: 'todo' });
    const b = memoIdFor({ text: 'todo', tag: 'reviewer' });
    expect(a).not.toBe(b);
  });

  it('treats null tag as a stable separate identity', () => {
    const a = memoIdFor({ text: 'note', tag: null });
    const b = memoIdFor({ text: 'note', tag: null });
    expect(a).toBe(b);
    expect(a).not.toBe(memoIdFor({ text: 'note', tag: 'ai' }));
  });
});

describe('ensureMeta', () => {
  it('creates a fresh entry on first call', () => {
    const s0 = emptySidecar();
    const s1 = ensureMeta(s0, 'abc', AUTHOR, NOW);
    expect(s1.memos.abc).toBeDefined();
    expect(s1.memos.abc!.createdBy).toBe(AUTHOR);
    expect(s1.memos.abc!.resolved).toBe(false);
    expect(s1.memos.abc!.thread).toEqual([]);
    expect(s1).not.toBe(s0);
  });

  it('is idempotent — second call returns the SAME sidecar reference', () => {
    const s1 = ensureMeta(emptySidecar(), 'abc', AUTHOR, NOW);
    const s2 = ensureMeta(s1, 'abc', AUTHOR, NOW);
    expect(s2).toBe(s1);
  });
});

describe('migrateMemoMeta', () => {
  it('moves the entry from oldId to newId, preserving thread + author', () => {
    const s0 = ensureMeta(emptySidecar(), 'old', AUTHOR, NOW);
    const s1 = addReply(s0, 'old', reply('r1', 'thanks'), NOW);
    const s2 = setResolved(s1, 'old', true, NOW);
    const s3 = migrateMemoMeta(s2, 'old', 'new');
    expect(s3.memos.old).toBeUndefined();
    expect(s3.memos.new).toBeDefined();
    expect(s3.memos.new!.thread).toHaveLength(1);
    expect(s3.memos.new!.thread[0]?.text).toBe('thanks');
    expect(s3.memos.new!.resolved).toBe(true);
    expect(s3.memos.new!.createdBy).toBe(AUTHOR);
  });

  it('clears orphanedAt on migration', () => {
    const s0 = ensureMeta(emptySidecar(), 'old', AUTHOR, NOW);
    // Mark orphaned by pruning against an empty set.
    const s1 = pruneOrphans(s0, new Set(), NOW);
    expect(s1.memos.old!.orphanedAt).toBeDefined();
    const s2 = migrateMemoMeta(s1, 'old', 'new');
    expect(s2.memos.new!.orphanedAt).toBeUndefined();
  });

  it('is a no-op when oldId === newId', () => {
    const s0 = ensureMeta(emptySidecar(), 'abc', AUTHOR, NOW);
    expect(migrateMemoMeta(s0, 'abc', 'abc')).toBe(s0);
  });

  it('is a no-op when oldId is missing', () => {
    const s0 = ensureMeta(emptySidecar(), 'abc', AUTHOR, NOW);
    expect(migrateMemoMeta(s0, 'missing', 'newId')).toBe(s0);
  });

  it('does not overwrite an existing newId entry', () => {
    let s = ensureMeta(emptySidecar(), 'old', AUTHOR, NOW);
    s = ensureMeta(s, 'new', 'someoneElse', NOW);
    s = addReply(s, 'new', reply('r-keep'), NOW);
    const after = migrateMemoMeta(s, 'old', 'new');
    expect(after).toBe(s);
    expect(after.memos.new!.thread[0]?.id).toBe('r-keep');
  });
});

describe('pruneOrphans', () => {
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  it('keeps entries whose ids are present', () => {
    const s0 = ensureMeta(emptySidecar(), 'a', AUTHOR, NOW);
    const s1 = pruneOrphans(s0, new Set(['a']), NOW);
    expect(s1.memos.a).toBeDefined();
    expect(s1.memos.a!.orphanedAt).toBeUndefined();
  });

  it('marks orphans with orphanedAt on first prune', () => {
    const s0 = ensureMeta(emptySidecar(), 'a', AUTHOR, NOW);
    const s1 = pruneOrphans(s0, new Set(), NOW);
    expect(s1.memos.a!.orphanedAt).toBe(NOW.toISOString());
  });

  it('keeps orphans within the 7-day grace window', () => {
    const s0 = ensureMeta(emptySidecar(), 'a', AUTHOR, NOW);
    const s1 = pruneOrphans(s0, new Set(), NOW);
    const within = new Date(NOW.getTime() + SEVEN_DAYS - 1000);
    const s2 = pruneOrphans(s1, new Set(), within);
    expect(s2.memos.a).toBeDefined();
  });

  it('drops orphans past the 7-day window', () => {
    const s0 = ensureMeta(emptySidecar(), 'a', AUTHOR, NOW);
    const s1 = pruneOrphans(s0, new Set(), NOW);
    const past = new Date(NOW.getTime() + SEVEN_DAYS + 1000);
    const s2 = pruneOrphans(s1, new Set(), past);
    expect(s2.memos.a).toBeUndefined();
  });

  it('clears orphanedAt when the source memo comes back', () => {
    const s0 = ensureMeta(emptySidecar(), 'a', AUTHOR, NOW);
    const s1 = pruneOrphans(s0, new Set(), NOW);
    expect(s1.memos.a!.orphanedAt).toBeDefined();
    const s2 = pruneOrphans(s1, new Set(['a']), NOW);
    expect(s2.memos.a!.orphanedAt).toBeUndefined();
  });

  it('returns the same reference when nothing changed', () => {
    const s0 = ensureMeta(emptySidecar(), 'a', AUTHOR, NOW);
    const s1 = pruneOrphans(s0, new Set(['a']), NOW);
    expect(s1).toBe(s0);
  });
});

describe('addReply / removeReply', () => {
  it('adds replies in chronological order (append)', () => {
    let s = ensureMeta(emptySidecar(), 'a', AUTHOR, NOW);
    s = addReply(s, 'a', reply('r1', 'first'), NOW);
    s = addReply(s, 'a', reply('r2', 'second'), NOW);
    expect(s.memos.a!.thread.map((r) => r.text)).toEqual(['first', 'second']);
  });

  it('lazy-creates the entry on addReply', () => {
    const s = addReply(emptySidecar(), 'a', reply('r1'), NOW);
    expect(s.memos.a).toBeDefined();
    expect(s.memos.a!.thread).toHaveLength(1);
  });

  it('removes a reply by id', () => {
    let s = ensureMeta(emptySidecar(), 'a', AUTHOR, NOW);
    s = addReply(s, 'a', reply('r1'), NOW);
    s = addReply(s, 'a', reply('r2'), NOW);
    s = removeReply(s, 'a', 'r1');
    expect(s.memos.a!.thread.map((r) => r.id)).toEqual(['r2']);
  });

  it('removeReply is a no-op when the memo or reply is missing', () => {
    const s0 = ensureMeta(emptySidecar(), 'a', AUTHOR, NOW);
    expect(removeReply(s0, 'a', 'never')).toBe(s0);
    expect(removeReply(s0, 'missing', 'r1')).toBe(s0);
  });
});

describe('setResolved', () => {
  it('toggles resolved state', () => {
    const s0 = ensureMeta(emptySidecar(), 'a', AUTHOR, NOW);
    const s1 = setResolved(s0, 'a', true, NOW);
    expect(s1.memos.a!.resolved).toBe(true);
    const s2 = setResolved(s1, 'a', false, NOW);
    expect(s2.memos.a!.resolved).toBe(false);
  });

  it('is a no-op when state is unchanged', () => {
    const s0 = ensureMeta(emptySidecar(), 'a', AUTHOR, NOW);
    const s1 = setResolved(s0, 'a', false, NOW);
    expect(s1).toBe(s0);
  });

  it('lazy-creates the entry when called on a missing id', () => {
    const s = setResolved(emptySidecar(), 'a', true, NOW);
    expect(s.memos.a).toBeDefined();
    expect(s.memos.a!.resolved).toBe(true);
  });
});

describe('parseSidecar', () => {
  it('round-trips a valid sidecar', () => {
    let s: MemoSidecar = ensureMeta(emptySidecar(), 'a', AUTHOR, NOW);
    s = addReply(s, 'a', reply('r1'), NOW);
    s = setResolved(s, 'a', true, NOW);
    const parsed = parseSidecar(JSON.stringify(s));
    expect(parsed).toEqual(s);
  });

  it('returns null on malformed JSON', () => {
    expect(parseSidecar('}{')).toBeNull();
  });

  it('returns null on wrong version', () => {
    expect(parseSidecar(JSON.stringify({ version: 2, memos: {} }))).toBeNull();
  });

  it('drops malformed memo entries while keeping valid ones', () => {
    const raw = JSON.stringify({
      version: 1,
      memos: {
        good: {
          createdAt: NOW.toISOString(),
          createdBy: AUTHOR,
          resolved: false,
          thread: [],
        },
        bad: { hello: 'world' },
      },
    });
    const parsed = parseSidecar(raw);
    expect(parsed?.memos.good).toBeDefined();
    expect(parsed?.memos.bad).toBeUndefined();
  });
});
