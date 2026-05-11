import type { BibEntry } from './bibtex';
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
    /** Left-sidebar tabs only. References + AI moved to `rightSidebar` in v0.1.8.4. */
    activeTab: 'files' | 'outline' | 'search' | 'comments' | 'changes';
    width: number;
  };
  /**
   * Right-side authoring assistance pane introduced in v0.1.8.4. Holds the
   * References and AI tabs that were previously on the left sidebar. Owns
   * its own visibility, active tab, and width so left/right can be
   * toggled independently.
   */
  rightSidebar: {
    visible: boolean;
    activeTab: 'references' | 'ai';
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
  /**
   * Bibliography / live-reference-search preferences (v0.1.6). All fields are
   * optional from the user's perspective: with empty values the feature
   * still works, just slower (Crossref polite pool benefits an email; NCBI
   * E-utilities triples its rate-limit when an API key is supplied).
   */
  bibliography: {
    /** Crossref polite-pool email. Empty = anonymous (slower). */
    email: string | null;
    /** NCBI E-utilities API key. Empty = 3 req/s; with key = 10 req/s. */
    ncbiApiKey: string | null;
    /** Personal ORCID iD (e.g. `0000-0002-1825-0097`). Used by Track C. */
    orcidId: string | null;
    /**
     * v0.1.10 — Default behavior when adding a reference. When `true`, the
     * add flow also inserts `[@key]` at the caret. The DOI modal exposes a
     * checkbox that mirrors this default so users can opt-in per-add.
     */
    insertCitationOnAdd: boolean;
    /**
     * v0.1.10 — Auto-save the Crossref `abstract` (or metadata stub) to
     * `reference/<key>.md` whenever a reference is added.
     */
    autoSaveAbstract: boolean;
    /**
     * v0.1.10 — Right sidebar references-tab sort key.
     * - `addedDesc` / `addedAsc`: by .bib append order
     * - `author`: first author surname A→Z
     * - `yearDesc` / `yearAsc`: publication year
     * - `key`: citation key A→Z
     * - `citationOrder`: order of first appearance in the open doc
     * - `unused`: entries with no `[@key]` in the doc first
     */
    sortBy:
      | 'addedDesc'
      | 'addedAsc'
      | 'author'
      | 'yearDesc'
      | 'yearAsc'
      | 'key'
      | 'citationOrder'
      | 'unused';
  };
  /**
   * AI-assisted writing (v0.1.8). API keys are stored as opaque encrypted
   * blobs (`enc:` prefix) via Electron's safeStorage; the renderer never
   * sees the plaintext. With both providers' keys empty, the AI palette
   * stays disabled and no LLM call is ever made.
   */
  ai: {
    /** Active provider for AI commands. */
    provider: 'anthropic' | 'openai-compatible';
    /** Encrypted Anthropic API key (or empty). */
    anthropicKey: string;
    /** Default Anthropic model id. */
    anthropicModel: string;
    /** Encrypted OpenAI / compat key (or empty). */
    openaiKey: string;
    /** Compat base URL — e.g. `http://localhost:11434` for Ollama. */
    openaiBaseUrl: string;
    /** OpenAI / compat model id. */
    openaiModel: string;
    /**
     * v0.1.8.1 Track C — inline ghost-text completion. Off by default
     * because every accepted Tab is a real LLM call. When on, the editor
     * triggers after `ghostTextIdleMs` of typing inactivity at the end
     * of a paragraph and caps total triggers at `ghostTextSessionCap`
     * to bound cost.
     */
    ghostTextEnabled: boolean;
    ghostTextIdleMs: number;
    ghostTextSessionCap: number;
  };
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
  | 'openFolder' | 'toggleSidebar' | 'toggleRightSidebar' | 'showFiles' | 'showOutline' | 'showSearch' | 'quickOpen'
  | 'toggleFocusMode' | 'toggleTypewriterMode'
  | 'toggleMemoPanel'
  | 'addMemo'
  | 'cmInsert' | 'cmDelete' | 'cmSubstitute' | 'cmHighlight' | 'cmComment'
  | 'showMemos' | 'showChanges' | 'showReferences' | 'showAi'
  | 'nextMemo' | 'prevMemo'
  | 'insertCitationFromDoi'
  | 'bulkInsertFromDoi'
  | 'importReferences'
  | 'openAiPalette'
  | 'aiCitationSuggest'
  | 'openCitePalette'
  | 'toggleExportIncludeComments' | 'toggleExportPreserveAnnotations'
  | 'exportHtml'
  | 'exportPdf'
  | 'exportDocx'
  | 'exportLatex'
  | 'importDocx'
  | { type: 'newFromTemplate'; templateId: string }
  | 'openMacrosConfig'
  | 'openSettings'
  | 'languageChanged'
  | 'openKeyboardShortcuts'
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
  /**
   * v0.1.6 Track A — DOI → BibEntry via Crossref. The renderer never makes
   * outbound HTTP itself; main owns the User-Agent, polite-pool email, and
   * timeout budget.
   */
  bibliographyResolveDoi: (
    doi: string,
  ) => Promise<
    | { ok: true; entry: BibEntry }
    | { ok: false; code: 'not-found' | 'network' | 'parse' | 'timeout' | 'rate-limit' | 'http'; message: string }
  >;
  /**
   * Locate the `.bib` file we should write into for the active document.
   * Discovery order matches `bibliographyFind` for read symmetry. When
   * none exists, this creates `references.bib` next to the document.
   */
  bibliographyEnsureFile: (
    docPath: string | null,
  ) => Promise<{ ok: true; path: string; created: boolean } | { ok: false; error: string }>;
  /**
   * Append an entry to the `.bib` file at `filePath`. The caller passes a
   * `BibEntry` whose `key` may be empty — main mints a unique key via
   * `makeCitationKey` and returns the final value.
   */
  bibliographyAppendEntry: (
    filePath: string,
    entry: BibEntry,
  ) => Promise<{ ok: true; key: string; path: string } | { ok: false; error: string }>;
  /** Read + parse `.bib` so the renderer doesn't reimplement BibTeX parsing. */
  bibliographyReadEntries: (
    filePath: string,
  ) => Promise<{ ok: true; entries: BibEntry[]; warnings: string[] } | { ok: false; error: string }>;
  /**
   * Crossref keyword search. v0.1.6 Track B. Returns up to `limit` hits
   * (default 25, capped at 50) as pre-mapped BibEntries.
   */
  bibliographySearchCrossref: (
    query: string,
    limit?: number,
  ) => Promise<
    | { ok: true; hits: BibliographySearchHit[] }
    | { ok: false; code: string; message: string }
  >;
  /**
   * PubMed search via NCBI E-utilities (ESearch + ESummary). The NCBI API
   * key from Settings raises the rate-limit from 3 to 10 req/s.
   */
  bibliographySearchPubmed: (
    query: string,
    limit?: number,
  ) => Promise<
    | { ok: true; hits: BibliographySearchHit[] }
    | { ok: false; code: string; message: string }
  >;
  /**
   * KoreaMed search via HTML scraping. v0.1.6 Track C. Falls back gracefully
   * when the upstream HTML structure changes — the per-field regexes in
   * `parseKoreaMedHtml` are the single point of repair.
   */
  bibliographySearchKoreamed: (
    query: string,
    limit?: number,
  ) => Promise<
    | { ok: true; hits: BibliographySearchHit[] }
    | { ok: false; code: string; message: string }
  >;
  /**
   * ORCID iD → public profile (name + affiliation + works count). Used by
   * the Settings "verify" affordance for `bibliography.orcidId`.
   */
  bibliographyResolveOrcid: (
    iD: string,
  ) => Promise<
    | { ok: true; profile: { iD: string; name: string; affiliation: string | null; worksCount: number } }
    | { ok: false; code: string; message: string }
  >;
  /**
   * Replace (or append) an entry by key. v0.1.7 — used after a download to
   * persist `entry.fields.file` back into `references.bib` so the local
   * file is reachable on the next session.
   */
  bibliographyUpsertEntry: (
    filePath: string,
    entry: BibEntry,
  ) => Promise<{ ok: true; key: string; path: string } | { ok: false; error: string }>;
  /**
   * Remove an entry by key. v0.1.7.1 — used by the sidebar delete affordance.
   * The associated file in `reference/` (if any) is intentionally left in
   * place per the "user files are never auto-deleted" invariant.
   */
  bibliographyRemoveEntry: (
    filePath: string,
    key: string,
  ) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  /**
   * v0.1.8.1 — atomically rename an entry's citation key in references.bib.
   * The renderer is expected to migrate `[@oldKey]` references in the
   * active document via a single CodeMirror dispatch (computed locally
   * from `renameCitationKeyChanges`); this handler only owns the bib write.
   */
  bibliographyRenameKey: (
    filePath: string,
    oldKey: string,
    newKey: string,
  ) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  /**
   * v0.1.7.1 — read a .bib or .ris file and return its parsed entries.
   * Format is auto-detected by extension first, falling back to content
   * sniffing when the extension is ambiguous.
   */
  bibliographyImportFile: (
    sourcePath: string,
  ) => Promise<
    | { ok: true; entries: BibEntry[]; warnings: string[]; format: 'bibtex' | 'ris' }
    | { ok: false; error: string }
  >;
  /**
   * v0.1.7 Track B — download the open-access copy of a reference into
   * `<doc-folder>/reference/`. Probes Crossref `link[]`, PMC, Unpaywall
   * (in that order); falls back to a HTML→Markdown scrape, then to an
   * abstract-only stub. Always succeeds with SOMETHING (even when only
   * metadata is available).
   */
  referenceDownload: (
    bibFilePath: string,
    entry: BibEntry,
  ) => Promise<ReferenceDownloadResult>;
  /** Open a saved reference file with the OS default app. */
  referenceOpen: (
    bibFilePath: string,
    relPath: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  /**
   * Status check for a single citation key — does a file exist on disk
   * for it? Used by the sidebar to decide between "📄" and "📥 Download".
   */
  referenceStatus: (
    bibFilePath: string,
    key: string,
    fileField?: string | null,
  ) => Promise<ReferenceFileStatusResult>;
  /** List every file in `<bib-dir>/reference/` for the orphan-files view. */
  referenceScan: (
    bibFilePath: string,
  ) => Promise<{ ok: true; files: ReferenceScannedFile[] } | { ok: false; error: string }>;
  /**
   * v0.1.7 Track C — read the head of an orphan file and try to extract a
   * DOI from it. PDF: scans the trailer Info dict + first 256KB. Markdown:
   * scans YAML front-matter + first 32KB. Returns null when nothing matches.
   */
  referenceExtractDoi: (
    absPath: string,
  ) => Promise<{
    doi: string | null;
    source: 'pdf-info' | 'pdf-content' | 'md-frontmatter' | 'md-body' | 'none';
  }>;
  /**
   * v0.1.8.2 — extract real text from a local PDF or markdown file in
   * `<bib-dir>/reference/`. Used by the citation-suggestion enrichment
   * to feed actual paper content to the model instead of relying on the
   * Crossref abstract alone. PDF text comes from pdfjs-dist (lazy-loaded
   * the first time this IPC fires).
   */
  referenceExtractText: (
    bibFilePath: string,
    relPath: string,
    options?: { maxPages?: number; maxChars?: number },
  ) => Promise<
    | { ok: true; text: string; pages: number }
    | { ok: false; error: string }
  >;
  /**
   * v0.1.8 — write a plaintext API key. Main encrypts via safeStorage and
   * persists the encrypted blob into preferences.json.
   */
  aiSetApiKey: (
    provider: 'anthropic' | 'openai-compatible',
    plainKey: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Tell the renderer whether the active provider has any key configured. */
  aiHasKey: (provider: 'anthropic' | 'openai-compatible') => Promise<boolean>;
  /** Probe the active provider with a tiny request to verify auth + reach. */
  aiVerify: () => Promise<AiVerifyResult>;
  /**
   * Run an AI completion. Returns the assistant text + token usage. The
   * caller passes the full `messages` array so it can compose system
   * prompts and few-shot examples for each command type.
   */
  aiChat: (
    messages: AiMessageDto[],
    options?: { maxTokens?: number; temperature?: number },
  ) => Promise<AiChatResponse>;
}

export interface AiMessageDto {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type AiVerifyResult =
  | { ok: true; provider: 'anthropic' | 'openai-compatible'; model: string }
  | { ok: false; code: string; message: string };

export type AiChatResponse =
  | { ok: true; text: string; inputTokens: number; outputTokens: number }
  | { ok: false; code: string; message: string };

export interface ReferenceDownloadResult {
  ok: true;
  path: string;
  relPath: string;
  type: 'pdf' | 'md';
  source: 'crossref-link' | 'pmc' | 'unpaywall' | 'html-scrape' | 'abstract';
  fetchedFrom?: string;
}
export type ReferenceDownloadResponse =
  | ReferenceDownloadResult
  | { ok: false; code: string; message: string };

export interface ReferenceFileStatusResult {
  exists: boolean;
  absPath: string | null;
  relPath: string | null;
  type: 'pdf' | 'md' | null;
}

export interface ReferenceScannedFile {
  absPath: string;
  relPath: string;
  fileName: string;
  type: 'pdf' | 'md' | null;
}

/** Result row shared by every search backend (Crossref / PubMed / KoreaMed). */
export interface BibliographySearchHit {
  entry: BibEntry;
  externalId: string;
  source: 'crossref' | 'pubmed' | 'koreamed';
}

declare global {
  interface Window {
    api: IpcApi;
  }
}
export {};
