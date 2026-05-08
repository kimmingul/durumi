import { useCallback, useEffect, useState } from 'react';
import type { Preferences } from '@shared/ipc-contract';

type UpdateFn = (patch: Partial<Preferences>) => Promise<void>;

interface UsePreferencesResult {
  /** `null` until the first prefs read resolves. */
  prefs: Preferences | null;
  /**
   * Patch the persisted preferences and update local state optimistically.
   * The renderer always updates its own copy first so radios/checkboxes feel
   * instant; the IPC write follows on the same tick.
   */
  update: UpdateFn;
}

/**
 * Two-way binding for the renderer's preferences. Loads on mount, exposes
 * `prefs` (read) and `update` (write). The hook does not subscribe to a
 * "preferences changed" channel because the main process is the only writer
 * apart from this renderer; for cross-window sync, callers should re-fetch.
 */
export function usePreferences(): UsePreferencesResult {
  const [prefs, setPrefs] = useState<Preferences | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.api.prefsGet().then((p) => {
      if (!cancelled) setPrefs(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update: UpdateFn = useCallback(async (patch) => {
    setPrefs((cur) => (cur ? { ...cur, ...patch } : cur));
    await window.api.prefsSet(patch);
  }, []);

  return { prefs, update };
}
