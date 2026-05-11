import { useEffect, useRef, useState } from 'react';
import { MarkdownEditor } from './editor/MarkdownEditor';
import { StatusBar } from './components/StatusBar';
import { Sidebar } from './components/Sidebar';
import { RightSidebar } from './components/RightSidebar';
import { MemoPanel } from './components/MemoPanel';
import { QuickOpen } from './components/QuickOpen';
import { PandocInstallDialog } from './components/PandocInstallDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { InsertCitationDialog } from './components/InsertCitationDialog';
import { CitePalette } from './components/CitePalette';
import { BulkDoiDialog } from './components/BulkDoiDialog';
import { ImportReferencesDialog } from './components/ImportReferencesDialog';
import { AiCommandPalette } from './components/AiCommandPalette';
import { CitationSuggestPanel } from './components/CitationSuggestPanel';
import { KeyboardShortcutsDialog } from './components/KeyboardShortcutsDialog';
import { currentParagraph } from './editor/paragraphContext';
import type { BibEntry } from '@shared/bibtex';
import { useBibliographyStore } from './store/bibliographyStore';
import { useAppStore } from './store/appStore';
import { useSidebarStore } from './store/sidebarStore';
import { useRightSidebarStore } from './store/rightSidebarStore';
import { useMemoPanelStore } from './store/memoPanelStore';
import { useMemoSidecarStore } from './store/memoSidecarStore';
import { memoIdFor, pruneOrphans } from '../shared/memoSidecar';
import { useMemoCaretFocus } from './hooks/useMemoCaretFocus';
import { parseComments } from '../shared/comments';
import type { Macro, MenuCommand } from '@shared/ipc-contract';
import { EditorView } from '@codemirror/view';
import { focusModeField, setFocusMode, setTypewriterMode, typewriterModeField } from './editor/viewModes';
import { toggleWrap } from './editor/keymap/toggleWrap';
import { setHeading } from './editor/keymap/setHeading';
import { insertTable as insertTableHelper } from './editor/keymap/insertTable';
import { insertCodeBlock as insertCodeBlockHelper } from './editor/keymap/insertCodeBlock';
import { toggleTask as toggleTaskHelper } from './editor/keymap/toggleTask';
import { wrapComment } from './editor/keymap/wrapComment';
import {
  wrapCmInsert,
  wrapCmDelete,
  wrapCmSubstitute,
  wrapCmHighlight,
  wrapCmComment,
} from './editor/keymap/wrapCriticMarkup';
import { nextMemo, prevMemo } from './editor/keymap/memoNav';
import { openSearch, openSearchAndReplace, gotoNext, gotoPrev } from './editor/openSearch';
import { renderHtml } from './export/renderHtml';
import { promoteComments, stripComments } from '../shared/comments';
import { transformCm } from '../shared/criticMarkup';
import { findTemplate } from '../shared/manuscriptTemplates';
import { t, useLanguage, resolveRendererLang } from './i18n/t';
import { insertCitationSmart } from '../shared/citationMerge';
import { basenameOf, stripMarkdownExt } from './utils/path';

