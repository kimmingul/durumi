import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { MarkdownEditor } from './editor/MarkdownEditor';
import { EditorToolbar } from './components/EditorToolbar';
import { StatusBar } from './components/StatusBar';
import { Sidebar } from './components/Sidebar';
import { RightSidebar } from './components/RightSidebar';
import { MemoPanel } from './components/MemoPanel';
import { QuickOpen } from './components/QuickOpen';
import { ToastHost } from './components/Toast';
import { runPendingImageInserts } from './editor/imagePaste';
import { clearPendingImages } from './editor/pendingImagePaste';
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
import { useAppStore } from './store/appStore';
import { useMemoPanelStore } from './store/memoPanelStore';
import { useMemoCaretFocus } from './hooks/useMemoCaretFocus';
import { parseComments } from '@shared/comments';
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
  const handleEditorReady = useCallback((v: EditorView) => {
    editorViewRef.current = v;
    setEditorView(v);
  }, []);
  const filePath = useAppStore((s) => s.filePath);
  const content = useAppStore((s) => s.content);
  const setContent = useAppStore((s) => s.setContent);
  const editMode = useAppStore((s) => s.editMode);
  const memoPanelManuallyHidden = useMemoPanelStore((s) => s.manuallyHidden);
  const setMemoPanelManuallyHidden = useMemoPanelStore((s) => s.setManuallyHidden);
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
  // OS-close intercept that prompts on dirty buffers.
  useAppCloseGuard();
  // Auto-focus the matching card when the caret lands on a memo's line.
  useMemoCaretFocus(editorView, content);

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

  // v0.2.11 — Gate for the pending-image-flush effect. The bare `filePath`
  // transition is too permissive: opening an unrelated file (sidebar click,
  // quick-open, File > Open) also fires `setFile(newPath, content)` and would
  // dump queued bytes into a doc the user never intended to modify (silent
  // data corruption). We arm this ref ONLY in save-related entry points
  // (toast "Save as…" action + native menu Save / Save As) and reset it after
  // the drain runs. Bypassing actions (open / new) clear the queue outright.
  const pendingDrainArmed = useRef(false);

  // v0.2.11 — bridge the image-paste-into-untitled toast's "Save as…" action
  // back to the file-command flow without taking a circular dependency.
  // imagePaste.ts dispatches a `durumi:menu-command` CustomEvent; we listen
  // here and route to `doSaveAs`. After the save resolves with a fresh path,
  // flush the buffered image bytes so the user doesn't have to paste again.
  useEffect(() => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<{ type: string; cmd?: string }>).detail;
      if (!detail) return;
      if (detail.type === 'fileCommand' && detail.cmd === 'saveAs') {
        // Arm the drain BEFORE invoking save so the resulting filePath
        // transition (if any) is recognized as save-driven.
        pendingDrainArmed.current = true;
        void fileCommands.doSaveAs();
      }
    };
    window.addEventListener('durumi:menu-command', handler as EventListener);
    return () => window.removeEventListener('durumi:menu-command', handler as EventListener);
  }, [fileCommands]);

  // Second menu-command listener (peer of useMenuCommandRouter; both are
  // valid simultaneous subscribers) to arm/clear the drain gate against
  // native menu actions that aren't routed through `durumi:menu-command`.
  // Save / Save As arm the drain. New / Open clear the queued bytes outright
  // — those represent an intentional context switch and the user's pasted
  // image was meant for a buffer that no longer exists.
  useEffect(() => {
    return window.api.onMenuCommand((cmd) => {
      if (cmd === 'save' || cmd === 'saveAs') {
        pendingDrainArmed.current = true;
        return;
      }
      if (cmd === 'new' || cmd === 'open') {
        clearPendingImages();
        pendingDrainArmed.current = false;
      }
    });
  }, []);

  // Drain any image-bytes the user pasted while the doc was still untitled,
  // but ONLY when the transition was driven by an explicit save action (gate
  // armed via `pendingDrainArmed`). A bare `filePath` change from File > Open
  // / sidebar click / quick-open MUST NOT flush — those would silently
  // mutate an unrelated file with bytes intended for the previous buffer.
  useEffect(() => {
    if (!filePath) return;
    if (!pendingDrainArmed.current) return;
    pendingDrainArmed.current = false;
    void runPendingImageInserts(filePath);
  }, [filePath]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0 }}>
        <Sidebar
          content={content}
          view={editorView}
          onApplyOutlineMove={(newDoc) => setContent(newDoc)}
          onOpenFile={(p) => {
            // Sidebar click is a context switch, not a save — drop any
            // bytes still queued from an untitled-buffer paste so they
            // don't leak into this freshly opened file.
            clearPendingImages();
            pendingDrainArmed.current = false;
            return fileCommands.doOpenPath(p);
          }}
          onOpenHit={async (absPath, line) => {
            clearPendingImages();
            pendingDrainArmed.current = false;
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
        <div style={{ flex: 1, overflow: 'auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <EditorToolbar
            view={editorView}
            visible={editMode === 'wysiwyg'}
            onOpenCitePalette={() => citationFlow.setCitePaletteOpen(true)}
            onPickImage={pickAndInsertImage}
          />
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            <MarkdownEditor
              value={content}
              onChange={setContent}
              onReady={handleEditorReady}
              filePath={filePath}
              macros={macros}
              editMode={editMode}
            />
          </div>
        </div>
        <MemoPanel
          view={editorView}
          content={content}
          visible={parseComments(content).length > 0 && !memoPanelManuallyHidden}
          onClose={() => setMemoPanelManuallyHidden(true)}
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
      <StatusBar />
      <ToastHost />
      <QuickOpen
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onPick={(p) => {
          clearPendingImages();
          pendingDrainArmed.current = false;
          return fileCommands.doOpenPath(p);
        }}
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
