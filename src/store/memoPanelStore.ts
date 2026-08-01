import { create } from 'zustand';
import { WIDTH_BOUNDS } from '@shared/prefsValidation';

/**
 * v0.2.30 — 메모는 독립 패널이 아니라 오른쪽 사이드바의 탭이 되었다.
 * 그래서 자동 노출 규칙(`manuallyHidden` / `toggle`)은 사라졌고, 노출 여부는
 * `rightSidebarStore` 가 소유한다. 이 스토어에 남은 책임은 두 가지뿐이다.
 *
 *  - `focusedFrom`: 에디터 → 메모 카드 "스크롤 + 강조" 펄스 버스(여전히 사용).
 *  - `width`: 표시에는 더 이상 쓰이지 않는다. prefs 계약(`prefs.memoPanel.width`)
 *    이 그대로 남아 있고 `usePreferencesInit` 이 계속 채워주므로, 훗날 메모를
 *    분리 창으로 띄우는 모드를 위해 자리를 지켜둔다.
 */
interface MemoPanelState {
  /** Persisted via preferences. 현재 렌더링에는 쓰이지 않는다(위 주석 참조). */
  width: number;
  /** Bus for the "scroll/highlight this card" pulse coming from the editor. */
  focusedFrom: number | null;
  setWidth: (w: number) => void;
  /** Sets the focused-card target. Pass null to clear. */
  setFocusedFrom: (from: number | null) => void;
}

// 폭 경계의 단일 원천은 @shared/prefsValidation (main의 setPreferences와 공유).
const { min: MIN_WIDTH, max: MAX_WIDTH } = WIDTH_BOUNDS.memoPanel;

export const useMemoPanelStore = create<MemoPanelState>((set) => ({
  width: 320,
  focusedFrom: null,
  setWidth: (w) => set({ width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w)) }),
  setFocusedFrom: (from) => set({ focusedFrom: from }),
}));
