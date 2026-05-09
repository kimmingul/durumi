import { useEffect, useRef, useState } from 'react';
import { MarkdownEditor } from './editor/MarkdownEditor';
import { StatusBar } from './components/StatusBar';
import { Sidebar } from './components/Sidebar';
import { MemoPanel } from './components/MemoPanel';
import { QuickOpen } from './components/QuickOpen';
import { PandocInstallDialog } from './components/PandocInstallDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { useAppStore } from './store/appStore';
import { useSidebarStore } from './store/sidebarStore';
import { useMemoPanelStore } from './store/memoPanelStore';
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
import { openSearch, openSearchAndReplace, gotoNext, gotoPrev } from './editor/openSearch';
import { renderHtml } from './export/renderHtml';
import { promoteComments, stripComments } from '../shared/comments';
import { findTemplate } from '../shared/manuscriptTemplates';
import { useLanguage, resolveRendererLang } from './i18n/t';
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
  const memoPanelManuallyHidden = useMemoPanelStore((s) => s.manuallyHidden);
  const setMemoPanelManuallyHidden = useMemoPanelStore((s) => s.setManuallyHidden);
  const toggleMemoPanel = useMemoPanelStore((s) => s.toggle);
  const setMemoPanelFocusedFrom = useMemoPanelStore((s) => s.setFocusedFrom);
  const setMemoPanelWidth = useMemoPanelStore((s) => s.setWidth);
  const [macros, setMacros] = useState<Macro[]>([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
      if (prefs.memoPanel) {
        setMemoPanelWidth(prefs.memoPanel.width);
      }
    });
  }, [setThemePreference, setWorkspaceFolders, updateGitStatus, setLang, setMemoPanelWidth]);

  // Reset the per-session "manually hidden" flag whenever the user opens or
  // creates a different file. Otherwise closing the panel on doc A would
  // leave it hidden when they switch to doc B that has many memos.
  useEffect(() => {
    setMemoPanelManuallyHidden(false);
  }, [filePath, setMemoPanelManuallyHidden]);

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
    window.addEventListener('durumi:memo-focus', onMemoFocus as EventListener);
    window.addEventListener('durumi:memo-panel-toggle', onMemoPanelToggle as EventListener);
    return () => {
      window.removeEventListener('durumi:memo-focus', onMemoFocus as EventListener);
      window.removeEventListener('durumi:memo-panel-toggle', onMemoPanelToggle as EventListener);
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
      markClean();
      return true;
    }
    const r = await window.api.fileSaveAs(content, 'untitled.md');
    if (!r) return false;
    setFile(r.path, content);
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
    const html = await renderHtml(content, title, customCss, { bibliography, includeComments });
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
    const transformed = includeComments ? promoteComments(content) : stripComments(content);
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
      if (cmd === 'toggleMemoPanel') { toggleMemoPanel(); return; }
      if (cmd === 'showFiles') { showWith('files'); return; }
      if (cmd === 'showOutline') { showWith('outline'); return; }
      if (cmd === 'showSearch') { showWith('search'); return; }
      if (cmd === 'quickOpen') { setQuickOpen(true); return; }
      if (cmd === 'openSettings') { setSettingsOpen(true); return; }
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
    </div>
  );
}
