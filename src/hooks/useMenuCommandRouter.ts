import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import type { MenuCommand } from '@shared/ipc-contract';
import { useAppStore } from '../store/appStore';
import { useSidebarStore } from '../store/sidebarStore';
import { useRightSidebarStore } from '../store/rightSidebarStore';
import { useMemoPanelStore } from '../store/memoPanelStore';
import { useLanguage, resolveRendererLang } from '../i18n/t';
import { currentParagraph } from '../editor/paragraphContext';
import { focusModeField, setFocusMode, setTypewriterMode, typewriterModeField } from '../editor/viewModes';
import { toggleWrap } from '../editor/keymap/toggleWrap';
import { setHeading } from '../editor/keymap/setHeading';
import { insertTable as insertTableHelper } from '../editor/keymap/insertTable';
import { insertCodeBlock as insertCodeBlockHelper } from '../editor/keymap/insertCodeBlock';
import { toggleTask as toggleTaskHelper } from '../editor/keymap/toggleTask';
import { wrapComment } from '../editor/keymap/wrapComment';
import {
  wrapCmInsert,
  wrapCmDelete,
  wrapCmSubstitute,
  wrapCmHighlight,
  wrapCmComment,
} from '../editor/keymap/wrapCriticMarkup';
import { nextMemo, prevMemo } from '../editor/keymap/memoNav';
import { openSearch, openSearchAndReplace, gotoNext, gotoPrev } from '../editor/openSearch';
import { findTemplate } from '@shared/manuscriptTemplates';
import type { FileMenuCommands } from './useFileMenuCommands';
import type { ExportFlow } from './useExportFlow';
import type { CitationInsertFlow } from './useCitationInsertFlow';
import type { AiPalette } from './useAiPalette';
import type { WorkspaceMenu } from './useWorkspaceMenu';

interface MenuCommandRouterDeps {
  editorViewRef: RefObject<EditorView | null>;
  fileCommands: FileMenuCommands;
  exportFlow: ExportFlow;
  citationFlow: CitationInsertFlow;
  aiPalette: AiPalette;
  workspace: WorkspaceMenu;
  setQuickOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
}

/**
 * Central dispatcher for `window.api.onMenuCommand`. Translates every
 * `MenuCommand` variant into the right action across the file / export /
 * citation / AI palette / workspace / editor-formatting subsystems.
 *
 * Reads the active appStore slice (`filePath`, `content`, `isDirty`,
 * `themePreference`) so the subscription re-binds whenever those snapshots
 * change — without that, async menu handlers would close over stale values.
 *
 * Every menu command in the renderer routes through here; if you add a new
 * `MenuCommand`, add its branch in this hook and not back in App.tsx.
 */
export function useMenuCommandRouter(deps: MenuCommandRouterDeps): void {
  const {
    editorViewRef,
    fileCommands,
    exportFlow,
    citationFlow,
    aiPalette,
    workspace,
    setQuickOpen,
    setSettingsOpen,
    setShortcutsOpen,
  } = deps;

  const filePath = useAppStore((s) => s.filePath);
  const content = useAppStore((s) => s.content);
  const isDirty = useAppStore((s) => s.isDirty);
  const themePreference = useAppStore((s) => s.themePreference);
  const setThemePreference = useAppStore((s) => s.setThemePreference);
  const setEditModeStore = useAppStore((s) => s.setEditMode);
  const toggleSourceMode = useAppStore((s) => s.toggleSourceMode);
  const toggleSidebarVisible = useSidebarStore((s) => s.toggleVisible);
  const showWith = useSidebarStore((s) => s.showWith);
  const toggleRightSidebarVisible = useRightSidebarStore((s) => s.toggleVisible);
  const rightSidebarShowWith = useRightSidebarStore((s) => s.showWith);
  const toggleMemoPanel = useMemoPanelStore((s) => s.toggle);
  const { setLang } = useLanguage();

  useEffect(() => {
    return window.api.onMenuCommand(async (cmd: MenuCommand) => {
      const view = editorViewRef.current;
      if (cmd === 'new') { await fileCommands.doNew(); return; }
      if (cmd === 'open') { await fileCommands.doOpen(); return; }
      if (cmd === 'save') { await fileCommands.doSave(); return; }
      if (cmd === 'saveAs') { await fileCommands.doSaveAs(); return; }
      if (cmd === 'exportHtml') { await exportFlow.doExport('html'); return; }
      if (cmd === 'exportPdf') { await exportFlow.doExport('pdf'); return; }
      if (cmd === 'exportDocx') { await exportFlow.doPandocExport('docx'); return; }
      if (cmd === 'exportLatex') { await exportFlow.doPandocExport('latex'); return; }
      if (cmd === 'importDocx') { await exportFlow.doPandocImportDocx(); return; }
      if (cmd === 'toggleTheme') {
        const currentTheme = useAppStore.getState().theme;
        const next = currentTheme === 'dark' ? 'light' : 'dark';
        setThemePreference(next);
        void window.api.prefsSet({ theme: next });
        return;
      }
      if (cmd === 'toggleSourceMode') {
        toggleSourceMode();
        // Persist the resulting mode so the menu radio + next session match.
        void window.api.prefsSet({ editor: { defaultMode: useAppStore.getState().editMode } });
        return;
      }
      if (typeof cmd === 'object' && cmd.type === 'setEditMode') {
        setEditModeStore(cmd.mode);
        void window.api.prefsSet({ editor: { defaultMode: cmd.mode } });
        return;
      }
      if (cmd === 'openFolder') { await workspace.openWorkspaceFolder(); return; }
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
      if (cmd === 'insertCitationFromDoi') { citationFlow.setCitationDialogOpen(true); return; }
      if (cmd === 'bulkInsertFromDoi') { citationFlow.setBulkDoiOpen(true); return; }
      if (cmd === 'importReferences') {
        const picked = await window.api.dialogPickFile({
          title: 'Import references',
          filters: [
            { name: 'BibTeX / RIS', extensions: ['bib', 'bibtex', 'ris'] },
            { name: 'All files', extensions: ['*'] },
          ],
        });
        if (picked) await citationFlow.openImportDialog(picked);
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
        citationFlow.setCiteSuggestState({
          open: true,
          paragraph: para?.text ?? '',
          insertAt: para?.to ?? v.state.selection.main.head,
          hasKey: hasA || hasO,
        });
        return;
      }
      if (cmd === 'openCitePalette') { citationFlow.setCitePaletteOpen(true); return; }
      if (cmd === 'openAiPalette') { await aiPalette.open(); return; }
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
        if (cmd.type === 'openRecent') { await fileCommands.doOpenPath(cmd.path); return; }
        if (cmd.type === 'openRecentFolder') { await workspace.openRecentFolder(cmd.path); return; }
        if (cmd.type === 'closeFolder') { workspace.closeWorkspaceFolder(cmd.path); return; }
        if (cmd.type === 'newFromTemplate') {
          const tpl = findTemplate(cmd.templateId);
          if (!tpl) return;
          await fileCommands.loadTemplate(tpl.content);
          return;
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filePath,
    content,
    isDirty,
    themePreference,
    fileCommands,
    exportFlow,
    citationFlow,
    aiPalette,
    workspace,
  ]);
}