function upsertCustomCssTag(css: string) {
  let el = document.getElementById('custom-css') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'custom-css';
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export function App() {
  const editorViewRef = useRef<EditorView | null>(null);
  const filePath = useAppStore((s) => s.filePath);
  const content = useAppStore((s) => s.content);
  const isDirty = useAppStore((s) => s.isDirty);
  const setFile = useAppStore((s) => s.setFile);
  const markClean = useAppStore((s) => s.markClean);
  const setContent = useAppStore((s) => s.setContent);
  const theme = useAppStore((s) => s.theme);
  const themePreference = useAppStore((s) => s.themePreference);
  const setSystemTheme = useAppStore((s) => s.setSystemTheme);
  const setThemePreference = useAppStore((s) => s.setThemePreference);
  const toggleSourceMode = useAppStore((s) => s.toggleSourceMode);
  const setWorkspaceFolders = useSidebarStore((s) => s.setWorkspaceFolders);
  const addFolder = useSidebarStore((s) => s.addFolder);
  const removeFolder = useSidebarStore((s) => s.removeFolder);
  const updateGitStatus = useSidebarStore((s) => s.updateGitStatus);
  const toggleSidebarVisible = useSidebarStore((s) => s.toggleVisible);
  const showWith = useSidebarStore((s) => s.showWith);
  const toggleRightSidebarVisible = useRightSidebarStore((s) => s.toggleVisible);
  const rightSidebarShowWith = useRightSidebarStore((s) => s.showWith);
  const memoPanelManuallyHidden = useMemoPanelStore((s) => s.manuallyHidden);
  const setMemoPanelManuallyHidden = useMemoPanelStore((s) => s.setManuallyHidden);
  const toggleMemoPanel = useMemoPanelStore((s) => s.toggle);
  const setMemoPanelFocusedFrom = useMemoPanelStore((s) => s.setFocusedFrom);
  const setMemoPanelWidth = useMemoPanelStore((s) => s.setWidth);
  const [macros, setMacros] = useState<Macro[]>([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [citationDialogOpen, setCitationDialogOpen] = useState(false);
  const [citePaletteOpen, setCitePaletteOpen] = useState(false);
  const [bulkDoiOpen, setBulkDoiOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [aiPaletteState, setAiPaletteState] = useState<{
    open: boolean;
    selection: string;
    paragraph: string;
    /** Editor offsets so accept can replace the right range. */
    from: number;
    to: number;
    hasKey: boolean;
  }>({ open: false, selection: '', paragraph: '', from: 0, to: 0, hasKey: false });
  const [citeSuggestState, setCiteSuggestState] = useState<{
    open: boolean;
    paragraph: string;
    insertAt: number;
    hasKey: boolean;
  }>({ open: false, paragraph: '', insertAt: 0, hasKey: false });
  const [importState, setImportState] = useState<{
    open: boolean;
    entries: BibEntry[];
    warnings: string[];
    format: 'bibtex' | 'ris' | null;
    sourcePath: string | null;
  }>({ open: false, entries: [], warnings: [], format: null, sourcePath: null });
  // When Pandoc is missing, we surface a guided install dialog and remember
  // the operation that triggered it so the user can retry after installing.
  const [pandocInstallOp, setPandocInstallOp] = useState<
    | { kind: 'export'; format: 'docx' | 'latex' }
    | { kind: 'import' }
    | { kind: 'configure' }
    | null
  >(null);
  const { setLang } = useLanguage();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    void window.api.macrosGet().then(setMacros);
    return window.api.onMacrosChanged(setMacros);
  }, []);

  useEffect(() => {
    return window.api.onThemeChanged((t) => setSystemTheme(t));
  }, [setSystemTheme]);

  useEffect(() => {
    void window.api.prefsGet().then((prefs) => {
      setThemePreference(prefs.theme);
      setLang(resolveRendererLang(prefs.language));
      const folders = prefs.workspaceFolders ?? [];
      setWorkspaceFolders(folders);
      for (const p of folders) {
        void window.api.fsWatchRoot(p);
        void window.api.gitGetStatus(p).then((s) => updateGitStatus(p, s)).catch(() => {});
      }
      if (prefs.sidebar) {
        useSidebarStore.setState({
          visible: prefs.sidebar.visible,
          activeTab: prefs.sidebar.activeTab,
          width: prefs.sidebar.width,
        });
      }
      if (prefs.rightSidebar) {
        useRightSidebarStore.setState({
          visible: prefs.rightSidebar.visible,
          activeTab: prefs.rightSidebar.activeTab,
          width: prefs.rightSidebar.width,
        });
      }
      if (prefs.memoPanel) {
        setMemoPanelWidth(prefs.memoPanel.width);
      }
      if (prefs.author?.name) {
        useMemoSidecarStore.getState().setAuthor(prefs.author.name);
      }
    });
  }, [setThemePreference, setWorkspaceFolders, updateGitStatus, setLang, setMemoPanelWidth]);

  // Reset the per-session "manually hidden" flag whenever the user opens or
  // creates a different file. Otherwise closing the panel on doc A would
  // leave it hidden when they switch to doc B that has many memos.
  useEffect(() => {
    setMemoPanelManuallyHidden(false);
  }, [filePath, setMemoPanelManuallyHidden]);

  // Load the per-document memo sidecar metadata whenever the file path
  // changes. The store handles autosaving in-memory edits with a 1s debounce.
  useEffect(() => {
    void useMemoSidecarStore.getState().loadFor(filePath);
  }, [filePath]);

  // Bind the bibliography store to the active document. Discovers the existing
  // .bib (32-level walk) or, when none, records the path that ensureBibFile
  // would create — both enable Cmd+Shift+B "Insert citation from DOI".
  useEffect(() => {
    void useBibliographyStore.getState().bindToDocument(filePath);
  }, [filePath]);

  // Prune orphaned sidecar entries against the live set of memo ids in the
  // current source. Runs on every parsed-content change with a 7-day grace
  // window so an undo can still bring memos (and their threads) back.
  useEffect(() => {
    const memos = parseComments(content);
    const ids = new Set(memos.map((m) => memoIdFor(m)));
    const cur = useMemoSidecarStore.getState().sidecar;
    const next = pruneOrphans(cur, ids, new Date());
    if (next !== cur) {
      useMemoSidecarStore.getState().setSidecar(next, true);
    }
  }, [content]);

  // Listen for `durumi:memo-focus` events bubbling out of the editor's chat
  // icons. Forward to the panel store so the matching card scrolls + pulses.
  useEffect(() => {
    function onMemoFocus(e: Event) {
      const ev = e as CustomEvent<{ from: number }>;
      // If the user closed the panel earlier this session, clicking an icon
      // should reopen it.
      setMemoPanelManuallyHidden(false);
      setMemoPanelFocusedFrom(ev.detail?.from ?? null);
    }
    function onMemoPanelToggle() {
      toggleMemoPanel();
    }
    // v0.1.7 — citation hover tooltip / sidebar fire `durumi:reference-open`
    // to request opening a local file from `<doc-folder>/reference/`.
    function onReferenceOpen(e: Event) {
      const ev = e as CustomEvent<{ relPath: string; citationKey: string }>;
      const bibPath = useBibliographyStore.getState().filePath;
      if (!bibPath || !ev.detail?.relPath) return;
      void window.api.referenceOpen(bibPath, ev.detail.relPath);
    }
    window.addEventListener('durumi:memo-focus', onMemoFocus as EventListener);
    window.addEventListener('durumi:memo-panel-toggle', onMemoPanelToggle as EventListener);
    window.addEventListener('durumi:reference-open', onReferenceOpen as EventListener);
    return () => {
      window.removeEventListener('durumi:memo-focus', onMemoFocus as EventListener);
      window.removeEventListener('durumi:memo-panel-toggle', onMemoPanelToggle as EventListener);
      window.removeEventListener('durumi:reference-open', onReferenceOpen as EventListener);
    };
  }, [setMemoPanelFocusedFrom, setMemoPanelManuallyHidden, toggleMemoPanel]);

  // Auto-focus the matching card when the caret lands on a memo's line.
  useMemoCaretFocus(editorViewRef.current, content);

  // Re-fetch git status when the main process broadcasts an invalidation.
  useEffect(() => {
    return window.api.onGitStatusChanged((root) => {
      void window.api.gitGetStatus(root).then((s) => updateGitStatus(root, s)).catch(() => {});
    });
  }, [updateGitStatus]);

  useEffect(() => {
    const name = basenameOf(filePath);
    void window.api.windowSetTitle(`${isDirty ? '● ' : ''}${name} — Durumi`);
  }, [filePath, isDirty]);

  async function doSave(): Promise<boolean> {
    if (filePath) {
      await window.api.fileSave(filePath, content);
      // Force-flush any pending sidecar edits next to the document so a Cmd+S
      // never leaves thread/resolved changes in memory only.
      await useMemoSidecarStore.getState().saveIfDirty();
      markClean();
      return true;
    }
    const r = await window.api.fileSaveAs(content, 'untitled.md');
    if (!r) return false;
    setFile(r.path, content);
    // After Save As, re-bind the sidecar to the new path so subsequent edits
    // land alongside the just-saved document.
    await useMemoSidecarStore.getState().loadFor(r.path);
    await useMemoSidecarStore.getState().saveIfDirty();
    markClean();
    return true;
  }

  async function maybeDiscard(): Promise<boolean> {
    if (!isDirty) return true;
    const choice = await window.api.confirmDiscard(basenameOf(filePath));
    if (choice === 'cancel') return false;
    if (choice === 'save') return doSave();
    return true;
  }

  async function loadBibliography(): Promise<string | null> {
    const roots = useSidebarStore.getState().workspaceFolders;
    const hit = await window.api.bibliographyFind(filePath, roots);
    return hit?.source ?? null;
  }

  async function doExport(format: 'html' | 'pdf'): Promise<void> {
    const baseName = basenameOf(filePath, 'untitled');
    const title = stripMarkdownExt(baseName) || 'untitled';
    const suggested = stripMarkdownExt(baseName) + `.${format}`;
    const customCss = await window.api.customCssGet();
    const bibliography = await loadBibliography();
    const prefs = await window.api.prefsGet();
    const includeComments = prefs.exportIncludeComments ?? false;
    const preserveAnnotations = prefs.exportPreserveAnnotations ?? false;
    const html = await renderHtml(content, title, customCss, {
      bibliography,
      includeComments,
      preserveAnnotations,
    });
    await window.api.exportFile(html, format, suggested);
  }

  async function doPandocExport(format: 'docx' | 'latex'): Promise<void> {
    const baseName = basenameOf(filePath, 'untitled');
    const ext = format === 'docx' ? 'docx' : 'tex';
    const suggested = stripMarkdownExt(baseName) + `.${ext}`;
    // Pre-process the source so Pandoc never sees raw `%%` memos. Pandoc's
    // LaTeX writer would otherwise leak the body as `%`-prefixed comments
    // sitting in the .tex source — invisible in the rendered PDF but
    // present in any file the user shares with a journal.
    const prefs = await window.api.prefsGet();
    const includeComments = prefs.exportIncludeComments ?? false;
    const preserveAnnotations = prefs.exportPreserveAnnotations ?? false;
    // Two-pass: comments first (memo policy), then CriticMarkup. Order
    // matters because a `%% memo %%` may wrap a `{++ ... ++}` run, and we
    // want the comment policy to win at the outer level.
    const afterComments = includeComments
      ? promoteComments(content)
      : stripComments(content);
    const transformed = transformCm(
      afterComments,
      preserveAnnotations ? 'preserve' : 'accept',
      'pandoc',
    );
    const result = await window.api.pandocExport(transformed, format, suggested, filePath);
    if (result && 'error' in result) {
      if (result.code === 'pandoc-missing') {
        setPandocInstallOp({ kind: 'export', format });
        return;
      }
      window.alert(`Export failed: ${result.error}${result.stderr ? `\n\n${result.stderr}` : ''}`);
    }
  }

  async function doPandocImportDocx(): Promise<void> {
    if (!(await maybeDiscard())) return;
    const r = await window.api.pandocImport('docx');
    if (!r) return;
    if ('error' in r) {
      if (r.code === 'pandoc-missing') {
        setPandocInstallOp({ kind: 'import' });
        return;
      }
      window.alert(`Import failed: ${r.error}${r.stderr ? `\n\n${r.stderr}` : ''}`);
      return;
    }
    setFile(null, r.markdown);
  }

  useEffect(() => {
    return window.api.onMenuCommand(async (cmd: MenuCommand) => {
      const view = editorViewRef.current;
      if (cmd === 'new') {
        if (!(await maybeDiscard())) return;
        setFile(null, '');
        return;
      }
      if (cmd === 'open') {
        if (!(await maybeDiscard())) return;
        const r = await window.api.fileOpen();
        if (r) setFile(r.path, r.content);
        return;
      }
      if (cmd === 'save') { await doSave(); return; }
      if (cmd === 'saveAs') {
        const r = await window.api.fileSaveAs(content, basenameOf(filePath));
        if (r) { setFile(r.path, content); markClean(); }
        return;
      }
      if (cmd === 'exportHtml') { await doExport('html'); return; }
      if (cmd === 'exportPdf') { await doExport('pdf'); return; }
      if (cmd === 'exportDocx') { await doPandocExport('docx'); return; }
      if (cmd === 'exportLatex') { await doPandocExport('latex'); return; }
      if (cmd === 'importDocx') { await doPandocImportDocx(); return; }
      if (cmd === 'toggleTheme') {
        const currentTheme = useAppStore.getState().theme;
        const next = currentTheme === 'dark' ? 'light' : 'dark';
        setThemePreference(next);
        void window.api.prefsSet({ theme: next });
        return;
      }
      if (cmd === 'toggleSourceMode') { toggleSourceMode(); return; }
      if (cmd === 'openFolder') {
        const p = await window.api.dialogOpenFolder();
        if (p) {
          const current = useSidebarStore.getState().workspaceFolders;
          if (!current.includes(p)) {
            addFolder(p);
            void window.api.fsWatchRoot(p);
            void window.api.gitGetStatus(p).then((s) => updateGitStatus(p, s)).catch(() => {});
            void window.api.prefsSet({ workspaceFolders: [...current, p] });
          }
        }
        return;
      }
      if (cmd === 'toggleSidebar') { toggleSidebarVisible(); return; }
      if (cmd === 'toggleRightSidebar') { toggleRightSidebarVisible(); return; }
      if (cmd === 'toggleMemoPanel') { toggleMemoPanel(); return; }
      if (cmd === 'showFiles') { showWith('files'); return; }
      if (cmd === 'showOutline') { showWith('outline'); return; }
      if (cmd === 'showSearch') { showWith('search'); return; }
      if (cmd === 'showMemos') { showWith('comments'); return; }
      if (cmd === 'showChanges') { showWith('changes'); return; }
      if (cmd === 'showReferences') { rightSidebarShowWith('references'); return; }
      if (cmd === 'showAi') { rightSidebarShowWith('ai'); return; }
      if (cmd === 'openKeyboardShortcuts') { setShortcutsOpen(true); return; }
      if (cmd === 'addMemo' && view) { wrapComment(view); view.focus(); return; }
      if (cmd === 'cmInsert' && view) { wrapCmInsert(view); view.focus(); return; }
      if (cmd === 'cmDelete' && view) { wrapCmDelete(view); view.focus(); return; }
      if (cmd === 'cmSubstitute' && view) { wrapCmSubstitute(view); view.focus(); return; }
      if (cmd === 'cmHighlight' && view) { wrapCmHighlight(view); view.focus(); return; }
      if (cmd === 'cmComment' && view) { wrapCmComment(view); view.focus(); return; }
      if (cmd === 'nextMemo' && view) { nextMemo(view); view.focus(); return; }
      if (cmd === 'prevMemo' && view) { prevMemo(view); view.focus(); return; }
      if (cmd === 'toggleExportIncludeComments') {
        const prefs = await window.api.prefsGet();
        await window.api.prefsSet({ exportIncludeComments: !prefs.exportIncludeComments });
        return;
      }
      if (cmd === 'toggleExportPreserveAnnotations') {
        const prefs = await window.api.prefsGet();
        await window.api.prefsSet({ exportPreserveAnnotations: !prefs.exportPreserveAnnotations });
        return;
      }
      if (cmd === 'quickOpen') { setQuickOpen(true); return; }
      if (cmd === 'openSettings') { setSettingsOpen(true); return; }
      if (cmd === 'insertCitationFromDoi') { setCitationDialogOpen(true); return; }
      if (cmd === 'bulkInsertFromDoi') { setBulkDoiOpen(true); return; }
      if (cmd === 'importReferences') {
        const picked = await window.api.dialogPickFile({
          title: 'Import references',
          filters: [
            { name: 'BibTeX / RIS', extensions: ['bib', 'bibtex', 'ris'] },
            { name: 'All files', extensions: ['*'] },
          ],
        });
        if (picked) await openImportDialog(picked);
        return;
      }
      if (cmd === 'aiCitationSuggest') {
        const v = view;
        if (!v) return;
        const para = currentParagraph(v.state);
        const [hasA, hasO] = await Promise.all([
          window.api.aiHasKey('anthropic'),
          window.api.aiHasKey('openai-compatible'),
        ]);
        setCiteSuggestState({
          open: true,
          paragraph: para?.text ?? '',
          insertAt: para?.to ?? v.state.selection.main.head,
          hasKey: hasA || hasO,
        });
        return;
      }
      if (cmd === 'openCitePalette') { setCitePaletteOpen(true); return; }
      if (cmd === 'openAiPalette') {
        const v = view;
        if (!v) return;
        const sel = v.state.selection.main;
        const selection = v.state.sliceDoc(sel.from, sel.to);
        const para = currentParagraph(v.state);
        const [hasA, hasO] = await Promise.all([
          window.api.aiHasKey('anthropic'),
          window.api.aiHasKey('openai-compatible'),
        ]);
        setAiPaletteState({
          open: true,
          selection,
          paragraph: para?.text ?? selection,
          from: sel.from,
          to: sel.to,
          hasKey: hasA || hasO,
        });
        return;
      }
      if (cmd === 'toggleFocusMode' && view) {
        const cur = view.state.field(focusModeField, false);
        view.dispatch({ effects: setFocusMode.of(!cur) });
        return;
      }
      if (cmd === 'toggleTypewriterMode' && view) {
        const cur = view.state.field(typewriterModeField, false);
        view.dispatch({ effects: setTypewriterMode.of(!cur) });
        return;
      }
      if (cmd === 'languageChanged') {
        // Main process already updated prefs + rebuilt the menu; just
        // re-fetch so we apply the new resolved language to React.
        const prefs = await window.api.prefsGet();
        setLang(resolveRendererLang(prefs.language));
        return;
      }
      if (cmd === 'bold' && view) { toggleWrap(view, '**'); view.focus(); return; }
      if (cmd === 'italic' && view) { toggleWrap(view, '*'); view.focus(); return; }
      if (cmd === 'code' && view) { toggleWrap(view, '`'); view.focus(); return; }
      if (cmd === 'strikethrough' && view) { toggleWrap(view, '~~'); view.focus(); return; }
      if (cmd === 'insertTable' && view) { insertTableHelper(view); view.focus(); return; }
      if (cmd === 'toggleTask' && view) { toggleTaskHelper(view); view.focus(); return; }
      if (cmd === 'codeBlock' && view) { insertCodeBlockHelper(view); view.focus(); return; }
      if (cmd === 'find' && view) { openSearch(view); return; }
      if (cmd === 'findAndReplace' && view) { openSearchAndReplace(view); return; }
      if (cmd === 'findNext' && view) { gotoNext(view); view.focus(); return; }
      if (cmd === 'findPrev' && view) { gotoPrev(view); view.focus(); return; }
      if (cmd === 'link' && view) {
        const { from, to } = view.state.selection.main;
        const text = view.state.sliceDoc(from, to);
        const insert = `[${text}]()`;
        view.dispatch({ changes: { from, to, insert } });
        view.focus();
        return;
      }
      if (typeof cmd === 'object' && cmd !== null && 'type' in cmd) {
        if (cmd.type === 'heading' && view) { setHeading(view, cmd.level); view.focus(); return; }
        if (cmd.type === 'openRecent') {
          if (!(await maybeDiscard())) return;
          const r = await window.api.fileOpenPath(cmd.path);
          setFile(r.path, r.content);
          return;
        }
        if (cmd.type === 'closeFolder') {
          // Main process already updated prefs + unwatched the root.
          removeFolder(cmd.path);
          return;
        }
        if (cmd.type === 'newFromTemplate') {
          const tpl = findTemplate(cmd.templateId);
          if (!tpl) return;
          if (!(await maybeDiscard())) return;
          setFile(null, tpl.content);
          return;
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, content, isDirty, themePreference, addFolder, removeFolder, updateGitStatus, toggleSidebarVisible, showWith, toggleMemoPanel]);

  useEffect(() => {
    return window.api.onAppRequestClose(async () => {
      const state = useAppStore.getState();
      if (!state.isDirty) return true;
      const choice = await window.api.confirmDiscard(basenameOf(state.filePath));
      if (choice === 'cancel') return false;
      if (choice === 'discard') return true;
      // 'save'
      try {
        if (state.filePath) {
          await window.api.fileSave(state.filePath, state.content);
          useAppStore.getState().markClean();
          return true;
        }
        const r = await window.api.fileSaveAs(state.content, 'untitled.md');
        if (!r) return false;
        useAppStore.getState().setFile(r.path, state.content);
        useAppStore.getState().markClean();
        return true;
      } catch {
        return false;
      }
    });
  }, []);

  useEffect(() => {
    let active = true;
    void window.api.customCssGet().then((css) => {
      if (!active) return;
      upsertCustomCssTag(css);
    });
    const unsub = window.api.onCustomCssChanged((css) => upsertCustomCssTag(css));
    return () => {
      active = false;
      unsub();
    };
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0 }}>
        <Sidebar
          content={content}
          view={editorViewRef.current}
          onApplyOutlineMove={(newDoc) => setContent(newDoc)}
          onOpenFile={async (p) => {
            if (!(await maybeDiscard())) return;
            const r = await window.api.fileOpenPath(p);
            setFile(r.path, r.content);
          }}
          onOpenHit={async (absPath, line) => {
            if (!(await maybeDiscard())) return;
            const r = await window.api.fileOpenPath(absPath);
            setFile(r.path, r.content);
            // Defer line jump until after the editor mounts the new doc.
            setTimeout(() => {
              const view = editorViewRef.current;
              if (!view) return;
              const safeLine = Math.min(Math.max(line, 1), view.state.doc.lines);
              const info = view.state.doc.line(safeLine);
              view.dispatch({
                selection: { anchor: info.from },
                effects: EditorView.scrollIntoView(info.from, { y: 'center' }),
              });
              view.focus();
            }, 50);
          }}
        />
        <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
          <MarkdownEditor
            value={content}
            onChange={setContent}
            onReady={(v) => { editorViewRef.current = v; }}
            filePath={filePath}
            macros={macros}
          />
        </div>
        <MemoPanel
          view={editorViewRef.current}
          content={content}
          visible={parseComments(content).length > 0 && !memoPanelManuallyHidden}
          onClose={() => setMemoPanelManuallyHidden(true)}
        />
        <RightSidebar
          content={content}
          view={editorViewRef.current}
          onInsertCitation={(key) => insertCitationAtCaret(`[@${key}]`)}
          onCitationRenamed={migrateCitationsInDoc}
          onOpenAiPalette={() => {
            const v = editorViewRef.current;
            if (!v) return;
            const sel = v.state.selection.main;
            const selection = v.state.sliceDoc(sel.from, sel.to);
            const para = currentParagraph(v.state);
            void Promise.all([
              window.api.aiHasKey('anthropic'),
              window.api.aiHasKey('openai-compatible'),
            ]).then(([hasA, hasO]) => {
              setAiPaletteState({
                open: true,
                selection,
                paragraph: para?.text ?? selection,
                from: sel.from,
                to: sel.to,
                hasKey: hasA || hasO,
              });
            });
          }}
          onSuggestCitations={() => {
            const v = editorViewRef.current;
            if (!v) return;
            const para = currentParagraph(v.state);
            void Promise.all([
              window.api.aiHasKey('anthropic'),
              window.api.aiHasKey('openai-compatible'),
            ]).then(([hasA, hasO]) => {
              setCiteSuggestState({
                open: true,
                paragraph: para?.text ?? '',
                insertAt: para?.to ?? v.state.selection.main.head,
                hasKey: hasA || hasO,
              });
            });
          }}
          onInsertCitationFromDoi={() => setCitationDialogOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>
      <StatusBar />
      <QuickOpen
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onPick={async (p) => {
          if (!(await maybeDiscard())) return;
          const r = await window.api.fileOpenPath(p);
          setFile(r.path, r.content);
        }}
      />
      <PandocInstallDialog
        open={pandocInstallOp !== null}
        onClose={() => setPandocInstallOp(null)}
        onResolved={() => {
          const op = pandocInstallOp;
          setPandocInstallOp(null);
          if (!op) return;
          if (op.kind === 'export') {
            void doPandocExport(op.format);
          } else if (op.kind === 'import') {
            void doPandocImportDocx();
          }
          // 'configure': nothing to retry — the user opened the install dialog
          // from Settings just to get pandoc on the system.
        }}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onRequestPandocInstall={() => {
          setSettingsOpen(false);
          setPandocInstallOp({ kind: 'configure' });
        }}
      />
      <InsertCitationDialog
        open={citationDialogOpen}
        onClose={() => setCitationDialogOpen(false)}
        onInsert={insertCitationAtCaret}
      />
      <CitePalette
        open={citePaletteOpen}
        onClose={() => setCitePaletteOpen(false)}
        onPick={(key) => insertCitationAtCaret(`[@${key}]`)}
      />
      <BulkDoiDialog
        open={bulkDoiOpen}
        onClose={() => setBulkDoiOpen(false)}
      />
      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      <ImportReferencesDialog
        open={importState.open}
        entries={importState.entries}
        warnings={importState.warnings}
        format={importState.format}
        sourcePath={importState.sourcePath}
        onClose={() => setImportState((s) => ({ ...s, open: false }))}
      />
      <AiCommandPalette
        open={aiPaletteState.open}
        selection={aiPaletteState.selection}
        paragraph={aiPaletteState.paragraph}
        hasKey={aiPaletteState.hasKey}
        onClose={() => setAiPaletteState((s) => ({ ...s, open: false }))}
        onAccept={(rewritten) => {
          const v = editorViewRef.current;
          if (!v) return;
          v.dispatch({
            changes: { from: aiPaletteState.from, to: aiPaletteState.to, insert: rewritten },
            selection: { anchor: aiPaletteState.from + rewritten.length },
          });
          v.focus();
        }}
      />
      <CitationSuggestPanel
        open={citeSuggestState.open}
        paragraph={citeSuggestState.paragraph}
        hasKey={citeSuggestState.hasKey}
        onClose={() => setCiteSuggestState((s) => ({ ...s, open: false }))}
        onAccept={(key) => {
          const v = editorViewRef.current;
          if (!v) return;
          // Insert `[@key]` right after the paragraph (at insertAt).
          // Putting it at paragraph end avoids guessing intra-sentence
          // placement; the user can drag-cut it elsewhere if needed.
          const insertion = ` [@${key}]`;
          v.dispatch({
            changes: { from: citeSuggestState.insertAt, insert: insertion },
            selection: { anchor: citeSuggestState.insertAt + insertion.length },
          });
          v.focus();
          setCiteSuggestState((s) => ({ ...s, open: false }));
        }}
      />
    </div>
  );

  async function openImportDialog(sourcePath: string) {
    const r = await window.api.bibliographyImportFile(sourcePath);
    if (!r.ok) {
      // eslint-disable-next-line no-alert
      window.alert(`Could not read ${sourcePath}: ${r.error}`);
      return;
    }
    setImportState({
      open: true,
      entries: r.entries,
      warnings: r.warnings,
      format: r.format,
      sourcePath,
    });
  }

  function insertCitationAtCaret(citation: string) {
    const view = editorViewRef.current;
    if (!view) return;
    const single = citation.match(/^\[@([^\]\s;,]+)\]$/);
    if (single) {
      const outcome = insertCitationSmart(
        view.state.doc.toString(),
        view.state.selection.main.from,
        single[1],
      );
      if (outcome.kind === 'duplicate') {
        // eslint-disable-next-line no-alert
        window.alert(t('toast.bibliography.citationDuplicate'));
        view.focus();
        return;
      }
      view.dispatch({
        changes: { from: outcome.from, to: outcome.to, insert: outcome.insert },
        selection: { anchor: outcome.caret },
      });
      view.focus();
      return;
    }
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: citation },
      selection: { anchor: from + citation.length },
    });
    view.focus();
  }

  /**
   * After the bib `renameEntryKey` action commits, walk the active editor
   * doc and replace `[@oldKey]` with `[@newKey]` in a single transaction
   * so all references migrate atomically (undo as one unit).
   */
  function migrateCitationsInDoc(oldKey: string, newKey: string) {
    const view = editorViewRef.current;
    if (!view) return;
    // Lazy import keeps the boot path lean.
    void import('../shared/citationKey').then(({ renameCitationKeyChanges }) => {
      const v = editorViewRef.current;
      if (!v) return;
      const changes = renameCitationKeyChanges(
        v.state.doc.toString(),
        oldKey,
        newKey,
      );
      if (changes.length === 0) return;
      v.dispatch({ changes });
    });
  }
}
