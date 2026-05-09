import type { MemoSidecar } from './memoSidecar';

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

/** Card grouping modes for the memo chat panel (v0.1.4). */
export type MemoGroupBy = 'line' | 'tag' | 'author' | 'status';

export interface Preferences {
  theme: 'system' | 'light' | 'dark';
  language: 'system' | 'en' | 'ko';
  lastWindow: { width: number; height: number; x?: number; y?: number };
  recentFiles: string[];
  sidebar: {
    visible: boolean;
    activeTab: 'files' | 'outline' | 'search' | 'comments' | 'changes';
    width: number;
  };
  /**
   * Right-side memo chat panel. `width` is persisted; visibility is derived
   * at render time from `(memos.length > 0) && !manuallyHidden` and
   * `manuallyHidden` itself is per-session (intentionally not persisted).
   * v0.1.4 adds `hideResolvedDefault` (initial state of the toggle when a
   * doc opens) and `groupBy` (initial grouping mode).
   */
  memoPanel: {
    width: number;
    hideResolvedDefault: boolean;
    groupBy: MemoGroupBy;
  };
  /**
   * Author identity used as the default `createdBy` for memo metadata and
   * thread replies. Defaults to the OS username (set by main on first run).
   */
  author: { name: string };
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
  /**
   * When true, `%%` memos are kept in the exported document (HTML/PDF/DOCX/
   * LaTeX) as visible blockquotes. Default `false` strips memos so review
   * notes never leak into a submitted manuscript.
   */
  exportIncludeComments: boolean;
  /**
   * When true, CriticMarkup track-changes operators are rendered into the
   * exported document as visible `<ins>/<del>/<mark>/<aside>` (HTML) or
   * Pandoc-styled spans (DOCX/LaTeX). Default `false` ACCEPTs all changes
   * (insertions kept, deletions dropped, substitutions resolved to the new
   * text, comments dropped) — the safe default for medical manuscripts.
   */
  exportPreserveAnnotations: boolean;
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
  | 'toggleMemoPanel'
  | 'exportHtml'
  | 'exportPdf'
  | 'exportDocx'
  | 'exportLatex'
  | 'importDocx'
  | { type: 'newFromTemplate'; templateId: string }
  | 'openMacrosConfig'
  | 'openSettings'
  | 'languageChanged'
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: 'openRecent'; path: string }
  | { type: 'closeFolder'; path: string };

export interface FilePickerOptions {
  title?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

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
    sourceFilePath?: string | null,
  ) => Promise<
    | { path: string }
    | { error: string; stderr?: string; code?: 'pandoc-missing' }
    | null
  >;
  pandocImport: (
    format: 'docx' | 'odt' | 'rtf',
  ) => Promise<
    | { markdown: string; sourcePath: string }
    | { error: string; stderr?: string; code?: 'pandoc-missing' }
    | null
  >;
  pandocDetectHomebrew: () => Promise<{ available: boolean; path: string | null }>;
  pandocInstallViaHomebrew: () => Promise<{
    ok: boolean;
    error?: string;
    stderr?: string;
    code?: 'brew-missing' | 'install-failed' | 'timeout';
  }>;
  pandocSetCustomPath: (
    path: string,
  ) => Promise<{ binary: string; version: string } | null>;
  pandocPickCustomPath: () => Promise<string | null>;
  /** Generic single-file picker for the settings panel (style refs, templates). */
  dialogPickFile: (opts?: FilePickerOptions) => Promise<string | null>;
  onPandocInstallProgress: (cb: (chunk: string) => void) => () => void;
  shellOpenExternal: (url: string) => Promise<{ ok: true } | { ok: false; error: string }>;
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
  bibliographyFind: (
    filePath: string | null,
    roots: string[],
  ) => Promise<{ path: string; source: string } | null>;
  filesCreate: (path: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  filesCreateFolder: (path: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  filesRename: (
    oldPath: string,
    newPath: string,
  ) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  filesDuplicate: (path: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  filesTrash: (path: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  filesReveal: (path: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  /**
   * Read the `<docPath>.comments.json` sidecar metadata. Returns `null` when
   * the file is missing or malformed; callers should fall back to an empty
   * sidecar in that case.
   */
  memoSidecarRead: (docPath: string) => Promise<MemoSidecar | null>;
  /** Atomically write the sidecar JSON next to the document. */
  memoSidecarWrite: (docPath: string, sidecar: MemoSidecar) => Promise<void>;
}

declare global {
  interface Window {
    api: IpcApi;
  }
}
export {};
