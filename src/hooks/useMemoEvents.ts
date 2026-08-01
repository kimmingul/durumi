import { useEffect } from 'react';
import { useBibliographyStore } from '../store/bibliographyStore';
import { useMemoPanelStore } from '../store/memoPanelStore';
import { useRightSidebarStore } from '../store/rightSidebarStore';
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
 * 3. (v0.2.30에서 삭제) 메모가 오른쪽 사이드바 탭이 되면서 "메모 패널을
 *    수동으로 닫았다" 세션 플래그와 자동 노출 규칙이 함께 사라졌다.
 * 4. Prunes orphaned sidecar entries against the live set of memo IDs in the
 *    source on every content change (7-day grace window for undo recovery).
 * 5. Forwards `durumi:memo-focus`, `durumi:memo-panel-toggle`, and
 *    `durumi:reference-open` DOM events to the appropriate store actions /
 *    IPC calls.
 *
 * All listeners clean up on unmount.
 */
export function useMemoEvents(filePath: string | null, content: string): void {
  const setMemoPanelFocusedFrom = useMemoPanelStore((s) => s.setFocusedFrom);
  const rightSidebarShowWith = useRightSidebarStore((s) => s.showWith);
  const setRightSidebarVisible = useRightSidebarStore((s) => s.setVisible);

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
      // 아이콘 클릭은 곧 "이 메모를 보여달라"는 요청이다. 사이드바가 닫혀
      // 있거나 다른 탭이 떠 있으면 메모 탭으로 열어준다.
      rightSidebarShowWith('memo');
      setMemoPanelFocusedFrom(ev.detail?.from ?? null);
    }
    function onMemoPanelToggle() {
      // 메모 탭이 이미 보이면 사이드바를 닫고, 아니면 메모 탭으로 연다.
      const s = useRightSidebarStore.getState();
      if (s.visible && s.activeTab === 'memo') {
        setRightSidebarVisible(false);
        return;
      }
      s.showWith('memo');
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
  }, [setMemoPanelFocusedFrom, rightSidebarShowWith, setRightSidebarVisible]);
}
