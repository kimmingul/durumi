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
  } = props;
  const indent = { paddingLeft: `${depth * 14 + 8}px` };
  const bucket = getBucket(entry);
  const dot = bucket
    ? <span className={`cm-tree-git-dot cm-tree-git-${bucket}`} aria-label={`git ${bucket}`}>●</span>
    : null;
  if (entry.isDir) {
    return (
      <div className="cm-tree-node-group">
        <div
          className="cm-tree-row cm-tree-row-dir"
          style={indent}
          onClick={() => onToggle(entry.path)}
          role="treeitem"
          aria-expanded={expanded}
        >
          <span className="cm-tree-caret">{expanded ? '▼' : '▶'}</span>
          <span className="cm-tree-name">{entry.name}</span>
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
      onClick={() => onOpenFile(entry.path)}
      role="treeitem"
    >
      <span className="cm-tree-caret-spacer" />
      <span className="cm-tree-name">{entry.name}</span>
      {dot}
    </div>
  );
}
