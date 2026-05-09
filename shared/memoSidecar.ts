/**
 * Sidecar metadata for `%% memo %%` annotations (v0.1.4 — Track A).
 *
 * The source-document `%% body %%` syntax stays the anchor — body text in the
 * markdown IS the memo's primary text. This module owns everything that does
 * NOT live in the source: thread replies, author, timestamp, resolved-state.
 *
 * Persistence: one JSON sidecar per document, alongside it as
 * `<docPath>.comments.json`. Untitled docs keep the metadata in memory only.
 *
 * Memo identity is derived from a stable, NON-cryptographic hash of body+tag
 * (`memoIdFor`). It only needs to be stable across reloads of the same memo
 * — not secure. We pick `cyrb53` (a small, well-tested 53-bit hash) to avoid
 * pulling in a crypto dep and to stay deterministic across Node + browser.
 *
 * Every update function in this module is PURE: it takes a sidecar, returns
 * a NEW sidecar (immutable update). Callers can therefore diff old vs. new
 * by reference and run cheap "did anything change?" guards.
 */
import type { Comment } from './comments';

export interface ThreadEntry {
  /** Stable id for the reply (UUID). Used as the React key + delete target. */
  id: string;
  author: string;
  text: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

export interface MemoMeta {
  /** ISO 8601 — when the memo's metadata entry was first ensured. */
  createdAt: string;
  /** Author display name at create time (snapshot, not a live link). */
  createdBy: string;
  resolved: boolean;
  thread: ThreadEntry[];
  /**
   * ISO 8601 set when this memo's source anchor disappeared from the doc.
   * Pruned after a 7-day grace window so an undo can recover thread.
   */
  orphanedAt?: string;
}

export interface MemoSidecar {
  version: 1;
  memos: Record<string, MemoMeta>;
}

const ORPHAN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Empty sidecar with current schema version. */
export function emptySidecar(): MemoSidecar {
  return { version: 1, memos: {} };
}

/**
 * cyrb53 — small, fast, well-distributed 53-bit hash by `bryc`. Stable across
 * Node and browser; no crypto dep. Output is a hex string padded to 14 chars
 * so we can take the first 12 deterministically.
 */
function cyrb53(input: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const out = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  // Pad with leading zeros so the output length is constant.
  return out.toString(16).padStart(14, '0');
}

/**
 * Deterministic 12-char id derived from the memo body + tag. Used as the
 * sidecar key so a re-parse of the same source memo lands on the same entry.
 *
 * NOTE: when the body is edited, the id changes. The action layer is
 * responsible for migrating the sidecar entry to the new id (see
 * `migrateMemoMeta`).
 */
export function memoIdFor(memo: Pick<Comment, 'text' | 'tag'>): string {
  const tagPart = memo.tag ?? '';
  return cyrb53(`${memo.text}:${tagPart}`).slice(0, 12);
}

/**
 * Move a sidecar entry from `oldId` to `newId`. No-op if `oldId === newId`,
 * if no entry exists at `oldId`, or if `newId` already has an entry (we
 * never overwrite — prefer keeping the existing thread on the new id).
 */
export function migrateMemoMeta(
  sidecar: MemoSidecar,
  oldId: string,
  newId: string,
): MemoSidecar {
  if (oldId === newId) return sidecar;
  const entry = sidecar.memos[oldId];
  if (!entry) return sidecar;
  if (sidecar.memos[newId]) return sidecar;
  const { [oldId]: _moved, ...rest } = sidecar.memos;
  void _moved;
  return {
    ...sidecar,
    memos: { ...rest, [newId]: { ...entry, orphanedAt: undefined } },
  };
}

/**
 * Drop entries older than the orphan TTL whose source anchor is gone, AND
 * mark newly-orphaned entries with `orphanedAt = now`. Anchors currently in
 * the source clear any existing `orphanedAt`.
 *
 * The 7-day window gives undo a chance to bring the source memo back without
 * losing the thread.
 */
export function pruneOrphans(
  sidecar: MemoSidecar,
  currentIds: ReadonlySet<string>,
  now: Date,
): MemoSidecar {
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const next: Record<string, MemoMeta> = {};
  let changed = false;
  for (const [id, meta] of Object.entries(sidecar.memos)) {
    if (currentIds.has(id)) {
      if (meta.orphanedAt) {
        next[id] = { ...meta, orphanedAt: undefined };
        changed = true;
      } else {
        next[id] = meta;
      }
      continue;
    }
    // Orphan: mark or drop based on TTL.
    if (!meta.orphanedAt) {
      next[id] = { ...meta, orphanedAt: nowIso };
      changed = true;
      continue;
    }
    const orphanedMs = Date.parse(meta.orphanedAt);
    if (Number.isFinite(orphanedMs) && nowMs - orphanedMs >= ORPHAN_TTL_MS) {
      // Past the grace window — drop.
      changed = true;
      continue;
    }
    next[id] = meta;
  }
  if (!changed) return sidecar;
  return { ...sidecar, memos: next };
}

/**
 * Lazy-create a metadata entry on first access. Idempotent — calling twice
 * with the same id returns the same sidecar reference.
 */
export function ensureMeta(
  sidecar: MemoSidecar,
  id: string,
  author: string,
  now: Date,
): MemoSidecar {
  if (sidecar.memos[id]) return sidecar;
  const meta: MemoMeta = {
    createdAt: now.toISOString(),
    createdBy: author,
    resolved: false,
    thread: [],
  };
  return { ...sidecar, memos: { ...sidecar.memos, [id]: meta } };
}

/** Toggle resolved state. Lazy-creates the entry if it didn't exist yet. */
export function setResolved(
  sidecar: MemoSidecar,
  id: string,
  resolved: boolean,
  now: Date,
): MemoSidecar {
  const base = ensureMeta(sidecar, id, 'Anonymous', now);
  const cur = base.memos[id]!;
  if (cur.resolved === resolved) return base;
  return {
    ...base,
    memos: { ...base.memos, [id]: { ...cur, resolved } },
  };
}

/**
 * Append a reply to the thread. Lazy-creates the entry. Replies are stored
 * in chronological order (oldest first) — callers should provide an `entry`
 * with a fresh `createdAt`.
 */
export function addReply(
  sidecar: MemoSidecar,
  id: string,
  entry: ThreadEntry,
  now: Date,
): MemoSidecar {
  const base = ensureMeta(sidecar, id, entry.author, now);
  const cur = base.memos[id]!;
  return {
    ...base,
    memos: {
      ...base.memos,
      [id]: { ...cur, thread: [...cur.thread, entry] },
    },
  };
}

/** Remove a reply by its id. No-op if neither the memo nor the reply exist. */
export function removeReply(
  sidecar: MemoSidecar,
  id: string,
  replyId: string,
): MemoSidecar {
  const cur = sidecar.memos[id];
  if (!cur) return sidecar;
  const next = cur.thread.filter((r) => r.id !== replyId);
  if (next.length === cur.thread.length) return sidecar;
  return {
    ...sidecar,
    memos: { ...sidecar.memos, [id]: { ...cur, thread: next } },
  };
}

/**
 * Defensive parser for a sidecar JSON blob. Anything malformed returns null
 * so the caller can fall back to an `emptySidecar()`.
 */
export function parseSidecar(raw: string): MemoSidecar | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as { version?: unknown; memos?: unknown };
  if (obj.version !== 1) return null;
  if (!obj.memos || typeof obj.memos !== 'object') return null;
  const memos: Record<string, MemoMeta> = {};
  for (const [id, raw] of Object.entries(obj.memos as Record<string, unknown>)) {
    const m = raw as Partial<MemoMeta>;
    if (
      typeof m?.createdAt !== 'string' ||
      typeof m?.createdBy !== 'string' ||
      typeof m?.resolved !== 'boolean' ||
      !Array.isArray(m?.thread)
    ) {
      continue;
    }
    const thread: ThreadEntry[] = [];
    for (const t of m.thread as Array<Partial<ThreadEntry>>) {
      if (
        typeof t?.id === 'string' &&
        typeof t?.author === 'string' &&
        typeof t?.text === 'string' &&
        typeof t?.createdAt === 'string'
      ) {
        thread.push({ id: t.id, author: t.author, text: t.text, createdAt: t.createdAt });
      }
    }
    memos[id] = {
      createdAt: m.createdAt,
      createdBy: m.createdBy,
      resolved: m.resolved,
      thread,
      orphanedAt: typeof m.orphanedAt === 'string' ? m.orphanedAt : undefined,
    };
  }
  return { version: 1, memos };
}
