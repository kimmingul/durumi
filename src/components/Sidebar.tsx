import { useEffect, useRef } from 'react';
import { useSidebarStore } from '../store/sidebarStore';
import { CommentsTab } from './sidebar/CommentsTab';
import { ChangesTab } from './sidebar/ChangesTab';
import { useDocCriticMarkup } from '../hooks/useDocCriticMarkup';
import { FileTree } from './sidebar/FileTree';
import { Outline } from './sidebar/Outline';
import { SearchTab } from './sidebar/SearchTab';
import { jumpToLine } from '../editor/jumpToLine';
import { useActiveHeading } from '../hooks/useActiveHeading';
import { useLanguage, t } from '../i18n/t';
import type { EditorView } from '@codemirror/view';

interface SidebarProps {
  content: string;
  view: EditorView | null;
  onOpenFile: (path: string) => void;
  onOpenHit?: (absPath: string, line: number, column: number) => void;
  onApplyOutlineMove?: (newDoc: string) => void;
}

export function Sidebar({
  content,
  view,
  onOpenFile,
  onOpenHit,
  onApplyOutlineMove,
}: SidebarProps) {
  const visible = useSidebarStore((s) => s.visible);
  const activeTab = useSidebarStore((s) => s.activeTab);
  const width = useSidebarStore((s) => s.width);
  const setActiveTab = useSidebarStore((s) => s.setActiveTab);
  const setWidth = useSidebarStore((s) => s.setWidth);
  // Subscribe to language so tab labels re-render on switch.
  useLanguage();
  const { counts: cmCounts } = useDocCriticMarkup(content);

  useActiveHeading(view, content);

  // Persist sidebar settings (debounced inline).
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void window.api.prefsSet({
        sidebar: { visible, activeTab, width },
      });
    }, 500);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [visible, activeTab, width]);

  // Resize drag handle.
  const dragStartX = useRef<number | null>(null);
  const dragStartWidth = useRef<number>(width);
  function onResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragStartX.current = e.clientX;
    dragStartWidth.current = width;
    const onMove = (ev: MouseEvent) => {
      if (dragStartX.current == null) return;
      const dx = ev.clientX - dragStartX.current;
      setWidth(dragStartWidth.current + dx);
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
      <aside className="cm-sidebar" style={{ width: `${width}px` }}>
        <div className="cm-sidebar-tabs">
          <button
            className={'cm-sidebar-tab' + (activeTab === 'files' ? ' cm-sidebar-tab-active' : '')}
            onClick={() => setActiveTab('files')}
          >
            {t('sidebar.files')}
          </button>
          <button
            className={'cm-sidebar-tab' + (activeTab === 'outline' ? ' cm-sidebar-tab-active' : '')}
            onClick={() => setActiveTab('outline')}
          >
            {t('sidebar.outline')}
          </button>
          <button
            className={'cm-sidebar-tab' + (activeTab === 'search' ? ' cm-sidebar-tab-active' : '')}
            onClick={() => setActiveTab('search')}
          >
            {t('sidebar.search')}
          </button>
          <button
            className={'cm-sidebar-tab' + (activeTab === 'comments' ? ' cm-sidebar-tab-active' : '')}
            onClick={() => setActiveTab('comments')}
          >
            {t('sidebar.comments')}
          </button>
          <button
            className={'cm-sidebar-tab' + (activeTab === 'changes' ? ' cm-sidebar-tab-active' : '')}
            onClick={() => setActiveTab('changes')}
            data-testid="sidebar-tab-changes"
          >
            {t('sidebar.changes')}
            {cmCounts.total > 0 && (
              <span className="cm-sidebar-tab-badge" data-testid="sidebar-tab-changes-badge">
                {cmCounts.total}
              </span>
            )}
          </button>
        </div>
        <div className="cm-sidebar-body">
          {activeTab === 'files' && <FileTree onOpenFile={onOpenFile} />}
          {activeTab === 'outline' && (
            <Outline content={content} onJump={onJump} onApplyOutlineMove={onApplyOutlineMove} />
          )}
          {activeTab === 'search' && (
            <SearchTab onOpenHit={onOpenHit ?? (() => undefined)} />
          )}
          {activeTab === 'comments' && (
            <CommentsTab content={content} onJump={onJump} />
          )}
          {activeTab === 'changes' && (
            <ChangesTab content={content} onJump={onJump} />
          )}
        </div>
      </aside>
      <div className="cm-sidebar-resizer" onMouseDown={onResizeMouseDown} role="separator" />
    </>
  );
}
