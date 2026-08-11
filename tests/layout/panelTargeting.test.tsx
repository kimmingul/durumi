import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { installFakeApi, mountApp, type MountedApp } from '../_helpers/appHarness';
import { useWorkspaceStore } from '../../src/store/workspaceStore';

/**
 * SPEC-V03-WORKSPACE-002 M4-2 — **패널 지목 수단**(`plan.md` §B.8, `design.md` §9.2).
 *
 * ## 왜 계약 산출물인가
 *
 * 지목 수단이 없으면 "패널 A에만 배너가 뜬다"·"패널 A의 조합이 패널 B를 보류시키지
 * 않는다" 같은 AC가 **공허하게 통과한다** — 검사자가 두 패널을 갈라 볼 수단이
 * 없으므로 창 전역 단일 배너를 쓰는 구현도, 게이트를 공유하는 구현도 같은 초록을
 * 낸다. 그래서 지목 수단 자체를 먼저 고정한다.
 *
 * ## 왜 `panelId`가 아니라 index·active인가
 *
 * `panelId`는 런타임 생성 문자열이라 e2e가 예측할 수 없다. 그래서 지목 축은 두
 * 개다: **위치**(`data-panel-index`, 렌더 순서 0-based)와 **활성 여부**
 * (`data-panel-active`, 활성 패널에만 존재). 유닛과 e2e가 같은 속성을 쓴다.
 *
 * ## 왜 최외곽 래퍼인가
 *
 * 지목한 요소의 하위에 그 패널의 **모든 것**(툴바·배너·편집 표면)이 들어 있어야
 * "패널 A 영역 안"이라는 문언이 판정 가능해진다. 편집 표면에만 표식을 달면
 * 배너가 그 밖에 있어 AC-PANEL-053을 검사할 수 없다.
 */

const store = () => useWorkspaceStore.getState();

let app: MountedApp | null = null;

function panels(app: MountedApp): HTMLElement[] {
  return [...app.host.querySelectorAll('[data-panel]')] as HTMLElement[];
}

beforeEach(() => {
  store().reset();
  installFakeApi({ memoSidecarRead: async () => null, filesIndex: async () => [] });
});

afterEach(() => {
  app?.unmount();
  app = null;
  store().reset();
});

describe('패널 지목 수단 — 표식이 패널마다 하나씩 붙는다', () => {
  it('단일 패널에서도 표식이 하나 있고 index가 0이다', () => {
    app = mountApp();
    const found = panels(app);
    expect(found, '패널 표식이 없다 — 지목 수단이 도입되지 않았다').toHaveLength(1);
    expect(found[0]!.dataset.panelIndex).toBe('0');
  });

  it('패널이 늘면 표식도 늘고 index가 렌더 순서를 따른다', () => {
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
    });
    act(() => {
      store().openInNewPanel('/w/c.md', 'C\n');
    });
    const found = panels(app);
    expect(found).toHaveLength(3);
    expect(found.map((el) => el.dataset.panelIndex)).toEqual(['0', '1', '2']);
  });

  it('표식 요소가 그 패널의 편집 표면을 정확히 하나 품는다', () => {
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
    });
    for (const el of panels(app)) {
      expect(el.querySelectorAll('.cm-content')).toHaveLength(1);
    }
    // 지목 요소는 서로를 품지 않는다 — 중첩되면 "패널 A 안"이 모호해진다.
    const [first, second] = panels(app);
    expect(first!.contains(second!)).toBe(false);
    expect(second!.contains(first!)).toBe(false);
  });
});

describe('패널 지목 수단 — 활성 표식은 활성 패널에만 있다', () => {
  it('활성 표식이 정확히 하나이고 activePanelId가 가리키는 패널이다', () => {
    app = mountApp();
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
    });
    const active = [...app.host.querySelectorAll('[data-panel-active]')];
    expect(active, '활성 표식이 하나가 아니다').toHaveLength(1);

    // 활성 패널은 방금 만든 두 번째 패널이다 — `openInNewPanel`이 활성으로 만든다.
    const index = store().panels.findIndex((p) => p.panelId === store().activePanelId);
    expect((active[0] as HTMLElement).dataset.panelIndex).toBe(String(index));
  });

  it('활성 패널이 바뀌면 표식이 그쪽으로 옮겨간다', () => {
    app = mountApp();
    const panelA = store().activePanelId!;
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
    });
    expect(
      (app.host.querySelector('[data-panel-active]') as HTMLElement).dataset.panelIndex,
    ).toBe('1');

    act(() => {
      store().setActivePanel(panelA);
    });
    const active = [...app.host.querySelectorAll('[data-panel-active]')];
    expect(active, '활성 표식이 둘 이상 남았다 — 이전 표식이 걷히지 않았다').toHaveLength(1);
    expect((active[0] as HTMLElement).dataset.panelIndex).toBe('0');
  });
});

describe('패널 지목 수단 — 표식은 배치를 바꾸지 않는다', () => {
  it('표식 요소에 시각 스타일이 붙지 않는다', () => {
    app = mountApp();
    const el = panels(app)[0]!;
    for (const painted of ['border', 'background', 'backgroundColor', 'padding', 'margin']) {
      expect(el.style[painted as 'border'], `지목 요소가 ${painted}를 갖는다`).toBe('');
    }
  });
});
