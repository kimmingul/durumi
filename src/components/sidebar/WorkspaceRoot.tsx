import { useCallback, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useFolderTree } from '../../hooks/useFolderTree';
import { useAppStore } from '../../store/appStore';
import { useSidebarStore } from '../../store/sidebarStore';
import { FileTreeNode } from './FileTreeNode';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { bucketForEntry } from './gitStatus';
import {
  copyToClipboard,
  createInside,
  renameTo,
  runOp,
  trashWithConfirm,
  validateName,
} from './fileOps';
import { t } from '../../i18n/t';
import { basenameOf, dirnameOf, relativePathOf } from '../../utils/path';
import type { DirEntry } from '@shared/ipc-contract';

interface WorkspaceRootProps {
  rootPath: string;
  onOpenFile: (path: string) => void;
}

interface MenuState {
  x: number;
  y: number;
  /** null means the menu was opened on the workspace-root header. */
  entry: DirEntry | null;
}

function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform?.startsWith('Mac');
}

export function WorkspaceRoot({ rootPath, onOpenFile }: WorkspaceRootProps) {
  const activeFilePath = useAppStore((s) => s.filePath);
  const removeFolderFromStore = useSidebarStore((s) => s.removeFolder);
  const { rootEntries, childCache, expanded, isLoading, toggleExpand } = useFolderTree(rootPath);
  const statuses = useSidebarStore((s) => s.gitStatus[rootPath]);
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);

  const childExpanded = (path: string) => expanded.has(path);
  const childLoading = (path: string) => isLoading(path);
  const childChildren = (path: string) => childCache.get(path);
  const isActive = (path: string) => path === activeFilePath;
  const label = basenameOf(rootPath, rootPath);
  const getBucket = (entry: DirEntry) =>
    bucketForEntry(entry, rootPath, statuses, childCache);

  const closeMenu = useCallback(() => setMenu(null), []);
  const onContextMenu = useCallback((entry: DirEntry, x: number, y: number) => {
    setMenu({ entry, x, y });
  }, []);
  const onRootContextMenu = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    setMenu({ entry: null, x: e.clientX, y: e.clientY });
  }, []);

  const onRenameCommit = useCallback(
    (entry: DirEntry, raw: string) => {
      const trimmed = raw.trim();
      // No-op when unchanged (or when blur fires after we've already cleared
      // the rename state).
      if (!trimmed || trimmed === entry.name) {
        setRenamingPath(null);
        return;
      }
      const err = validateName(trimmed);
      if (err) {
        window.alert(err);
        setRenamingPath(null);
        return;
      }
      void renameTo(entry.path, trimmed).finally(() => setRenamingPath(null));
    },
    [],
  );
  const onRenameCancel = useCallback(() => setRenamingPath(null), []);

  // Closes the workspace folder. Mirrors what the main-process menu does for
  // the `closeFolder` MenuCommand: drop from prefs, unwatch, remove from
  // store. Keeps the right-click action self-contained without round-tripping
  // through main.
  const closeWorkspaceFolder = useCallback(async () => {
    try {
      const prefs = await window.api.prefsGet();
      const next = (prefs.workspaceFolders ?? []).filter((p) => p !== rootPath);
      await window.api.prefsSet({ workspaceFolders: next });
    } catch {
      // Pref persistence failure shouldn't block closing the folder visually.
    }
    try { await window.api.fsUnwatchRoot(rootPath); } catch { /* idempotent */ }
    removeFolderFromStore(rootPath);
  }, [rootPath, removeFolderFromStore]);

  const buildItems = useCallback((m: MenuState): ContextMenuItem[] => {
    const revealKey = isMacPlatform() ? 'sidebar.menu.revealMac' : 'sidebar.menu.revealOther';
    if (m.entry === null) {
      // Workspace root header.
      return [
        {
          id: 'newFileInside',
          label: t('sidebar.menu.newFileInside'),
          onSelect: () => { void createInside(rootPath, 'file'); },
        },
        {
          id: 'newFolderInside',
          label: t('sidebar.menu.newFolderInside'),
          onSelect: () => { void createInside(rootPath, 'folder'); },
        },
        { id: 'sep1', label: '', separator: true },
        {
          id: 'reveal',
          label: t(revealKey),
          onSelect: () => { void runOp(() => window.api.filesReveal(rootPath)); },
        },
        {
          id: 'copyPath',
          label: t('sidebar.menu.copyPath'),
          onSelect: () => { void copyToClipboard(rootPath); },
        },
        { id: 'sep2', label: '', separator: true },
        {
          id: 'closeFolder',
          label: t('sidebar.menu.closeFolder'),
          onSelect: () => { void closeWorkspaceFolder(); },
        },
      ];
    }
    const e = m.entry;
    const parent = e.isDir ? e.path : dirnameOf(e.path);
    const newFileLabel = e.isDir ? t('sidebar.menu.newFileInside') : t('sidebar.menu.newFile');
    const newFolderLabel = e.isDir
      ? t('sidebar.menu.newFolderInside')
      : t('sidebar.menu.newFolder');
    return [
      {
        id: 'newFile',
        label: newFileLabel,
        onSelect: () => { void createInside(parent, 'file'); },
      },
      {
        id: 'newFolder',
        label: newFolderLabel,
        onSelect: () => { void createInside(parent, 'folder'); },
      },
      { id: 'sep1', label: '', separator: true },
      {
        id: 'rename',
        label: t('sidebar.menu.rename'),
        onSelect: () => { setRenamingPath(e.path); },
      },
      {
        id: 'duplicate',
        label: t('sidebar.menu.duplicate'),
        onSelect: () => { void runOp(() => window.api.filesDuplicate(e.path)); },
      },
      {
        id: 'trash',
        label: t('sidebar.menu.trash'),
        onSelect: () => { void trashWithConfirm(e.path); },
      },
      { id: 'sep2', label: '', separator: true },
      {
        id: 'reveal',
        label: t(revealKey),
        onSelect: () => { void runOp(() => window.api.filesReveal(e.path)); },
      },
      {
        id: 'copyPath',
        label: t('sidebar.menu.copyPath'),
        onSelect: () => { void copyToClipboard(e.path); },
      },
      {
        id: 'copyRelativePath',
        label: t('sidebar.menu.copyRelativePath'),
        onSelect: () => { void copyToClipboard(relativePathOf(rootPath, e.path)); },
      },
    ];
  }, [rootPath, closeWorkspaceFolder]);

  return (
    <div className="cm-tree-workspace">
      <div
        className="cm-tree-root-label"
        title={rootPath}
        onClick={() => setCollapsed((c) => !c)}
        onContextMenu={onRootContextMenu}
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
            onContextMenu={onContextMenu}
            renamingPath={renamingPath}
            onRenameCommit={onRenameCommit}
            onRenameCancel={onRenameCancel}
          />
        ))}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={buildItems(menu)}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
