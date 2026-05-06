import { useEffect, useRef, useState } from 'react';
import { MarkdownEditor } from './editor/MarkdownEditor';
import { StatusBar } from './components/StatusBar';
import { Sidebar } from './components/Sidebar';
import { useAppStore } from './store/appStore';
import { useSidebarStore } from './store/sidebarStore';
import type { Macro, MenuCommand } from '@shared/ipc-contract';
import type { EditorView } from '@codemirror/view';
import { toggleWrap } from './editor/keymap/toggleWrap';
import { setHeading } from './editor/keymap/setHeading';
import { insertTable as insertTableHelper } from './editor/keymap/insertTable';
import { insertCodeBlock as insertCodeBlockHelper } from './editor/keymap/insertCodeBlock';
import { toggleTask as toggleTaskHelper } from './editor/keymap/toggleTask';
import { openSearch, openSearchAndReplace, gotoNext, gotoPrev } from './editor/openSearch';
import { renderHtml } from './export/renderHtml';
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
  const [macros, setMacros] = useState<Macro[]>([]);
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
    });
  }, [setThemePreference, setWorkspaceFolders, updateGitStatus, setLang]);

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

  async function doExport(format: 'html' | 'pdf'): Promise<void> {
    const baseName = basenameOf(filePath, 'untitled');
    const title = stripMarkdownExt(baseName) || 'untitled';
    const suggested = stripMarkdownExt(baseName) + `.${format}`;
    const customCss = await window.api.customCssGet();
    const html = await renderHtml(content, title, customCss);
    await window.api.exportFile(html, format, suggested);
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
      if (cmd === 'showFiles') { showWith('files'); return; }
      if (cmd === 'showOutline') { showWith('outline'); return; }
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
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, content, isDirty, themePreference, addFolder, removeFolder, updateGitStatus, toggleSidebarVisible, showWith]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

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
          onOpenFile={async (p) => {
            if (!(await maybeDiscard())) return;
            const r = await window.api.fileOpenPath(p);
            setFile(r.path, r.content);
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
      </div>
      <StatusBar />
    </div>
  );
}
