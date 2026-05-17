import { dirname } from 'node:path';
import { getPreferences } from './preferences';

/**
 * v0.2.23 — pick a sensible starting directory for an OS file dialog.
 *
 * Electron's `dialog.showSaveDialog` / `showOpenDialog` use `defaultPath`
 * to seed both the directory and the (save-side) filename. When we
 * supplied only a bare filename like `'untitled.md'`, macOS resolved the
 * relative path against `~/Downloads` — which is almost never what the
 * user expects when a workspace folder is already open. This helper
 * walks a priority chain so the dialog opens in a directory the user
 * has already signalled interest in.
 *
 * Priority chain:
 *
 *   1. `currentFilePath` — the document this action originates from
 *      (the open buffer for Save As / Export). Strongest signal because
 *      the user explicitly placed the file there last time.
 *   2. First entry in `prefs.workspaceFolders` — a folder the user
 *      added through `dialog:openFolder` this session or a prior one.
 *      Multi-workspace: we pick the first; refining to
 *      "most-recently-active sidebar root" is a future improvement.
 *   3. First entry in `prefs.recentFolders` (MRU order).
 *   4. Dirname of the first entry in `prefs.recentFiles` (MRU order)
 *      — falls back to a file's parent dir when no folder was ever
 *      opened explicitly.
 *   5. `null` — let the OS decide (`~/Downloads` on macOS, the user's
 *      last-used dir on Windows/Linux).
 *
 * The same priority covers Open / Save / Export / pickFile because in
 * every case "navigate from somewhere the user already knows" beats
 * "drop them in Downloads". For dialogs where the action has no
 * document context (Open File, pickFile), callers pass `null` for
 * `currentFilePath` and the chain skips step 1.
 */
export async function pickDefaultDir(
  currentFilePath?: string | null,
): Promise<string | null> {
  if (currentFilePath) return dirname(currentFilePath);
  // The production `getPreferences` always returns a populated object,
  // but tests sometimes stub it with a bare `vi.fn()` that resolves to
  // `undefined`. Don't crash the dialog open in that case — fall through
  // to `null` so the OS picks the default location.
  const prefs = (await getPreferences()) as Partial<Awaited<ReturnType<typeof getPreferences>>> | undefined;
  if (!prefs) return null;
  const ws = prefs.workspaceFolders?.[0];
  if (ws) return ws;
  const recentFolder = prefs.recentFolders?.[0];
  if (recentFolder) return recentFolder;
  const recentFile = prefs.recentFiles?.[0];
  if (recentFile) return dirname(recentFile);
  return null;
}
