import { create } from 'zustand';
import type { EditMode } from '../editor/editMode';

export type AppliedTheme = 'light' | 'dark';
export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * 창 전역 상태만 남는다.
 *
 * 문서 축(경로·내용·미저장 여부·파일 종류)은 `workspaceStore`가 소유한다
 * (SPEC-V03-WORKSPACE-002 REQ-PANEL-010). 미저장 여부는 그곳에서
 * `currentRevision !== savedRevision`으로 **파생**되며, 여기 있던 가변
 * boolean과 `markClean()`은 제거되었다 — 그 명령형 선언이 저장의 await 창
 * 결함과 issue #12 sticky의 형태였기 때문이다(REQ-PANEL-015).
 *
 * 편집 모드는 아직 여기 남아 있다. 모드 값의 출처(패널별 독립 여부,
 * `defaultMode` 의미론)는 OQ-3이 미해결이고 M4가 다룬다 — 패널 축의
 * `displayMode` 필드는 이미 `workspaceStore`에 있으나 배선은 그때 이루어진다.
 */
interface AppState {
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
  theme: 'light',
  themePreference: 'system',
  systemTheme: 'light',
  editMode: 'wysiwyg',
  lastNonMarkdownMode: 'wysiwyg',
  headingHint: false,
  setHeadingHint: (show) => set({ headingHint: show }),
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
