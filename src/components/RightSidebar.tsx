import { useEffect, useRef } from 'react';
import { useRightSidebarStore } from '../store/rightSidebarStore';
import { ReferencesTab } from './sidebar/ReferencesTab';
import { AiTab } from './sidebar/AiTab';
import { useLanguage, t } from '../i18n/t';
import type { EditorView } from '@codemirror/view';

// Right-side authoring assistance pane (v0.1.8.4). Hosts References and AI
// tabs that previously lived on the left sidebar. Mirrors `Sidebar.tsx` in
// shape, but anchors to the right edge and uses an inverse drag-resize math
// (drag left grows, drag right shrinks). State is owned by
// `useRightSidebarStore`; persistence flows through the `rightSidebar` prefs
// key with the same 500ms debounce as the left sidebar.

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
        </div>
      </aside>
    </>
  );
}
