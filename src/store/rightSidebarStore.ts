import { create } from 'zustand';

// Right-side authoring assistance pane (v0.1.8.4). Holds the References
// and AI tabs that previously lived on the left sidebar. State is fully
// independent from `sidebarStore`: toggling one never touches the other,
// the active-tab unions don't overlap, and widths are persisted to
// distinct prefs keys.

export type RightSidebarTab = 'references' | 'ai';

interface RightSidebarState {
  visible: boolean;
  activeTab: RightSidebarTab;
  width: number;
  toggleVisible: () => void;
  setVisible: (v: boolean) => void;
  showWith: (tab: RightSidebarTab) => void;
  setActiveTab: (t: RightSidebarTab) => void;
  setWidth: (w: number) => void;
}

const MIN_WIDTH = 200;
const MAX_WIDTH = 560;

export const useRightSidebarStore = create<RightSidebarState>((set) => ({
  visible: false,
  activeTab: 'references',
  width: 280,
  toggleVisible: () => set((s) => ({ visible: !s.visible })),
  setVisible: (visible) => set({ visible }),
  showWith: (tab) => set({ visible: true, activeTab: tab }),
  setActiveTab: (t) => set({ activeTab: t }),
  setWidth: (w) => set({ width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w)) }),
}));
