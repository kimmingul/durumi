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
 * 편집 모드는 M4에서 **패널 축으로 옮겨갔다**(REQ-PANEL-021, OQ-3 확정 = 후보 1).
 * 살아 있는 모드는 이제 `PanelState.displayMode`이고, 여기 남은 `defaultMode`는
 * **새 원고 패널의 초기값**이라는 좁은 역할만 갖는다(REQ-PANEL-023).
 *
 * 두 필드를 다 남긴 이유: 둘은 같은 것의 사본이 아니라 **서로 다른 것**이다.
 * `defaultMode`는 세션을 가로질러 지속되는 사용자 선호이고(`prefs`가 출처),
 * `displayMode`는 지금 이 패널이 무엇을 보여주는가다. 하나로 합치면 마지막으로
 * 모드를 바꾼 패널이 다음 세션의 모든 패널을 규정한다 — REQ-PANEL-023이 금지하는
 * 형태이며 기각된 후보 2가 정확히 그것이다.
 *
 * `lastNonMarkdownMode`와 `toggleSourceMode`도 함께 패널 축으로 갔다. 되돌아갈
 * 모드의 기억을 창 전역에 두면 패널 A의 토글이 패널 B의 목적지를 규정한다.
 */
interface AppState {
  theme: AppliedTheme;
  themePreference: ThemePreference;
  systemTheme: AppliedTheme;
  /**
   * 새로 여는 원고 패널의 **초기** 표시 모드 (REQ-PANEL-023).
   *
   * 출처는 `prefs.editor.defaultMode`이며 `usePreferencesInit`이 부팅 때 한 번
   * 채운다. 패널의 모드 변경은 이 값을 덮어쓰지 **않는다**.
   */
  defaultMode: EditMode;
  /**
   * 캐럿이 `#foo` 처럼 "공백만 넣으면 제목이 되는" 줄에 있는지.
   * `src/editor/headingHint.ts` 의 ViewPlugin 이 상태 전이에서만 갱신하고
   * StatusBar 가 읽는다. 문서는 건드리지 않는 순수 표시용 플래그다.
   */
  headingHint: boolean;
  setHeadingHint: (show: boolean) => void;
  setThemePreference: (p: ThemePreference) => void;
  setSystemTheme: (t: AppliedTheme) => void;
  setDefaultMode: (mode: EditMode) => void;
}

function resolveTheme(pref: ThemePreference, system: AppliedTheme): AppliedTheme {
  return pref === 'system' ? system : pref;
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: 'light',
  themePreference: 'system',
  systemTheme: 'light',
  defaultMode: 'wysiwyg',
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
  setDefaultMode: (mode) => set({ defaultMode: mode }),
}));
