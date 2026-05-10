import { create } from 'zustand';

export type SidebarTab = 'files' | 'outline' | 'search' | 'comments' | 'changes' | 'references' | 'ai';

interface SidebarState {
  visible: boolean;
  activeTab: SidebarTab;
  width: number;
  workspaceFolders: string[];
  activeHeadingLine: number | null;
  /** root path -> repo-relative path -> bucket name (e.g. "modified"). */
  gitStatus: Record<string, Record<string, string>>;
  toggleVisible: () => void;
  showWith: (tab: SidebarTab) => void;
  setActiveTab: (t: SidebarTab) => void;
  setWidth: (w: number) => void;
  setWorkspaceFolders: (paths: string[]) => void;
  addFolder: (path: string) => void;
  removeFolder: (path: string) => void;
  setActiveHeadingLine: (l: number | null) => void;
  updateGitStatus: (root: string, statuses: Record<string, string>) => void;
  clearGitStatus: (root: string) => void;
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 480;

export const useSidebarStore = create<SidebarState>((set) => ({
  visible: true,
  activeTab: 'files',
  width: 240,
  workspaceFolders: [],
  activeHeadingLine: null,
  gitStatus: {},
  toggleVisible: () => set((s) => ({ visible: !s.visible })),
  showWith: (tab) => set({ visible: true, activeTab: tab }),
  setActiveTab: (t) => set({ activeTab: t }),
  setWidth: (w) => set({ width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w)) }),
  setWorkspaceFolders: (paths) => {
    // Dedupe in order.
    const seen = new Set<string>();
    const next: string[] = [];
    for (const p of paths) {
      if (!seen.has(p)) {
        seen.add(p);
        next.push(p);
      }
    }
    set({ workspaceFolders: next });
  },
  addFolder: (path) =>
    set((s) =>
      s.workspaceFolders.includes(path)
        ? s
        : { workspaceFolders: [...s.workspaceFolders, path] },
    ),
  removeFolder: (path) =>
    set((s) => {
      const nextStatus = { ...s.gitStatus };
      delete nextStatus[path];
      return {
        workspaceFolders: s.workspaceFolders.filter((p) => p !== path),
        gitStatus: nextStatus,
      };
    }),
  setActiveHeadingLine: (l) => set({ activeHeadingLine: l }),
  updateGitStatus: (root, statuses) =>
    set((s) => ({ gitStatus: { ...s.gitStatus, [root]: statuses } })),
  clearGitStatus: (root) =>
    set((s) => {
      if (!(root in s.gitStatus)) return s;
      const next = { ...s.gitStatus };
      delete next[root];
      return { gitStatus: next };
    }),
}));
