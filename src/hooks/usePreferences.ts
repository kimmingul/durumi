import { useCallback, useEffect, useState } from 'react';
import type { Preferences, PreferencesPatch } from '@shared/ipc-contract';

type UpdateFn = (patch: PreferencesPatch) => Promise<void>;

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
    setPrefs((cur) => (cur ? mergeDeepOneLevel(cur, patch) : cur));
    await window.api.prefsSet(patch);
  }, []);

  return { prefs, update };
}

/**
 * v0.2.17 — mirror of `electron/preferences.ts#setPreferences`'s one-level
 * merge so the optimistic renderer state stays in sync with the main-side
 * write. A shallow `{...cur, ...patch}` would erase sibling fields when the
 * caller passes e.g. `{ editor: { defaultMode: 'wysiwyg' } }`. Arrays and
 * primitives still overwrite wholesale; only top-level object values merge.
 */
function mergeDeepOneLevel(cur: Preferences, patch: PreferencesPatch): Preferences {
  const out = { ...cur };
  for (const k of Object.keys(patch) as (keyof PreferencesPatch)[]) {
    const incoming = patch[k];
    if (incoming === undefined) continue;
    const curVal = cur[k];
    if (
      curVal !== null &&
      typeof curVal === 'object' &&
      !Array.isArray(curVal) &&
      incoming !== null &&
      typeof incoming === 'object' &&
      !Array.isArray(incoming)
    ) {
      (out as Record<string, unknown>)[k as string] = {
        ...(curVal as object),
        ...(incoming as object),
      };
    } else {
      (out as Record<string, unknown>)[k as string] = incoming;
    }
  }
  return out;
}
