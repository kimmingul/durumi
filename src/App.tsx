import { useRef, useState } from 'react';
import { MarkdownEditor } from './editor/MarkdownEditor';
import { EditorToolbar } from './components/EditorToolbar';
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
  useMemoCaretFocus(editorViewRef.current, content);

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
          view={editorViewRef.current}
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
        <div style={{ flex: 1, overflow: 'auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <EditorToolbar
            view={editorViewRef.current}
            visible={editMode === 'wysiwyg'}
            onOpenCitePalette={() => citationFlow.setCitePaletteOpen(true)}
            onPickImage={pickAndInsertImage}
          />
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            <MarkdownEditor
              value={content}
              onChange={setContent}
              onReady={(v) => { editorViewRef.current = v; }}
              filePath={filePath}
              macros={macros}
              editMode={editMode}
            />
          </div>
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
      <QuickOpen
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onPick={(p) => fileCommands.doOpenPath(p)}
      />
      <PandocInstallDialog
        open={exportFlow.pandocInstallOp !== null}
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
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onRequestPandocInstall={() => {
          setSettingsOpen(false);
          exportFlow.setPandocInstallOp({ kind: 'configure' });
        }}
      />
      <InsertCitationDialog
        open={citationFlow.citationDialogOpen}
        onClose={() => citationFlow.setCitationDialogOpen(false)}
        onInsert={citationFlow.insertCitationAtCaret}
      />
      <CitePalette
        open={citationFlow.citePaletteOpen}
        onClose={() => citationFlow.setCitePaletteOpen(false)}
        onPick={(key) => citationFlow.insertCitationAtCaret(`[@${key}]`)}
      />
      <BulkDoiDialog
        open={citationFlow.bulkDoiOpen}
        onClose={() => citationFlow.setBulkDoiOpen(false)}
      />
      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      <ImportReferencesDialog
        open={citationFlow.importState.open}
        entries={citationFlow.importState.entries}
        warnings={citationFlow.importState.warnings}
        format={citationFlow.importState.format}
        sourcePath={citationFlow.importState.sourcePath}
        onClose={citationFlow.closeImportDialog}
      />
      <AiCommandPalette
        open={aiPalette.state.open}
        selection={aiPalette.state.selection}
        paragraph={aiPalette.state.paragraph}
        hasKey={aiPalette.state.hasKey}
        onClose={aiPalette.close}
        onAccept={aiPalette.accept}
      />
      <CitationSuggestPanel
        open={citationFlow.citeSuggestState.open}
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
    </div>
  );
}
