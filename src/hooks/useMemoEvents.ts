import { useEffect } from 'react';
import { useBibliographyStore } from '../store/bibliographyStore';
import { useMemoPanelStore } from '../store/memoPanelStore';
import { useMemoSidecarStore } from '../store/memoSidecarStore';
import { memoIdFor, pruneOrphans } from '@shared/memoSidecar';
import { parseComments } from '@shared/comments';

/**
 * Owns the cross-cutting glue between the editor, the memo panel, and the
 * memo sidecar store:
 *
 * 1. Reloads the per-document sidecar when `filePath` changes (with debounced
 *    autosave handled inside the store itself).
 * 2. Rebinds the bibliography store to whatever .bib file walks up from the
 *    active doc — enables Cmd+Shift+B citation flows.
 * 3. Resets the per-session "memo panel manually hidden" flag when the user
 *    switches documents so a closed-on-doc-A panel reopens on doc-B.
 * 4. Prunes orphaned sidecar entries against the live set of memo IDs in the
 *    source on every content change (7-day grace window for undo recovery).
 * 5. Forwards `durumi:memo-focus`, `durumi:memo-panel-toggle`, and
 *    `durumi:reference-open` DOM events to the appropriate store actions /
 *    IPC calls.
 *
 * All listeners clean up on unmount.
 */
export function useMemoEvents(filePath: string | null, content: string): void {
  const setMemoPanelManuallyHidden = useMemoPanelStore((s) => s.setManuallyHidden);
  const setMemoPanelFocusedFrom = useMemoPanelStore((s) => s.setFocusedFrom);
  const toggleMemoPanel = useMemoPanelStore((s) => s.toggle);

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
}
