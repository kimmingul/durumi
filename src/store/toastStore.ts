import { create } from 'zustand';

export interface ToastAction {
  /** Localized button label. */
  label: string;
  /**
   * Invoked when the user clicks the action. The toast dismisses immediately
   * after the handler resolves; throwing keeps the toast visible so the
   * caller can show a follow-up error toast.
   */
  run: () => void | Promise<void>;
}

export interface ToastEntry {
  id: number;
  message: string;
  action: ToastAction | null;
  /** Auto-dismiss delay in ms. `null` means manual dismiss only. */
  ttlMs: number | null;
}

export interface ShowToastOptions {
  message: string;
  action?: ToastAction;
  ttlMs?: number | null;
}

interface ToastState {
  toasts: ToastEntry[];
  show: (opts: ShowToastOptions) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: ({ message, action, ttlMs }) => {
    const id = nextId++;
    const entry: ToastEntry = {
      id,
      message,
      action: action ?? null,
      ttlMs: ttlMs === undefined ? 6000 : ttlMs,
    };
    set((s) => ({ toasts: [...s.toasts, entry] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Module-scoped helper for non-React call sites (e.g. imagePaste handlers). */
export function showToast(opts: ShowToastOptions): number {
  return useToastStore.getState().show(opts);
}

export function dismissToast(id: number): void {
  useToastStore.getState().dismiss(id);
}
