import { useSidebarStore } from '../../store/sidebarStore';
import { useLanguage, t } from '../../i18n/t';
import { WorkspaceRoot } from './WorkspaceRoot';

interface FileTreeProps {
  onOpenFile: (path: string) => void;
}

export function FileTree({ onOpenFile }: FileTreeProps) {
  const workspaceFolders = useSidebarStore((s) => s.workspaceFolders);
  const addFolder = useSidebarStore((s) => s.addFolder);
  const updateGitStatus = useSidebarStore((s) => s.updateGitStatus);
  // Subscribe to language so labels re-render on switch.
  useLanguage();

  if (workspaceFolders.length === 0) {
    return (
      <div className="cm-tree-empty">
        <p>{t('sidebar.empty.files')}</p>
        <button
          className="cm-tree-open-btn"
          onClick={async () => {
            const p = await window.api.dialogOpenFolder();
            if (!p) return;
            const current = useSidebarStore.getState().workspaceFolders;
            if (current.includes(p)) return;
            addFolder(p);
            void window.api.fsWatchRoot(p);
            void window.api.gitGetStatus(p).then((s) => updateGitStatus(p, s)).catch(() => {});
            void window.api.prefsSet({ workspaceFolders: [...current, p] });
          }}
        >
          {t('sidebar.openFolder')}
        </button>
      </div>
    );
  }

  return (
    <div className="cm-tree" role="tree">
      {workspaceFolders.map((root) => (
        <WorkspaceRoot key={root} rootPath={root} onOpenFile={onOpenFile} />
      ))}
    </div>
  );
}
