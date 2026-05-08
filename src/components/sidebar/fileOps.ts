import { t } from '../../i18n/t';
import { basenameOf, dirnameOf, joinPath } from '../../utils/path';

/**
 * Rejects names that are empty, equal to "." or "..", or contain a path
 * separator. Returns null when the name is valid; otherwise a localised
 * error string suitable for showing in an alert.
 */
export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') return t('sidebar.menu.invalidName');
  if (trimmed.includes('/') || trimmed.includes('\\')) return t('sidebar.menu.invalidName');
  return null;
}

interface OpResult {
  ok: true;
  path: string;
}
interface OpError {
  ok: false;
  error: string;
}
type Outcome = OpResult | OpError;

/**
 * Wraps an IPC file-op so callers don't have to repeat the alert-on-failure
 * boilerplate. Returns the resolved path on success or null on failure (the
 * user has already seen the alert at that point).
 */
export async function runOp(
  fn: () => Promise<Outcome>,
): Promise<string | null> {
  try {
    const r = await fn();
    if (r.ok) return r.path;
    window.alert(t('sidebar.menu.opFailed', { error: r.error }));
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    window.alert(t('sidebar.menu.opFailed', { error: msg }));
    return null;
  }
}

/** Best-effort copy to the clipboard. Falls back silently on jsdom/test envs. */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  } catch {
    // Clipboard write can fail in headless / sandboxed contexts. The user
    // didn't ask us for an error path here — this is best-effort UX.
  }
}

/**
 * Prompts (via window.prompt) for a new file/folder name inside `dirPath`,
 * validates it, then calls the supplied creator. Returns the new path or null
 * if the user cancelled / validation failed.
 */
export async function createInside(
  dirPath: string,
  kind: 'file' | 'folder',
): Promise<string | null> {
  const promptKey = kind === 'file' ? 'sidebar.menu.newFilePrompt' : 'sidebar.menu.newFolderPrompt';
  const defaultName = kind === 'file' ? 'untitled.md' : 'New Folder';
  const raw = window.prompt(t(promptKey), defaultName);
  if (raw === null) return null;
  const err = validateName(raw);
  if (err) {
    window.alert(err);
    return null;
  }
  const target = joinPath(dirPath, raw.trim());
  const fn = kind === 'file' ? window.api.filesCreate : window.api.filesCreateFolder;
  return runOp(() => fn(target));
}

/**
 * Renames `oldPath` to a sibling with `newName`. The caller has already
 * validated `newName` via `validateName`.
 */
export async function renameTo(oldPath: string, newName: string): Promise<string | null> {
  const dir = dirnameOf(oldPath);
  if (!dir) return null;
  const newPath = joinPath(dir, newName);
  if (newPath === oldPath) return oldPath; // no-op
  return runOp(() => window.api.filesRename(oldPath, newPath));
}

/** Confirms (window.confirm) before trashing. Returns the trashed path or null. */
export async function trashWithConfirm(targetPath: string): Promise<string | null> {
  const name = basenameOf(targetPath, targetPath);
  const ok = window.confirm(t('sidebar.menu.confirmTrash', { name }));
  if (!ok) return null;
  return runOp(() => window.api.filesTrash(targetPath));
}
