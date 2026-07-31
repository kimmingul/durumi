import { create } from 'zustand';
import type { EditMode } from '../editor/editMode';

export type AppliedTheme = 'light' | 'dark';
export type ThemePreference = 'system' | 'light' | 'dark';

interface AppState {
  filePath: string | null;
  content: string;
  isDirty: boolean;
  theme: AppliedTheme;
  themePreference: ThemePreference;
  systemTheme: AppliedTheme;
  /**
   * v0.1.11 — three-way editor display mode. Initial value `wysiwyg` is the
   * shipped default; on launch `App` overwrites this with the user's
   * `prefs.editor.defaultMode`.
   */
  editMode: EditMode;
  /** Remember the last non-markdown mode so `Cmd+/` can toggle Markdown ↔ previous. */
  lastNonMarkdownMode: Exclude<EditMode, 'markdown'>;
  /**
   * 캐럿이 `#foo` 처럼 "공백만 넣으면 제목이 되는" 줄에 있는지.
   * `src/editor/headingHint.ts` 의 ViewPlugin 이 상태 전이에서만 갱신하고
   * StatusBar 가 읽는다. 문서는 건드리지 않는 순수 표시용 플래그다.
   */
  headingHint: boolean;
  setHeadingHint: (show: boolean) => void;
  setContent: (content: string) => void;
  markClean: () => void;
  setFile: (path: string | null, content: string) => void;
  setThemePreference: (p: ThemePreference) => void;
  setSystemTheme: (t: AppliedTheme) => void;
  setEditMode: (mode: EditMode) => void;
  /** Toggle between Markdown and the previous (WYSIWYG/Typora) mode. */
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
  editMode: 'wysiwyg',
  lastNonMarkdownMode: 'wysiwyg',
  headingHint: false,
  setHeadingHint: (show) => set({ headingHint: show }),
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
  setEditMode: (mode) => set((s) => ({
    editMode: mode,
    lastNonMarkdownMode: mode === 'markdown' ? s.lastNonMarkdownMode : mode,
  })),
  toggleSourceMode: () => set((s) => ({
    editMode: s.editMode === 'markdown' ? s.lastNonMarkdownMode : 'markdown',
  })),
}));
