import { useCallback, useState } from 'react';
import type { RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import type { BibEntry } from '@shared/bibtex';
import { insertCitationSmart } from '@shared/citationMerge';
import { t } from '../i18n/t';

export interface CitationImportState {
  open: boolean;
  entries: BibEntry[];
  warnings: string[];
  format: 'bibtex' | 'ris' | null;
  sourcePath: string | null;
}

export interface CiteSuggestState {
  open: boolean;
  paragraph: string;
  insertAt: number;
  hasKey: boolean;
}

export interface CitationInsertFlow {
  /** "Insert citation from DOI" dialog visibility. */
  citationDialogOpen: boolean;
  setCitationDialogOpen: (open: boolean) => void;
  /** Quick citation palette (Cmd+Shift+P-ish) visibility. */
  citePaletteOpen: boolean;
  setCitePaletteOpen: (open: boolean) => void;
  /** Bulk DOI ingest dialog visibility. */
  bulkDoiOpen: boolean;
  setBulkDoiOpen: (open: boolean) => void;
  /** Imported-references confirmation dialog state. */
  importState: CitationImportState;
  /** Reads a .bib/.ris file and shows the import confirmation dialog. */
  openImportDialog: (sourcePath: string) => Promise<void>;
  closeImportDialog: () => void;
  /** AI-suggested-citation panel state. */
  citeSuggestState: CiteSuggestState;
  setCiteSuggestState: (state: CiteSuggestState) => void;
  closeCiteSuggest: () => void;
  /**
   * Inserts a citation token at the caret. For single-key tokens (`[@foo]`)
   * we run `insertCitationSmart` which merges into an existing adjacent
   * citation group and dedupes; multi-key insertions go in verbatim.
   */
  insertCitationAtCaret: (citation: string) => void;
  /**
   * After a bib `renameEntryKey` action commits, walk the active editor doc
   * and replace `[@oldKey]` with `[@newKey]` in a single transaction so all
   * references migrate atomically (undo as one unit).
   */
  migrateCitationsInDoc: (oldKey: string, newKey: string) => void;
}

/**
 * Owns the citation-insert side of App.tsx: the four citation dialogs
 * (insert-from-DOI, palette, bulk DOI, import-references) plus the
 * AI-suggested-citation side panel, the smart-merge insert-at-caret
 * helper, and the post-rename atomic citation key migration.
 */
export function useCitationInsertFlow(
  editorViewRef: RefObject<EditorView | null>,
): CitationInsertFlow {
  const [citationDialogOpen, setCitationDialogOpen] = useState(false);
  const [citePaletteOpen, setCitePaletteOpen] = useState(false);
  const [bulkDoiOpen, setBulkDoiOpen] = useState(false);
  const [importState, setImportState] = useState<CitationImportState>({
    open: false,
    entries: [],
    warnings: [],
    format: null,
    sourcePath: null,
  });
  const [citeSuggestState, setCiteSuggestState] = useState<CiteSuggestState>({
    open: false,
    paragraph: '',
    insertAt: 0,
    hasKey: false,
  });

  const openImportDialog = useCallback(async (sourcePath: string) => {
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
  }, []);

  const closeImportDialog = useCallback(() => {
    setImportState((s) => ({ ...s, open: false }));
  }, []);

  const closeCiteSuggest = useCallback(() => {
    setCiteSuggestState((s) => ({ ...s, open: false }));
  }, []);

  const insertCitationAtCaret = useCallback(
    (citation: string) => {
      const view = editorViewRef.current;
      if (!view) return;
      const single = citation.match(/^\[@([^\]\s;,]+)\]$/);
      if (single && single[1]) {
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
    },
    [editorViewRef],
  );

  const migrateCitationsInDoc = useCallback(
    (oldKey: string, newKey: string) => {
      const view = editorViewRef.current;
      if (!view) return;
      // Lazy import keeps the boot path lean.
      void import('@shared/citationKey').then(({ renameCitationKeyChanges }) => {
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
    },
    [editorViewRef],
  );

  return {
    citationDialogOpen,
    setCitationDialogOpen,
    citePaletteOpen,
    setCitePaletteOpen,
    bulkDoiOpen,
    setBulkDoiOpen,
    importState,
    openImportDialog,
    closeImportDialog,
    citeSuggestState,
    setCiteSuggestState,
    closeCiteSuggest,
    insertCitationAtCaret,
    migrateCitationsInDoc,
  };
}
