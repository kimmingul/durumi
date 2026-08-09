import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from './components/StatusBar';
import { Sidebar } from './components/Sidebar';
import { RightSidebar } from './components/RightSidebar';
import { QuickOpen } from './components/QuickOpen';
import { ToastHost } from './components/Toast';
import { ReconciliationSurface } from './components/ReconciliationSurface';
import { useExternalChangeWiring } from './hooks/useExternalChangeWiring';
// Dialogs are lazy: they only mount when the user opens them, and the dialog
// bundle (Settings panel alone is ~50 KB, plus the AI usage dashboard, the
// citation/reference dialogs, the keyboard-shortcuts cheat sheet, and the
// Pandoc install walkthrough) doesn't belong on the editor's first paint.
const PandocInstallDialog = lazy(() =>
  import('./components/PandocInstallDialog').then((m) => ({ default: m.PandocInstallDialog })),
);
const SettingsDialog = lazy(() =>
  import('./components/SettingsDialog').then((m) => ({ default: m.SettingsDialog })),
);
const InsertCitationDialog = lazy(() =>
  import('./components/InsertCitationDialog').then((m) => ({ default: m.InsertCitationDialog })),
);
const BulkDoiDialog = lazy(() =>
  import('./components/BulkDoiDialog').then((m) => ({ default: m.BulkDoiDialog })),
);
const ImportReferencesDialog = lazy(() =>
  import('./components/ImportReferencesDialog').then((m) => ({ default: m.ImportReferencesDialog })),
);
const KeyboardShortcutsDialog = lazy(() =>
  import('./components/KeyboardShortcutsDialog').then((m) => ({ default: m.KeyboardShortcutsDialog })),
);
// AI palette + cite palette + citation suggestion + cite palette: these mount
// only when the user invokes the feature. Keep them out of the eager bundle.
const CitePalette = lazy(() =>
  import('./components/CitePalette').then((m) => ({ default: m.CitePalette })),
);
const AiCommandPalette = lazy(() =>
  import('./components/AiCommandPalette').then((m) => ({ default: m.AiCommandPalette })),
);
const CitationSuggestPanel = lazy(() =>
  import('./components/CitationSuggestPanel').then((m) => ({ default: m.CitationSuggestPanel })),
);
import { currentParagraph } from './editor/paragraphContext';
import {
  activeDocument,
  documentOf,
  isDirty as isDocumentDirty,
  useActiveDocument,
  useWorkspaceStore,
} from './store/workspaceStore';
import { PanelContainer } from './components/PanelContainer';
import { useMemoCaretFocus } from './hooks/useMemoCaretFocus';
import type { Macro } from '@shared/ipc-contract';
import { EditorView } from '@codemirror/view';
import { useCustomCss } from './hooks/useCustomCss';
import { useAppCloseGuard } from './hooks/useAppCloseGuard';
import { usePreferencesInit } from './hooks/usePreferencesInit';
import { useMemoEvents } from './hooks/useMemoEvents';
import { useAppChromeEffects } from './hooks/useAppChromeEffects';
import { useFileMenuCommands } from './hooks/useFileMenuCommands';
import { useExportFlow } from './hooks/useExportFlow';
import { useCitationInsertFlow } from './hooks/useCitationInsertFlow';
import { useAiPalette } from './hooks/useAiPalette';
import { useWorkspaceMenu } from './hooks/useWorkspaceMenu';
import { useMenuCommandRouter } from './hooks/useMenuCommandRouter';
import { usePickAndInsertImage } from './hooks/usePickAndInsertImage';

