export interface FileResult {
  path: string;
  content: string;
}

export interface Macro {
  name: string;
  keybind: string;
  insertion: string;
}

export type DiscardChoice = 'save' | 'discard' | 'cancel';

export interface Preferences {
  theme: 'system' | 'light' | 'dark';
  language: 'system' | 'en' | 'ko';
  lastWindow: { width: number; height: number; x?: number; y?: number };
  recentFiles: string[];
  sidebar: {
    visible: boolean;
    activeTab: 'files' | 'outline' | 'search';
    width: number;
  };
  workspaceFolders: string[];
  /** Optional explicit path to the pandoc binary; null = auto-detect on PATH. */
  pandocPath: string | null;
  /** Optional `.docx` style reference template path (Pandoc --reference-doc). */
  docxStyleReference: string | null;
  /** Optional Pandoc LaTeX template (--template). */
  latexTemplate: string | null;
  /** Spell-check languages, e.g. ['en-US']; empty array disables it. */
  spellCheckLanguages: string[];
  /** Words the user has added to the dictionary across sessions. */
  spellCheckCustomWords: string[];
}

export type MenuCommand =
  | 'new' | 'newWindow' | 'open' | 'save' | 'saveAs' | 'closeWindow'
  | 'toggleTheme' | 'toggleSourceMode' | 'zoomIn' | 'zoomOut' | 'zoomReset'
  | 'undo' | 'redo' | 'find'
  | 'findAndReplace'
  | 'findNext'
  | 'findPrev'
  | 'bold' | 'italic' | 'code' | 'link'
  | 'strikethrough' | 'insertTable' | 'toggleTask' | 'codeBlock'
  | 'openFolder' | 'toggleSidebar' | 'showFiles' | 'showOutline' | 'showSearch' | 'quickOpen'
  | 'toggleFocusMode' | 'toggleTypewriterMode'
  | 'exportHtml'
  | 'exportPdf'
  | 'exportDocx'
  | 'exportLatex'
  | 'openMacrosConfig'
  | 'languageChanged'
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: 'openRecent'; path: string }
  | { type: 'closeFolder'; path: string };

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  mtimeMs: number;
}

export interface IpcApi {
  ping: () => Promise<'pong'>;
  fileOpen: () => Promise<FileResult | null>;
  fileOpenPath: (path: string) => Promise<FileResult>;
  fileSave: (path: string, content: string) => Promise<{ ok: true }>;
  fileSaveAs: (content: string, suggestedName?: string) => Promise<{ path: string } | null>;
  exportFile: (
    html: string,
    format: 'html' | 'pdf',
    suggestedName?: string,
  ) => Promise<{ path: string } | null>;
  confirmDiscard: (filename: string) => Promise<DiscardChoice>;
  prefsGet: () => Promise<Preferences>;
  prefsSet: (patch: Partial<Preferences>) => Promise<void>;
  windowSetTitle: (title: string) => Promise<void>;
  onMenuCommand: (cb: (cmd: MenuCommand) => void) => () => void;
  onThemeChanged: (cb: (theme: 'light' | 'dark') => void) => () => void;
  dialogOpenFolder: () => Promise<string | null>;
  fsListDirectory: (path: string) => Promise<DirEntry[]>;
  fsWatchRoot: (path: string) => Promise<void>;
  fsUnwatchRoot: (path: string) => Promise<void>;
  fsUnwatchAllRoots: () => Promise<void>;
  onFsChange: (cb: (changedPath: string) => void) => () => void;
  customCssGet: () => Promise<string>;
  onCustomCssChanged: (cb: (css: string) => void) => () => void;
  gitGetStatus: (rootPath: string) => Promise<Record<string, string>>;
  onGitStatusChanged: (cb: (rootPath: string) => void) => () => void;
  saveImage: (
    buffer: Uint8Array,
    mimeType: string,
    contextFilePath: string | null,
  ) => Promise<{ relPath: string } | { error: 'no-file' }>;
  macrosGet: () => Promise<Macro[]>;
  onMacrosChanged: (cb: (macros: Macro[]) => void) => () => void;
  onAppRequestClose: (decide: () => boolean | Promise<boolean>) => () => void;
  pandocDetect: () => Promise<{ binary: string; version: string } | null>;
  pandocExport: (
    markdown: string,
    format: 'docx' | 'latex',
    suggestedName?: string,
  ) => Promise<{ path: string } | { error: string; stderr?: string } | null>;
  searchWorkspace: (
    rootPath: string,
    opts: {
      query: string;
      caseSensitive?: boolean;
      wholeWord?: boolean;
      regex?: boolean;
    },
  ) => Promise<
    Array<{
      relPath: string;
      absPath: string;
      line: number;
      column: number;
      preview: string;
      matchLength: number;
    }>
  >;
  filesIndex: (
    roots: string[],
  ) => Promise<Array<{ name: string; relPath: string; absPath: string }>>;
  filesCreate: (path: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  filesCreateFolder: (path: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  filesRename: (
    oldPath: string,
    newPath: string,
  ) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  filesDuplicate: (path: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  filesTrash: (path: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  filesReveal: (path: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
}

declare global {
  interface Window {
    api: IpcApi;
  }
}
export {};
