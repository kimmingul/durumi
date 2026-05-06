import { create } from 'zustand';

export type AppliedTheme = 'light' | 'dark';
export type ThemePreference = 'system' | 'light' | 'dark';

interface AppState {
  filePath: string | null;
  content: string;
  isDirty: boolean;
  theme: AppliedTheme;
  themePreference: ThemePreference;
  systemTheme: AppliedTheme;
  sourceMode: boolean;
  setContent: (content: string) => void;
  markClean: () => void;
  setFile: (path: string | null, content: string) => void;
  setThemePreference: (p: ThemePreference) => void;
  setSystemTheme: (t: AppliedTheme) => void;
  toggleSourceMode: () => void;
}

function resolveTheme(pref: ThemePreference, system: AppliedTheme): AppliedTheme {
  return pref === 'system' ? system : pref;
}

export const useAppStore = create<AppState>((set, get) => ({
  filePath: null,
  content: '',
  isDirty: false,
  theme: 'light',
  themePreference: 'system',
  systemTheme: 'light',
  sourceMode: false,
  setContent: (content) => set((s) => ({ content, isDirty: s.content !== content || s.isDirty })),
  markClean: () => set({ isDirty: false }),
  setFile: (path, content) => set({ filePath: path, content, isDirty: false }),
  setThemePreference: (p) => set({
    themePreference: p,
    theme: resolveTheme(p, get().systemTheme),
  }),
  setSystemTheme: (t) => set({
    systemTheme: t,
    theme: resolveTheme(get().themePreference, t),
  }),
  toggleSourceMode: () => set((s) => ({ sourceMode: !s.sourceMode })),
}));
