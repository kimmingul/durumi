import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installFakeApi, mountApp, layoutDigest, layoutFacts } from '../_helpers/appHarness';
import { useWorkspaceStore } from '../../src/store/workspaceStore';

/**
 * SPEC-V03-WORKSPACE-002 M2 — **단일 패널 축퇴는 관측 불가능해야 한다**.
 *
 * `plan.md` §C M2가 이 마일스톤의 1차 산출물로 지목한 성질이다. 분할하지 않는
 * 사용자 — 오늘 이 앱을 쓰는 거의 모든 경우 — 는 패널 셸이 들어왔다는 사실을
 * 어떤 방법으로도 알아챌 수 없어야 한다.
 *
 * ## 기준선 앵커
 *
 * `tests/fixtures/singlePanelLayout.json`은 **M2 착수 직전 커밋 `bd62b80`** 의
 * 렌더 트리에서 뜬 것이다. `acceptance.md` AC-PANEL-003b는 앵커로 `2541727`
 * (M0 착수 전)을 지목했으나 `bd62b80`을 택했고, 근거는 두 가지다:
 *
 *  1. **두 커밋 사이에 렌더 구조 변화가 없다.** `git diff 2541727 bd62b80 --
 *     src/App.tsx src/components/` 의 JSX 요소 수준 변화는
 *     `<ReconciliationSurface />` → `<ReconciliationSurface path={filePath} />`
 *     **prop 추가 한 건뿐**이며 요소·형제 순서·flex 스타일은 그대로다. M0·M1은
 *     상태 계층 변경이었다.
 *  2. **`bd62b80`은 사용자가 실제 구동으로 동작을 확인한 트리다.** 재구성해야
 *     하는 과거 트리보다 강한 기준선이다.
 *
 * ## 픽스처를 재기준화하지 않는다
 *
 * M2는 중앙 영역에 통과용 노드 **한 겹**(`data-panel-container`)을 더한다. 그
 * 노드가 필요한 이유는 `PanelContainer`의 주석에 있다 — 없으면 1↔2 전환에서
 * 살아남는 패널이 재부모화되어 캐럿·스크롤·실행 취소가 사라진다(AC-PANEL-005).
 *
 * 그렇다고 픽스처를 새로 뜨면 **기준선이 구현을 따라가** 회귀 방어선이 사라진다.
 * 그래서 픽스처는 `bd62b80` 그대로 두고, 테스트가 **허용하는 델타를 이름으로
 * 명시**한다: 통과용 노드 한 겹을 걷어낸 뒤 기준선과 완전히 같아야 한다. 다른
 * 어떤 차이도 이 검사를 깨뜨린다.
 */

interface DigestNode {
  tag: string;
  className: string;
  style: Record<string, string>;
  data: Record<string, string>;
  children: DigestNode[];
}

/** 통과용 노드 한 겹을 걷어낸다 — 그 자식들을 부모 자리에 편다. */
function stripPanelContainer(node: DigestNode): DigestNode {
  return {
    ...node,
    children: node.children
      .flatMap((c) => ('data-panel-container' in c.data ? c.children : [c]))
      .map(stripPanelContainer),
  };
}

/** 기준선과 같은 깊이에서 비교하려고 다시 자른다. */
function truncate(node: DigestNode, maxDepth: number, depth = 0): DigestNode {
  return {
    ...node,
    children:
      depth >= maxDepth ? [] : node.children.map((c) => truncate(c, maxDepth, depth + 1)),
  };
}

/**
 * 노드 한 겹을 걷어내면 그만큼 깊은 곳이 드러나므로, 한 겹 더 깊게 뜬 뒤
 * 걷어내고 기준선 깊이로 자른다.
 */
function comparableDigest(host: HTMLElement): DigestNode {
  return truncate(stripPanelContainer(layoutDigest(host, 5) as unknown as DigestNode), 4);
}

const FIXTURE = JSON.parse(
  readFileSync(join(process.cwd(), 'tests', 'fixtures', 'singlePanelLayout.json'), 'utf8'),
) as { anchorCommit: string; facts: Record<string, number>; digest: unknown };

beforeEach(() => {
  useWorkspaceStore.getState().reset();
  installFakeApi();
});
afterEach(() => useWorkspaceStore.getState().reset());

