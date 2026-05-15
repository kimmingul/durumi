import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import type { Preferences, StyleSet } from '@shared/ipc-contract';

/**
 * v0.1.11 Phase 3 — Durumi-default StyleSet, duplicated from
 * `src/styles/journalPresets.ts` because main cannot import renderer code.
 * The two definitions are kept in lockstep by `tests/styles/journalPresets.test.ts`.
 */
const DURUMI_DEFAULT_BODY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const DURUMI_DEFAULT_CODE =
  "ui-monospace, 'SF Mono', Menlo, Consolas, 'Roboto Mono', monospace";
const DURUMI_DEFAULT_STYLES: StyleSet = {
  body:        { fontFamily: DURUMI_DEFAULT_BODY, fontSizePx: 16, fontWeight: 400, color: null, lineHeight: 1.6 },
  h1:          { fontFamily: DURUMI_DEFAULT_BODY, fontSizePx: 24, fontWeight: 600, color: null, lineHeight: 1.3 },
  h2:          { fontFamily: DURUMI_DEFAULT_BODY, fontSizePx: 20, fontWeight: 600, color: null, lineHeight: 1.3 },
  h3:          { fontFamily: DURUMI_DEFAULT_BODY, fontSizePx: 18, fontWeight: 600, color: null, lineHeight: 1.35 },
  h4:          { fontFamily: DURUMI_DEFAULT_BODY, fontSizePx: 16, fontWeight: 600, color: null, lineHeight: 1.4 },
  h5:          { fontFamily: DURUMI_DEFAULT_BODY, fontSizePx: 14, fontWeight: 600, color: null, lineHeight: 1.4 },
  h6:          { fontFamily: DURUMI_DEFAULT_BODY, fontSizePx: 13, fontWeight: 600, color: null, lineHeight: 1.4 },
  blockquote:  { fontFamily: DURUMI_DEFAULT_BODY, fontSizePx: 16, fontWeight: 400, color: null, lineHeight: 1.6 },
  code:        { fontFamily: DURUMI_DEFAULT_CODE, fontSizePx: 14, fontWeight: 400, color: null, lineHeight: 1.5 },
  tableHeader: { fontFamily: DURUMI_DEFAULT_BODY, fontSizePx: 16, fontWeight: 700, color: null, lineHeight: 1.4 },
};

const FILE = () => join(app.getPath('userData'), 'preferences.json');

/**
 * Best-effort OS username lookup. `os.userInfo()` throws on some non-POSIX
 * setups (e.g. when no passwd entry is found); fall back to "Anonymous" so
 * the rest of the app keeps working.
 */
function osDisplayName(): string {
  try {
    const u = userInfo({ encoding: 'utf8' }).username;
    return u && u.length > 0 ? u : 'Anonymous';
  } catch {
    return 'Anonymous';
  }
}

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
  rightSidebar: {
    visible: false,
    activeTab: 'references',
    width: 280,
  },
  memoPanel: {
    width: 320,
    hideResolvedDefault: true,
    groupBy: 'line',
  },
  author: { name: osDisplayName() },
  workspaceFolders: [],
  pandocPath: null,
  docxStyleReference: null,
  latexTemplate: null,
  spellCheckLanguages: ['en-US'],
  spellCheckCustomWords: [],
  exportIncludeComments: false,
  exportPreserveAnnotations: false,
  bibliography: {
    email: null,
    ncbiApiKey: null,
    orcidId: null,
    insertCitationOnAdd: false,
    autoSaveAbstract: true,
    sortBy: 'addedDesc',
  },
  ai: {
    provider: 'anthropic',
    anthropicKey: '',
    anthropicModel: 'claude-sonnet-4-6',
    openaiKey: '',
    openaiBaseUrl: 'https://api.openai.com',
    openaiModel: 'gpt-4o-mini',
    ghostTextEnabled: false,
    ghostTextIdleMs: 800,
    ghostTextSessionCap: 100,
  },
  editor: {
    defaultMode: 'wysiwyg',
    activePreset: 'durumi-default',
    styles: DURUMI_DEFAULT_STYLES,
    tableStyleFormat: 'pandoc',
  },
};

const STYLE_ENTRY_KEYS = [
  'body',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'code',
  'tableHeader',
] as const;

function isValidStyleSet(value: unknown): value is StyleSet {
  if (!value || typeof value !== 'object') return false;
  for (const k of STYLE_ENTRY_KEYS) {
    const spec = (value as Record<string, unknown>)[k];
    if (!spec || typeof spec !== 'object') return false;
    const s = spec as Record<string, unknown>;
    if (typeof s.fontFamily !== 'string') return false;
    if (typeof s.fontSizePx !== 'number') return false;
    if (typeof s.fontWeight !== 'number') return false;
    if (s.color !== null && typeof s.color !== 'string') return false;
    if (typeof s.lineHeight !== 'number') return false;
  }
  return true;
}

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
  let next: Partial<Preferences> = rest;
  if (next.workspaceFolders === undefined && typeof lastFolder === 'string' && lastFolder.length > 0) {
    next = { ...next, workspaceFolders: [lastFolder] };
  }
  // v0.1.8.4: References + AI moved from the left sidebar to a dedicated
  // right sidebar. If the user's saved activeTab is one of those values,
  // surface it on the right side and reset the left to its default so the
  // first launch after upgrade feels continuous (their last-used tab is
  // still open, just on the new side).
  const sidebar = next.sidebar as undefined | { activeTab?: unknown };
  const oldActive = sidebar?.activeTab;
  if (oldActive === 'references' || oldActive === 'ai') {
    next = {
      ...next,
      sidebar: { ...(sidebar as object), activeTab: 'files' },
      rightSidebar: {
        ...((next.rightSidebar as object) ?? {}),
        visible: true,
        activeTab: oldActive,
      } as Preferences['rightSidebar'],
    };
  }
  return next;
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
    rightSidebar: {
      ...DEFAULTS.rightSidebar,
      ...(migrated.rightSidebar ?? {}),
    },
    memoPanel: {
      ...DEFAULTS.memoPanel,
      ...(migrated.memoPanel ?? {}),
    },
    author: {
      ...DEFAULTS.author,
      ...(migrated.author ?? {}),
    },
    bibliography: {
      ...DEFAULTS.bibliography,
      ...(migrated.bibliography ?? {}),
    },
    ai: {
      ...DEFAULTS.ai,
      ...(migrated.ai ?? {}),
    },
    editor: {
      ...DEFAULTS.editor,
      ...(migrated.editor ?? {}),
      // Guard against a corrupt / partial styles block — the renderer expects
      // every entry to be present, so we fall back to the bundled default
      // whenever the loaded value isn't a complete StyleSet.
      styles: isValidStyleSet(migrated.editor?.styles)
        ? migrated.editor!.styles
        : DEFAULTS.editor.styles,
      // v0.2.6 — clamp table style format to known values; default `pandoc`.
      tableStyleFormat:
        migrated.editor?.tableStyleFormat === 'html' ? 'html' : 'pandoc',
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
