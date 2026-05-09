import { create } from 'zustand';

interface MemoPanelState {
  /** Persisted via preferences. */
  width: number;
  /**
   * Session-only override of the auto-show rule. The panel auto-shows when a
   * document has ≥1 memos; closing the X button flips this to true so the
   * panel stays hidden until the user reopens it (Cmd+Shift+M / menu /
   * resetting). Deliberately NOT persisted — opening a fresh file should
   * always start with the auto-show rule active.
   */
  manuallyHidden: boolean;
  /** Bus for the "scroll/highlight this card" pulse coming from the editor. */
  focusedFrom: number | null;
  setWidth: (w: number) => void;
  setManuallyHidden: (v: boolean) => void;
  toggle: () => void;
  /** Sets the focused-card target. Pass null to clear. */
  setFocusedFrom: (from: number | null) => void;
}

const MIN_WIDTH = 220;
const MAX_WIDTH = 560;

export const useMemoPanelStore = create<MemoPanelState>((set, get) => ({
  width: 320,
  manuallyHidden: false,
  focusedFrom: null,
  setWidth: (w) => set({ width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w)) }),
  setManuallyHidden: (v) => set({ manuallyHidden: v }),
  toggle: () => set({ manuallyHidden: !get().manuallyHidden }),
  setFocusedFrom: (from) => set({ focusedFrom: from }),
}));
