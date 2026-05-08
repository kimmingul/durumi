import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import type { DirEntry } from '@shared/ipc-contract';
import type { StatusBucket } from './gitStatus';

interface FileTreeNodeProps {
  entry: DirEntry;
  depth: number;
  expanded: boolean;
  loading: boolean;
  isActiveFile: boolean;
  childEntries: DirEntry[] | undefined;
  childExpanded: (path: string) => boolean;
  childLoading: (path: string) => boolean;
  childChildren: (path: string) => DirEntry[] | undefined;
  isActive: (path: string) => boolean;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
  /**
   * Returns the git-status bucket for `entry`, or null if there is no status
   * (not in a repo, file is untouched, or status hasn't been fetched yet).
   * Render path must NOT block on git — the caller should hand back whatever
   * is already in the store and re-render once status arrives.
   */
  getBucket: (entry: DirEntry) => StatusBucket | null;
  /**
   * Right-click handler. The parent owns the context-menu state; this node
   * just forwards the entry plus viewport coordinates of the click.
   */
  onContextMenu?: (entry: DirEntry, x: number, y: number) => void;
  /**
   * Path currently being renamed inline. When equal to `entry.path` the row
   * renders a text input in place of the label.
   */
  renamingPath?: string | null;
  /** Commit the inline rename. Receives the trimmed new name. */
  onRenameCommit?: (entry: DirEntry, newName: string) => void;
  /** Cancel the inline rename without making any IPC calls. */
  onRenameCancel?: () => void;
}

export function FileTreeNode(props: FileTreeNodeProps) {
  const {
    entry,
    depth,
    expanded,
    loading,
    isActiveFile,
    childEntries,
    childExpanded,
    childLoading,
    childChildren,
    isActive,
    onToggle,
    onOpenFile,
    getBucket,
    onContextMenu,
    renamingPath,
    onRenameCommit,
    onRenameCancel,
  } = props;
  const indent = { paddingLeft: `${depth * 14 + 8}px` };
  const bucket = getBucket(entry);
  const dot = bucket
    ? <span className={`cm-tree-git-dot cm-tree-git-${bucket}`} aria-label={`git ${bucket}`}>●</span>
    : null;
  const isRenaming = renamingPath === entry.path;
  const handleContext = (e: ReactMouseEvent) => {
    if (!onContextMenu) return;
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(entry, e.clientX, e.clientY);
  };
  const labelOrInput = isRenaming ? (
    <RenameInput
      initialValue={entry.name}
      onCommit={(name) => onRenameCommit?.(entry, name)}
      onCancel={() => onRenameCancel?.()}
    />
  ) : (
    <span className="cm-tree-name">{entry.name}</span>
  );
  if (entry.isDir) {
    return (
      <div className="cm-tree-node-group">
        <div
          className="cm-tree-row cm-tree-row-dir"
          style={indent}
          onClick={() => { if (!isRenaming) onToggle(entry.path); }}
          onContextMenu={handleContext}
          role="treeitem"
          aria-expanded={expanded}
        >
          <span className="cm-tree-caret">{expanded ? '▼' : '▶'}</span>
          {labelOrInput}
          {dot}
          {loading && <span className="cm-tree-loading">…</span>}
        </div>
        {expanded && childEntries && (
          <div role="group">
            {childEntries.map((c) => (
              <FileTreeNode
                key={c.path}
                entry={c}
                depth={depth + 1}
                expanded={childExpanded(c.path)}
                loading={childLoading(c.path)}
                isActiveFile={isActive(c.path)}
                childEntries={childChildren(c.path)}
                childExpanded={childExpanded}
                childLoading={childLoading}
                childChildren={childChildren}
                isActive={isActive}
                onToggle={onToggle}
                onOpenFile={onOpenFile}
                getBucket={getBucket}
                onContextMenu={onContextMenu}
                renamingPath={renamingPath}
                onRenameCommit={onRenameCommit}
                onRenameCancel={onRenameCancel}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
  const cls = 'cm-tree-row cm-tree-row-file' + (isActiveFile ? ' cm-tree-row-active' : '');
  return (
    <div
      className={cls}
      style={indent}
      onClick={() => { if (!isRenaming) onOpenFile(entry.path); }}
      onContextMenu={handleContext}
      role="treeitem"
    >
      <span className="cm-tree-caret-spacer" />
      {labelOrInput}
      {dot}
    </div>
  );
}

interface RenameInputProps {
  initialValue: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

function RenameInput({ initialValue, onCommit, onCancel }: RenameInputProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  // Auto-focus on mount and select the basename portion (everything before
  // the final `.`), matching VS Code / Finder rename UX.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = initialValue.lastIndexOf('.');
    const end = dot > 0 ? dot : initialValue.length;
    try { el.setSelectionRange(0, end); } catch {
      // Some jsdom builds don't implement setSelectionRange on text inputs.
    }
  }, [initialValue]);
  return (
    <input
      ref={ref}
      type="text"
      defaultValue={initialValue}
      className="cm-tree-rename-input"
      data-testid="cm-tree-rename-input"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit(e.currentTarget.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={(e) => onCommit(e.currentTarget.value)}
    />
  );
}
