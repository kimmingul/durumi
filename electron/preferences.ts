import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { Preferences } from '@shared/ipc-contract';

const FILE = () => join(app.getPath('userData'), 'preferences.json');

const DEFAULTS: Preferences = {
  theme: 'system',
  language: 'system',
  lastWindow: { width: 980, height: 720 },
  recentFiles: [],
  sidebar: {
    visible: true,
    activeTab: 'files',
    width: 240,
  },
  workspaceFolders: [],
};

let cache: Preferences | null = null;
let writeTimer: NodeJS.Timeout | null = null;

type PrefsChangedCb = (prefs: Preferences) => void;
const listeners = new Set<PrefsChangedCb>();

export function onPreferencesChanged(cb: PrefsChangedCb): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

// Migrate legacy `lastFolder: string | null` -> `workspaceFolders: string[]`.
// Idempotent: safe to apply on every read of preferences.
function migrateLegacy(
  loaded: Partial<Preferences> & { lastFolder?: string | null },
): Partial<Preferences> {
  const { lastFolder, ...rest } = loaded;
  if (rest.workspaceFolders !== undefined) {
    // Already migrated; drop legacy field if still present.
    return rest;
  }
  if (typeof lastFolder === 'string' && lastFolder.length > 0) {
    return { ...rest, workspaceFolders: [lastFolder] };
  }
  return rest;
}

function mergeDefaults(loaded: Partial<Preferences>): Preferences {
  const migrated = migrateLegacy(loaded);
  return {
    ...DEFAULTS,
    ...migrated,
    sidebar: {
      ...DEFAULTS.sidebar,
      ...(migrated.sidebar ?? {}),
    },
    lastWindow: {
      ...DEFAULTS.lastWindow,
      ...(migrated.lastWindow ?? {}),
    },
    workspaceFolders: migrated.workspaceFolders ?? DEFAULTS.workspaceFolders,
  };
}

export async function getPreferences(): Promise<Preferences> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(FILE(), 'utf8');
    cache = mergeDefaults(JSON.parse(raw) as Partial<Preferences>);
  } catch {
    cache = mergeDefaults({});
  }
  return cache;
}

export async function setPreferences(patch: Partial<Preferences>): Promise<void> {
  const current = await getPreferences();
  cache = { ...current, ...patch };
  for (const cb of listeners) cb(cache);
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    void fs.writeFile(FILE(), JSON.stringify(cache, null, 2)).catch(() => {});
  }, 500);
}

export async function addRecentFile(path: string): Promise<void> {
  const prefs = await getPreferences();
  const next = [path, ...prefs.recentFiles.filter((p) => p !== path)].slice(0, 10);
  await setPreferences({ recentFiles: next });
}
