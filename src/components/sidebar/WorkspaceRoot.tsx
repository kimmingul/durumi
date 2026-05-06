import { useState } from 'react';
import { useFolderTree } from '../../hooks/useFolderTree';
import { useAppStore } from '../../store/appStore';
import { useSidebarStore } from '../../store/sidebarStore';
import { FileTreeNode } from './FileTreeNode';
import { bucketForEntry } from './gitStatus';
import type { DirEntry } from '@shared/ipc-contract';
import { basenameOf } from '../../utils/path';

interface WorkspaceRootProps {
  rootPath: string;
  onOpenFile: (path: string) => void;
}

export function WorkspaceRoot({ rootPath, onOpenFile }: WorkspaceRootProps) {
  const activeFilePath = useAppStore((s) => s.filePath);
  const { rootEntries, childCache, expanded, isLoading, toggleExpand } = useFolderTree(rootPath);
  const statuses = useSidebarStore((s) => s.gitStatus[rootPath]);
  const [collapsed, setCollapsed] = useState(false);

  const childExpanded = (path: string) => expanded.has(path);
  const childLoading = (path: string) => isLoading(path);
  const childChildren = (path: string) => childCache.get(path);
  const isActive = (path: string) => path === activeFilePath;
  const label = basenameOf(rootPath, rootPath);
  const getBucket = (entry: DirEntry) =>
    bucketForEntry(entry, rootPath, statuses, childCache);

  return (
    <div className="cm-tree-workspace">
      <div
        className="cm-tree-root-label"
        title={rootPath}
        onClick={() => setCollapsed((c) => !c)}
        role="button"
      >
        <span className="cm-tree-caret">{collapsed ? '▶' : '▼'}</span>
        <span className="cm-tree-name">{label}</span>
      </div>
      {!collapsed &&
        rootEntries.map((e) => (
          <FileTreeNode
            key={e.path}
            entry={e}
            depth={0}
            expanded={childExpanded(e.path)}
            loading={childLoading(e.path)}
            isActiveFile={isActive(e.path)}
            childEntries={childChildren(e.path)}
            childExpanded={childExpanded}
            childLoading={childLoading}
            childChildren={childChildren}
            isActive={isActive}
            onToggle={(p) => void toggleExpand(p)}
            onOpenFile={onOpenFile}
            getBucket={getBucket}
          />
        ))}
    </div>
  );
}
