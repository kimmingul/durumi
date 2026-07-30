import { describe, it, expect } from 'vitest';
import {
  GHOST_TEXT_BOUNDS,
  WIDTH_BOUNDS,
  sanitizePreferencesPatch,
} from '../../shared/prefsValidation';

/**
 * `prefs:set`은 경로 필드만 가드하고(`assertPrefsPatchAllowed`) 값 도메인은
 * 검증하지 않아, 렌더러가 보낸 음수·NaN·범위 밖 숫자와 스키마에 없는 enum
 * 값이 그대로 디스크에 기록되던 결함의 회귀 테스트.
 *
 * 정책: enum 위반은 필드를 drop(기존 저장값 유지), 숫자 범위 위반은 clamp.
 * 둘 다 `rejected`에 점 표기 경로로 기록한다.
 */

describe('sanitizePreferencesPatch — enum 검증', () => {
  it('스키마에 없는 theme 값을 drop한다', () => {
    const r = sanitizePreferencesPatch({ theme: 'neon' as never });
    expect(r.patch.theme).toBeUndefined();
    expect(r.rejected).toContain('theme');
  });

  it('유효한 theme 값은 통과시킨다', () => {
    const r = sanitizePreferencesPatch({ theme: 'dark' });
    expect(r.patch.theme).toBe('dark');
    expect(r.rejected).toEqual([]);
  });

  it('중첩 enum(sidebar.activeTab)을 검증한다', () => {
    const r = sanitizePreferencesPatch({
      sidebar: { activeTab: 'nope' as never, visible: true },
    });
    expect(r.patch.sidebar?.activeTab).toBeUndefined();
    // 같은 객체의 다른 필드는 살아남아야 한다
    expect(r.patch.sidebar?.visible).toBe(true);
    expect(r.rejected).toContain('sidebar.activeTab');
  });

  it('editor.defaultMode / ai.provider / memoPanel.groupBy를 검증한다', () => {
    const r = sanitizePreferencesPatch({
      editor: { defaultMode: 'word' as never },
      ai: { provider: 'gemini' as never },
      memoPanel: { groupBy: 'color' as never },
    });
    expect(r.patch.editor?.defaultMode).toBeUndefined();
    expect(r.patch.ai?.provider).toBeUndefined();
    expect(r.patch.memoPanel?.groupBy).toBeUndefined();
    expect(r.rejected).toEqual(
      expect.arrayContaining(['editor.defaultMode', 'ai.provider', 'memoPanel.groupBy']),
    );
  });
});

describe('sanitizePreferencesPatch — 숫자 범위', () => {
  it('음수 ghostTextSessionCap을 하한으로 clamp한다 (재현 케이스)', () => {
    const r = sanitizePreferencesPatch({ ai: { ghostTextSessionCap: -1 } });
    expect(r.patch.ai?.ghostTextSessionCap).toBe(GHOST_TEXT_BOUNDS.sessionCap.min);
    expect(r.rejected).toContain('ai.ghostTextSessionCap');
  });

  it('과도한 sidebar.width를 상한으로 clamp한다 (재현 케이스)', () => {
    const r = sanitizePreferencesPatch({ sidebar: { width: 1e9 } });
    expect(r.patch.sidebar?.width).toBe(WIDTH_BOUNDS.sidebar.max);
    expect(r.rejected).toContain('sidebar.width');
  });

  it('범위 안의 값은 그대로 두고 rejected에 넣지 않는다', () => {
    const r = sanitizePreferencesPatch({
      sidebar: { width: 300 },
      rightSidebar: { width: 400 },
      memoPanel: { width: 300 },
      ai: { ghostTextIdleMs: 800, ghostTextSessionCap: 100 },
    });
    expect(r.patch.sidebar?.width).toBe(300);
    expect(r.patch.rightSidebar?.width).toBe(400);
    expect(r.patch.memoPanel?.width).toBe(300);
    expect(r.patch.ai?.ghostTextIdleMs).toBe(800);
    expect(r.patch.ai?.ghostTextSessionCap).toBe(100);
    expect(r.rejected).toEqual([]);
  });

  it('패널별로 서로 다른 경계를 적용한다', () => {
    // sidebar 하한 180, rightSidebar 하한 200, memoPanel 하한 220
    const r = sanitizePreferencesPatch({
      sidebar: { width: 10 },
      rightSidebar: { width: 10 },
      memoPanel: { width: 10 },
    });
    expect(r.patch.sidebar?.width).toBe(180);
    expect(r.patch.rightSidebar?.width).toBe(200);
    expect(r.patch.memoPanel?.width).toBe(220);
  });

  it('NaN / Infinity / 숫자 아닌 값은 drop한다', () => {
    const r = sanitizePreferencesPatch({
      sidebar: { width: Number.NaN },
      rightSidebar: { width: Number.POSITIVE_INFINITY },
      memoPanel: { width: '300' as never },
    });
    expect(r.patch.sidebar?.width).toBeUndefined();
    expect(r.patch.rightSidebar?.width).toBeUndefined();
    expect(r.patch.memoPanel?.width).toBeUndefined();
    expect(r.rejected).toEqual(
      expect.arrayContaining(['sidebar.width', 'rightSidebar.width', 'memoPanel.width']),
    );
  });

  it('소수 폭은 정수로 반올림한다', () => {
    const r = sanitizePreferencesPatch({ sidebar: { width: 300.7 } });
    expect(r.patch.sidebar?.width).toBe(301);
  });
});

describe('sanitizePreferencesPatch — 비파괴성', () => {
  it('검증 대상이 아닌 필드는 손대지 않는다', () => {
    const r = sanitizePreferencesPatch({
      author: { name: 'Min-Gul Kim' },
      recentFiles: ['/a/b.md'],
      ai: { anthropicModel: 'claude-sonnet-4-6' },
    });
    expect(r.patch.author?.name).toBe('Min-Gul Kim');
    expect(r.patch.recentFiles).toEqual(['/a/b.md']);
    expect(r.patch.ai?.anthropicModel).toBe('claude-sonnet-4-6');
    expect(r.rejected).toEqual([]);
  });

  it('입력 patch를 변형하지 않는다 (순수 함수)', () => {
    const input = { sidebar: { width: 1e9 } };
    sanitizePreferencesPatch(input);
    expect(input.sidebar.width).toBe(1e9);
  });

  it('빈 patch를 안전하게 처리한다', () => {
    const r = sanitizePreferencesPatch({});
    expect(r.patch).toEqual({});
    expect(r.rejected).toEqual([]);
  });
});