describe('AC-PANEL-003b — 단일 패널 축퇴가 오늘의 동작과 관측상 구분되지 않는다', () => {
  it('통과용 노드 한 겹을 걷어내면 기준선 픽스처와 완전히 같다', () => {
    const app = mountApp();
    expect(comparableDigest(app.host)).toEqual(FIXTURE.digest);
    app.unmount();
  });

  it('추가된 노드는 통과용이며 배치도 시각 요소도 바꾸지 않는다', () => {
    const app = mountApp();
    const wrapper = app.host.querySelector('[data-panel-container]') as HTMLElement;
    expect(wrapper, '통과용 노드가 없다').not.toBeNull();

    // 중앙 열 자리를 그대로 이어받는다 — 남는 공간을 채우고 가로로 늘어선다.
    expect(wrapper.style.flex).toBe('1 1 0%');
    expect(wrapper.style.display).toBe('flex');
    expect(wrapper.style.flexDirection).toBe('row');
    // 시각 요소가 없다: 테두리·배경·여백을 갖지 않는다.
    for (const painted of ['border', 'borderLeft', 'borderRight', 'background', 'backgroundColor', 'padding', 'margin']) {
      expect(wrapper.style[painted as 'border'], `통과용 노드가 ${painted}를 갖는다`).toBe('');
    }
    // 자식은 패널 하나뿐 — 리사이저도 탭도 없다.
    expect(wrapper.children).toHaveLength(1);
    app.unmount();
  });

  it('좌 사이드바 → 중앙 → 우 사이드바 형제 순서와 flex 스타일이 보존된다', () => {
    const app = mountApp();
    const row = app.host.firstElementChild!.firstElementChild!;
    const kids = [...row.children] as HTMLElement[];

    // 좌 사이드바 → 리사이저 → 중앙 열. 우 사이드바는 비가시라 렌더되지 않는다
    // (오늘과 같다 — 픽스처가 그것을 고정한다).
    expect(kids[0]?.className).toBe('cm-sidebar');
    expect(kids[1]?.className).toBe('cm-sidebar-resizer');

    // 통과용 노드를 지나면 오늘의 중앙 열이다.
    const outer = kids[2]!;
    const center = (
      outer.matches('[data-panel-container]') ? outer.firstElementChild : outer
    ) as HTMLElement;
    expect(center.style.display).toBe('flex');
    expect(center.style.flexDirection).toBe('column');
    expect(center.style.flex).toBe('1 1 0%');
    expect(center.style.minWidth).toBe('0');
    expect(center.style.overflow).toBe('auto');
    app.unmount();
  });

  it('편집 표면·상태바·조정 표면의 개수와 위치가 보존된다', () => {
    const app = mountApp();
    expect(layoutFacts(app.host)).toEqual(FIXTURE.facts);
    app.unmount();
  });

  it('패널 다중화를 시사하는 시각 요소가 하나도 렌더되지 않는다', () => {
    const app = mountApp();
    const facts = layoutFacts(app.host);
    expect(facts.panelResizers, '단일 패널에 리사이저가 렌더되었다').toBe(0);
    expect(facts.panelTabs, '탭이 렌더되었다 — v0.3은 탭 축을 도입하지 않는다').toBe(0);
    expect(facts.panelFrames, '패널 경계선이 렌더되었다').toBe(0);
    app.unmount();
  });

  it('중앙 열이 툴바와 에디터 호스트 둘만 담는다', () => {
    const app = mountApp();
    const row = app.host.firstElementChild!.firstElementChild!;
    const wrapper = [...row.children][2] as HTMLElement;
    const center = wrapper.firstElementChild as HTMLElement;
    expect(center.querySelector('.cm-host')).not.toBeNull();
    expect(center.children).toHaveLength(2); // 툴바 + 에디터 호스트
    app.unmount();
  });
});

describe('AC-PANEL-003 `[N]` 프로젝트 없음 상태는 단일 패널로 축퇴한다', () => {
  it('패널이 정확히 1개이고 프로젝트 관련 안내가 표시되지 않는다', () => {
    const app = mountApp();
    expect(useWorkspaceStore.getState().panels).toHaveLength(1);
    expect(app.host.querySelectorAll('.cm-host')).toHaveLength(1);
    // 프로젝트 없음은 1급 상태다 — 오류도 경고도 없다.
    expect(app.host.querySelector('[role="alert"]')).toBeNull();
    expect(app.host.querySelector('[data-project-notice]')).toBeNull();
    app.unmount();
  });
});
