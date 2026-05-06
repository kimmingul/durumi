import { useCallback, useEffect, useRef, useState } from 'react';
import type { DirEntry } from '@shared/ipc-contract';

interface FolderTreeState {
  rootEntries: DirEntry[];
  childCache: Map<string, DirEntry[]>;
  expanded: Set<string>;
  loading: Set<string>;
}

export interface UseFolderTreeResult {
  rootEntries: DirEntry[];
  childCache: Map<string, DirEntry[]>;
  expanded: Set<string>;
  isLoading: (path: string) => boolean;
  toggleExpand: (path: string) => Promise<void>;
}

const EMPTY: DirEntry[] = [];

export function useFolderTree(rootPath: string | null): UseFolderTreeResult {
  const [state, setState] = useState<FolderTreeState>({
    rootEntries: EMPTY,
    childCache: new Map(),
    expanded: new Set(),
    loading: new Set(),
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const fetchAndCache = useCallback(async (path: string) => {
    setState((s) => {
      const next = new Set(s.loading);
      next.add(path);
      return { ...s, loading: next };
    });
    const entries = await window.api.fsListDirectory(path);
    setState((s) => {
      const cache = new Map(s.childCache);
      cache.set(path, entries);
      const loading = new Set(s.loading);
      loading.delete(path);
      return { ...s, childCache: cache, loading };
    });
  }, []);

  // Load root when rootPath changes. Watching is owned by the App (per-root
  // lifecycle), so this hook only lists / refreshes; it does not start or
  // stop watchers.
  useEffect(() => {
    if (!rootPath) {
      setState({
        rootEntries: EMPTY,
        childCache: new Map(),
        expanded: new Set(),
        loading: new Set(),
      });
      return;
    }
    let cancelled = false;
    void window.api.fsListDirectory(rootPath).then((entries) => {
      if (cancelled) return;
      setState({
        rootEntries: entries,
        childCache: new Map(),
        expanded: new Set(),
        loading: new Set(),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  // Listen for fs:change events and invalidate caches.
  useEffect(() => {
    if (!rootPath) return;
    const off = window.api.onFsChange((changedPath) => {
      const cur = stateRef.current;
      if (changedPath === rootPath || changedPath.startsWith(rootPath)) {
        // Re-fetch root.
        void window.api.fsListDirectory(rootPath).then((entries) => {
          setState((s) => ({ ...s, rootEntries: entries }));
        });
        // Re-fetch any expanded directories that contain or equal the changedPath.
        for (const expandedPath of cur.expanded) {
          if (
            changedPath === expandedPath ||
            changedPath.startsWith(expandedPath + '/') ||
            changedPath.startsWith(expandedPath + '\\')
          ) {
            void fetchAndCache(expandedPath);
          }
        }
      }
    });
    return off;
  }, [rootPath, fetchAndCache]);

  const toggleExpand = useCallback(
    async (path: string) => {
      const cur = stateRef.current;
      const next = new Set(cur.expanded);
      if (next.has(path)) {
        next.delete(path);
        setState((s) => ({ ...s, expanded: next }));
        return;
      }
      next.add(path);
      setState((s) => ({ ...s, expanded: next }));
      if (!cur.childCache.has(path)) {
        await fetchAndCache(path);
      }
    },
    [fetchAndCache],
  );

  const isLoading = useCallback((path: string) => state.loading.has(path), [state.loading]);

  return {
    rootEntries: state.rootEntries,
    childCache: state.childCache,
    expanded: state.expanded,
    isLoading,
    toggleExpand,
  };
}
