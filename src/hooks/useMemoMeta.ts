import { useEffect } from 'react';
import type { Comment } from '@shared/comments';
import { memoIdFor, type MemoMeta } from '@shared/memoSidecar';
import { useMemoSidecarStore } from '../store/memoSidecarStore';

const FALLBACK_AUTHOR = 'Anonymous';

/**
 * Reactive lookup for the sidecar metadata of `memo`. On first access for
 * a given memo id, lazily ensures an entry exists in the store so the rest
 * of the UI can read author/createdAt/resolved without optional chains.
 *
 * Returns a synthesized "default" MemoMeta when the id isn't yet in the
 * store (the lazy ensureMeta runs in an effect so we never set state during
 * render).
 */
export function useMemoMeta(memo: Comment): MemoMeta {
  const id = memoIdFor(memo);
  const meta = useMemoSidecarStore((s) => s.sidecar.memos[id]);
  const ensureMeta = useMemoSidecarStore((s) => s.ensureMeta);
  const fallbackAuthor = useMemoSidecarStore((s) => s.authorName);

  useEffect(() => {
    if (!meta) ensureMeta(id);
  }, [id, meta, ensureMeta]);

  if (meta) return meta;
  // Synthesized default — the store will catch up on the next render after
  // the effect commits ensureMeta.
  return {
    createdAt: '',
    createdBy: fallbackAuthor || FALLBACK_AUTHOR,
    resolved: false,
    thread: [],
  };
}

/** Convenience: extract the id without re-deriving it from the memo body. */
export function useMemoId(memo: Comment): string {
  return memoIdFor(memo);
}
