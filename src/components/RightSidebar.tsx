import { useEffect, useRef } from 'react';
import { useRightSidebarStore } from '../store/rightSidebarStore';
import { ReferencesTab } from './sidebar/ReferencesTab';
import { AiTab } from './sidebar/AiTab';
import { ChangesTab } from './sidebar/ChangesTab';
import { MemoTab } from './sidebar/MemoTab';
import { useDocComments } from '../hooks/useDocComments';
import { useDocCriticMarkup } from '../hooks/useDocCriticMarkup';
import { jumpToLine } from '../editor/jumpToLine';
import { useLanguage, t } from '../i18n/t';
import type { EditorView } from '@codemirror/view';

// Right-side authoring assistance pane (v0.1.8.4). Hosts References and AI
// tabs that previously lived on the left sidebar. Mirrors `Sidebar.tsx` in
// shape, but anchors to the right edge and uses an inverse drag-resize math
// (drag left grows, drag right shrinks). State is owned by
// `useRightSidebarStore`; persistence flows through the `rightSidebar` prefs
// key with the same 500ms debounce as the left sidebar.
//
// v0.2.30 — 사이드바 재편: 왼쪽은 내비게이션(파일/목차/검색), 오른쪽은 작업.
// 왼쪽에 있던 메모·변경 탭이 여기로 이동했고, 독립 패널이던 MemoPanel도
// 메모 탭으로 흡수됐다. 자동 노출 규칙 대신 탭 개수 배지로 알린다.

interface RightSidebarProps {
  content: string;
  view: EditorView | null;
  onInsertCitation: (key: string) => void;
  onCitationRenamed: (oldKey: string, newKey: string) => void;
  onOpenAiPalette: () => void;
  onSuggestCitations: () => void;
  onInsertCitationFromDoi: () => void;
  onOpenSettings: () => void;
}

export function RightSidebar({
  content,
  view,
  onInsertCitation,
  onCitationRenamed,
  onOpenAiPalette,
  onSuggestCitations,
  onInsertCitationFromDoi,
  onOpenSettings,
}: RightSidebarProps) {
  const visible = useRightSidebarStore((s) => s.visible);
  const activeTab = useRightSidebarStore((s) => s.activeTab);
  const width = useRightSidebarStore((s) => s.width);
  const setActiveTab = useRightSidebarStore((s) => s.setActiveTab);
  const setWidth = useRightSidebarStore((s) => s.setWidth);
  // Subscribe to language so tab labels re-render on switch.
  useLanguage();
  // 탭 배지용 카운트. 메모/변경 탭이 접혀 있어도 새 항목이 생겼음을 알린다.
  const memos = useDocComments(content);
  const { counts: cmCounts } = useDocCriticMarkup(content);

  // Persist right-sidebar settings (debounced inline, same shape as Sidebar.tsx).
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void window.api.prefsSet({
        rightSidebar: { visible, activeTab, width },
      });
    }, 500);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [visible, activeTab, width]);

  // Resize drag handle. Anchored on the LEFT edge of the panel, so dragging
  // left should grow the panel (width increases as cursor moves toward the
  // editor) and dragging right should shrink it. Inverse of Sidebar.tsx.
  const dragStartX = useRef<number | null>(null);
  const dragStartWidth = useRef<number>(width);
  function onResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragStartX.current = e.clientX;
    dragStartWidth.current = width;
    const onMove = (ev: MouseEvent) => {
      if (dragStartX.current == null) return;
      const dx = ev.clientX - dragStartX.current;
      setWidth(dragStartWidth.current - dx);
    };
    const onUp = () => {
      dragStartX.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  if (!visible) return null;

  function onJump(line: number) {
    if (view) jumpToLine(view, line);
  }

  return (
    <>
      <div className="cm-right-sidebar-resizer" onMouseDown={onResizeMouseDown} role="separator" />
      <aside className="cm-right-sidebar" style={{ width: `${width}px` }}>
        <div className="cm-right-sidebar-tabs">
          <button
            className={
              'cm-right-sidebar-tab' +
              (activeTab === 'references' ? ' cm-right-sidebar-tab-active' : '')
            }
            onClick={() => setActiveTab('references')}
            data-testid="right-sidebar-tab-references"
          >
            {t('sidebar.references')}
          </button>
          <button
            className={
              'cm-right-sidebar-tab' +
              (activeTab === 'ai' ? ' cm-right-sidebar-tab-active' : '')
            }
            onClick={() => setActiveTab('ai')}
            data-testid="right-sidebar-tab-ai"
          >
            {t('sidebar.ai')}
          </button>
          <button
            className={
              'cm-right-sidebar-tab' +
              (activeTab === 'memo' ? ' cm-right-sidebar-tab-active' : '')
            }
            onClick={() => setActiveTab('memo')}
            data-testid="right-sidebar-tab-memo"
          >
            {t('sidebar.comments')}
            {memos.length > 0 && (
              <span
                className="cm-right-sidebar-tab-badge"
                data-testid="right-sidebar-tab-memo-badge"
              >
                {memos.length}
              </span>
            )}
          </button>
          <button
            className={
              'cm-right-sidebar-tab' +
              (activeTab === 'changes' ? ' cm-right-sidebar-tab-active' : '')
            }
            onClick={() => setActiveTab('changes')}
            data-testid="right-sidebar-tab-changes"
          >
            {t('sidebar.changes')}
            {cmCounts.total > 0 && (
              <span
                className="cm-right-sidebar-tab-badge"
                data-testid="right-sidebar-tab-changes-badge"
              >
                {cmCounts.total}
              </span>
            )}
          </button>
        </div>
        <div className="cm-right-sidebar-body">
          {activeTab === 'references' && (
            <ReferencesTab
              onInsertCitation={onInsertCitation}
              documentText={content}
              onCitationRenamed={onCitationRenamed}
            />
          )}
          {activeTab === 'ai' && (
            <AiTab
              selectionText={
                view
                  ? view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)
                  : ''
              }
              onOpenPalette={onOpenAiPalette}
              onSuggestCitations={onSuggestCitations}
              onInsertCitationFromDoi={onInsertCitationFromDoi}
              onOpenSettings={onOpenSettings}
            />
          )}
          {activeTab === 'memo' && <MemoTab view={view} content={content} />}
          {activeTab === 'changes' && (
            <ChangesTab content={content} onJump={onJump} />
          )}
        </div>
      </aside>
    </>
  );
}
