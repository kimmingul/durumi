import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../src/store/appStore';

/**
 * 창 전역 상태만 남은 `appStore`의 계약.
 *
 * 문서 축(경로·내용·미저장 여부)은 `workspaceStore`로 이관되었고
 * (SPEC-V03-WORKSPACE-002 REQ-PANEL-010), **표시 모드는 M4에서 패널 축으로**
 * 이관되었다(REQ-PANEL-021). 여기 남은 것은 테마와 `defaultMode` — 새 원고
 * 패널의 초기값이라는 좁은 역할이다(REQ-PANEL-023).
 *
 * 모드 전환 두 갈래(`setPanelDisplayMode`·`togglePanelSourceMode`)의 검사는
 * `tests/store/panelDisplayMode.test.ts`로 옮겨갔다 — 삭제가 아니라 이관이며,
 * 거기서는 "한 패널의 변경이 다른 패널로 새지 않는가"까지 함께 본다.
 */

beforeEach(() => {
  useAppStore.setState({
    theme: 'light',
    themePreference: 'system',
    systemTheme: 'light',
    defaultMode: 'wysiwyg',
    headingHint: false,
  });
});

describe('테마 해석', () => {
  it('system이면 OS 테마를 따른다', () => {
    useAppStore.getState().setSystemTheme('dark');
    expect(useAppStore.getState().theme).toBe('dark');
  });

  it('명시 선호가 있으면 OS 테마를 무시한다', () => {
    useAppStore.getState().setThemePreference('light');
    useAppStore.getState().setSystemTheme('dark');
    expect(useAppStore.getState().theme).toBe('light');
  });

  it('선호를 바꾸면 즉시 반영된다', () => {
    useAppStore.getState().setSystemTheme('dark');
    useAppStore.getState().setThemePreference('dark');
    expect(useAppStore.getState().theme).toBe('dark');
    useAppStore.getState().setThemePreference('system');
    expect(useAppStore.getState().theme).toBe('dark');
  });
});

describe('기본 표시 모드', () => {
  it('설정하면 그대로 남는다 — 새 원고 패널이 읽어갈 값이다', () => {
    useAppStore.getState().setDefaultMode('typora');
    expect(useAppStore.getState().defaultMode).toBe('typora');
  });

  it('되돌아갈 모드의 기억을 여기 두지 않는다', () => {
    // 창 전역에 두면 패널 A의 토글이 패널 B의 목적지를 규정한다. 그 기억은
    // `PanelState.lastNonMarkdownMode`에 있다(REQ-PANEL-021).
    expect('lastNonMarkdownMode' in useAppStore.getState()).toBe(false);
    expect('toggleSourceMode' in useAppStore.getState()).toBe(false);
  });
});

describe('제목 안내 플래그', () => {
  it('표시용 플래그일 뿐 다른 상태를 건드리지 않는다', () => {
    useAppStore.getState().setHeadingHint(true);
    expect(useAppStore.getState().headingHint).toBe(true);
    expect(useAppStore.getState().defaultMode).toBe('wysiwyg');
  });
});
