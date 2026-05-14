import { useCallback, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useSidebarStore } from '../store/sidebarStore';
import { promoteComments, stripComments } from '@shared/comments';
import { transformCm } from '@shared/criticMarkup';
import { basenameOf, stripMarkdownExt } from '../utils/path';

export type PandocInstallOp =
  | { kind: 'export'; format: 'docx' | 'latex' }
  | { kind: 'import' }
  | { kind: 'configure' }
  | null;

export interface ExportFlow {
  /** Renders HTML/PDF in-renderer and writes via the export-file IPC. */
  doExport: (format: 'html' | 'pdf') => Promise<void>;
  /**
   * Pre-processes memos + CriticMarkup according to the user's preferences
   * and ships the result to Pandoc for DOCX/LaTeX export. If pandoc is
   * missing, sets `pandocInstallOp` to a retryable record instead of
   * surfacing an alert.
   */
  doPandocExport: (format: 'docx' | 'latex') => Promise<void>;
  /**
   * Runs Pandoc DOCX → Markdown, gated by the dirty-discard guard. Falls
   * back to the install dialog on `pandoc-missing` errors.
   */
  doPandocImportDocx: () => Promise<void>;
  pandocInstallOp: PandocInstallOp;
  setPandocInstallOp: (op: PandocInstallOp) => void;
}

/**
 * Owns the export side of App.tsx: HTML / PDF render, Pandoc DOCX / LaTeX
 * export, Pandoc DOCX import, and the "pandoc missing — show install
 * dialog" state machine that lets the user retry after installing.
 *
 * The hook does not render the install dialog itself — App.tsx still owns
 * the `<PandocInstallDialog>` mount point — but it provides the state and
 * setter so the dialog can drive the retry callback.
 */
export function useExportFlow(deps: {
  maybeDiscard: () => Promise<boolean>;
}): ExportFlow {
  const filePath = useAppStore((s) => s.filePath);
  const content = useAppStore((s) => s.content);
  const setFile = useAppStore((s) => s.setFile);

  // When Pandoc is missing, we surface a guided install dialog and remember
  // the operation that triggered it so the user can retry after installing.
  const [pandocInstallOp, setPandocInstallOp] = useState<PandocInstallOp>(null);

  const loadBibliography = useCallback(async (): Promise<string | null> => {
    const roots = useSidebarStore.getState().workspaceFolders;
    const hit = await window.api.bibliographyFind(filePath, roots);
    return hit?.source ?? null;
  }, [filePath]);

  const doExport = useCallback(
    async (format: 'html' | 'pdf'): Promise<void> => {
      const baseName = basenameOf(filePath, 'untitled');
      const title = stripMarkdownExt(baseName) || 'untitled';
      const suggested = stripMarkdownExt(baseName) + `.${format}`;
      const customCss = await window.api.customCssGet();
      const bibliography = await loadBibliography();
      const prefs = await window.api.prefsGet();
      const includeComments = prefs.exportIncludeComments ?? false;
      const preserveAnnotations = prefs.exportPreserveAnnotations ?? false;
      // Lazy: pulls in markdown-it, KaTeX renderToString path, mermaid
      // preprocessor, code-highlight prefetch, etc. — none of which the
      // editor itself needs on first paint.
      const { renderHtml } = await import('../export/renderHtml');
      const html = await renderHtml(content, title, customCss, {
        bibliography,
        includeComments,
        preserveAnnotations,
      });
      await window.api.exportFile(html, format, suggested);
    },
    [filePath, content, loadBibliography],
  );

  const doPandocExport = useCallback(
    async (format: 'docx' | 'latex'): Promise<void> => {
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
    },
    [filePath, content],
  );

  const doPandocImportDocx = useCallback(async (): Promise<void> => {
    if (!(await deps.maybeDiscard())) return;
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
  }, [deps, setFile]);

  return { doExport, doPandocExport, doPandocImportDocx, pandocInstallOp, setPandocInstallOp };
}