export function App() {
  const editorViewRef = useRef<EditorView | null>(null);
  // Mirror the ref in React state so consumers that JSX-render against the
  // EditorView (the toolbar's active-mark detection, sidebars, etc.) re-render
  // when the editor mounts. Callbacks fetched from a ref still see the latest
  // view without an extra render pass — the ref stays the source of truth for
  // event handlers, and `editorView` is the source of truth for JSX.
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const filePath = useActiveDocument((d) => d?.path ?? null);
  const content = useActiveDocument((d) => d?.content ?? '');
  const isDirty = useActiveDocument((d) => (d ? isDocumentDirty(d) : false));
  // 편집은 **활성 패널이 참조하는 문서**로 간다. 패널이 아니라 문서가 내용을
  // 소유하므로(REQ-PANEL-010) 대상은 문서 식별자로 고른다.
  const setContent = useCallback((next: string) => {
    const doc = activeDocument(useWorkspaceStore.getState());
    if (doc) useWorkspaceStore.getState().editDocument(doc.id, next);
  }, []);
  const panels = useWorkspaceStore((s) => s.panels);
  const activePanelId = useWorkspaceStore((s) => s.activePanelId);
  // 패널 식별자 → 그 패널의 편집 표면. 사이드바는 **활성 패널**의 뷰를 겨냥한다
  // (REQ-PANEL-065) — "가장 왼쪽 패널"이 아니다. 레이아웃 순서가 데이터 귀속을
  // 결정하면 패널을 재배치할 때 서지·메모가 조용히 다른 원고를 가리킨다.
  const panelViewsRef = useRef<Map<string, EditorView>>(new Map());
  const [panelViewEpoch, setPanelViewEpoch] = useState(0);
  const handlePanelViewReady = useCallback((panelId: string, view: EditorView | null) => {
    if (view) panelViewsRef.current.set(panelId, view);
    else panelViewsRef.current.delete(panelId);
    setPanelViewEpoch((n) => n + 1);
  }, []);
  const [macros, setMacros] = useState<Macro[]>([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Window chrome + macros + theme/git status broadcasts.
  useAppChromeEffects(setMacros);
  // One-shot prefs bootstrap on mount.
  usePreferencesInit();
  // Custom CSS <style> tag injection + live updates.
  useCustomCss();
  // Memo sidecar / bibliography binding / memo DOM events.
  useMemoEvents(filePath, content);
  // SPEC-V03-WORKSPACE-001 M8: 외부 변경 채널 배선.
  useExternalChangeWiring(filePath, content, isDirty);
  // OS-close intercept that prompts on dirty buffers.
  useAppCloseGuard();
  // Auto-focus the matching card when the caret lands on a memo's line.
  useMemoCaretFocus(editorView, content);

  // 활성 패널의 뷰가 곧 사이드바·커맨드의 대상이다. 활성 패널이 바뀌거나 그
  // 패널의 뷰가 준비/파기되면 갱신된다.
  useEffect(() => {
    const next = activePanelId ? (panelViewsRef.current.get(activePanelId) ?? null) : null;
    editorViewRef.current = next;
    setEditorView(next);
  }, [activePanelId, panelViewEpoch]);

  // Feature slices — each owns a coherent slice of menu-command behaviour.
  const fileCommands = useFileMenuCommands();
  const exportFlow = useExportFlow({ maybeDiscard: fileCommands.maybeDiscard });
  const citationFlow = useCitationInsertFlow(editorViewRef);
  const aiPalette = useAiPalette(editorViewRef);
  const workspace = useWorkspaceMenu();

  // Wire all slices into the menu command dispatcher.
  useMenuCommandRouter({
    editorViewRef,
    fileCommands,
    exportFlow,
    citationFlow,
    aiPalette,
    workspace,
    setQuickOpen,
    setSettingsOpen,
    setShortcutsOpen,
  });

  const pickAndInsertImage = usePickAndInsertImage(editorViewRef);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0 }}>
        <Sidebar
          content={content}
          view={editorView}
          onApplyOutlineMove={(newDoc) => setContent(newDoc)}
          onOpenFile={(p) => fileCommands.doOpenPath(p)}
          onOpenHit={async (absPath, line) => {
            await fileCommands.doOpenPath(absPath);
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
        <PanelContainer
          panels={panels}
          documentOfPanel={(panel) => documentOf(useWorkspaceStore.getState(), panel.panelId)}
          macros={macros}
          onPanelViewReady={handlePanelViewReady}
          onOpenCitePalette={() => citationFlow.setCitePaletteOpen(true)}
          onPickImage={pickAndInsertImage}
        />
        <RightSidebar
          content={content}
          view={editorView}
          onInsertCitation={(key) => citationFlow.insertCitationAtCaret(`[@${key}]`)}
          onCitationRenamed={citationFlow.migrateCitationsInDoc}
          onOpenAiPalette={() => { void aiPalette.open(); }}
          onSuggestCitations={() => {
            const v = editorViewRef.current;
            if (!v) return;
            const para = currentParagraph(v.state);
            void Promise.all([
              window.api.aiHasKey('anthropic'),
              window.api.aiHasKey('openai-compatible'),
            ]).then(([hasA, hasO]) => {
              citationFlow.setCiteSuggestState({
                open: true,
                paragraph: para?.text ?? '',
                insertAt: para?.to ?? v.state.selection.main.head,
                hasKey: hasA || hasO,
              });
            });
          }}
          onInsertCitationFromDoi={() => citationFlow.setCitationDialogOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>
      <ReconciliationSurface path={filePath} />
      <StatusBar />
      <ToastHost />
      <QuickOpen
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onPick={(p) => fileCommands.doOpenPath(p)}
      />
      {/*
        All dialogs are React.lazy. We gate each lazy component on its `open`
        flag so React doesn't even start the dynamic import for a dialog the
        user hasn't summoned. A single Suspense with `null` fallback avoids
        flashing a loader for what should be a near-instant chunk fetch.
      */}
      <Suspense fallback={null}>
        {exportFlow.pandocInstallOp !== null && (
          <PandocInstallDialog
            open={true}
            onClose={() => exportFlow.setPandocInstallOp(null)}
            onResolved={() => {
              const op = exportFlow.pandocInstallOp;
              exportFlow.setPandocInstallOp(null);
              if (!op) return;
              if (op.kind === 'export') {
                void exportFlow.doPandocExport(op.format);
              } else if (op.kind === 'import') {
                void exportFlow.doPandocImportDocx();
              }
              // 'configure': nothing to retry — the user opened the install dialog
              // from Settings just to get pandoc on the system.
            }}
          />
        )}
        {settingsOpen && (
          <SettingsDialog
            open={true}
            onClose={() => setSettingsOpen(false)}
            onRequestPandocInstall={() => {
              setSettingsOpen(false);
              exportFlow.setPandocInstallOp({ kind: 'configure' });
            }}
          />
        )}
        {citationFlow.citationDialogOpen && (
          <InsertCitationDialog
            open={true}
            onClose={() => citationFlow.setCitationDialogOpen(false)}
            onInsert={citationFlow.insertCitationAtCaret}
          />
        )}
        {citationFlow.citePaletteOpen && (
          <CitePalette
            open={true}
            onClose={() => citationFlow.setCitePaletteOpen(false)}
            onPick={(key) => citationFlow.insertCitationAtCaret(`[@${key}]`)}
          />
        )}
        {citationFlow.bulkDoiOpen && (
          <BulkDoiDialog
            open={true}
            onClose={() => citationFlow.setBulkDoiOpen(false)}
          />
        )}
        {shortcutsOpen && (
          <KeyboardShortcutsDialog
            open={true}
            onClose={() => setShortcutsOpen(false)}
          />
        )}
        {citationFlow.importState.open && (
          <ImportReferencesDialog
            open={true}
            entries={citationFlow.importState.entries}
            warnings={citationFlow.importState.warnings}
            format={citationFlow.importState.format}
            sourcePath={citationFlow.importState.sourcePath}
            onClose={citationFlow.closeImportDialog}
          />
        )}
        {aiPalette.state.open && (
          <AiCommandPalette
            open={true}
            selection={aiPalette.state.selection}
            paragraph={aiPalette.state.paragraph}
            hasKey={aiPalette.state.hasKey}
            onClose={aiPalette.close}
            onAccept={aiPalette.accept}
          />
        )}
        {citationFlow.citeSuggestState.open && (
          <CitationSuggestPanel
            open={true}
            paragraph={citationFlow.citeSuggestState.paragraph}
            hasKey={citationFlow.citeSuggestState.hasKey}
            onClose={citationFlow.closeCiteSuggest}
            onAccept={(key) => {
              const v = editorViewRef.current;
              if (!v) return;
              // Insert `[@key]` right after the paragraph (at insertAt).
              // Putting it at paragraph end avoids guessing intra-sentence
              // placement; the user can drag-cut it elsewhere if needed.
              const insertion = ` [@${key}]`;
              v.dispatch({
                changes: { from: citationFlow.citeSuggestState.insertAt, insert: insertion },
                selection: { anchor: citationFlow.citeSuggestState.insertAt + insertion.length },
              });
              v.focus();
              citationFlow.closeCiteSuggest();
            }}
          />
        )}
      </Suspense>
    </div>
  );
}
