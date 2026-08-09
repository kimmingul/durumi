import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../src/store/appStore';

/**
 * 창 전역 상태만 남은 `appStore`의 계약.
 *
 * 문서 축(경로·내용·미저장 여부)은 `workspaceStore`로 이관되었고
 * (SPEC-V03-WORKSPACE-002 REQ-PANEL-010) 여기 남은 것은 테마와 편집 모드다.
 * 모드 전환 두 갈래는 그동안 스토어 수준 검사가 없었다 — 문서 필드가 빠지면서
 * 드러난 공백이므로 여기서 메운다.
 */

beforeEach(() => {
  useAppStore.setState({
    theme: 'light',
    themePreference: 'system',
    systemTheme: 'light',
    editMode: 'wysiwyg',
    lastNonMarkdownMode: 'wysiwyg',
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

describe('편집 모드 전환', () => {
  it('markdown이 아닌 모드로 바꾸면 그것이 마지막 비-markdown 모드가 된다', () => {
    useAppStore.getState().setEditMode('typora');
    expect(useAppStore.getState().editMode).toBe('typora');
    expect(useAppStore.getState().lastNonMarkdownMode).toBe('typora');
  });

  it('markdown으로 바꿔도 마지막 비-markdown 모드는 보존된다', () => {
    useAppStore.getState().setEditMode('typora');
    useAppStore.getState().setEditMode('markdown');
    expect(useAppStore.getState().editMode).toBe('markdown');
    expect(useAppStore.getState().lastNonMarkdownMode, '되돌아갈 모드를 잃었다').toBe('typora');
  });

  it('토글은 markdown과 직전 모드를 오간다', () => {
    useAppStore.getState().setEditMode('typora');

    useAppStore.getState().toggleSourceMode();
    expect(useAppStore.getState().editMode).toBe('markdown');

    useAppStore.getState().toggleSourceMode();
    expect(useAppStore.getState().editMode).toBe('typora');
  });
});

describe('제목 안내 플래그', () => {
  it('표시용 플래그일 뿐 다른 상태를 건드리지 않는다', () => {
    useAppStore.getState().setHeadingHint(true);
    expect(useAppStore.getState().headingHint).toBe(true);
    expect(useAppStore.getState().editMode).toBe('wysiwyg');
  });
});
