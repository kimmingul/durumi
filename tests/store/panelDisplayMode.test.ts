import { describe, it, expect, beforeEach } from 'vitest';
import {
  availableModesOf,
  displayModeOf,
  isMarkdownPanel,
  useWorkspaceStore,
} from '../../src/store/workspaceStore';
import { useAppStore } from '../../src/store/appStore';

/**
 * 표시 모드는 **패널 축**이 소유한다 (SPEC-V03-WORKSPACE-002 M4, OQ-3 확정 = 후보 1).
 *
 * ## 왜 스토어 수준 검사가 따로 필요한가
 *
 * M1이 `PanelState.displayMode`를 만들어 두었으나 **읽는 곳이 0곳**이었다 —
 * 필드는 있는데 값이 어디에도 흐르지 않는 상태였고, 살아 있는 모드는 창 전역의
 * `appStore.editMode` 하나였다. 그래서 "패널별 독립"은 타입으로만 참이고 동작으로는
 * 거짓이었다. 이 파일은 그 배선이 실제로 이루어졌는지를 스토어 수준에서 고정한다.
 *
 * ## 기각한 후보를 이름으로 남긴다
 *
 * - **후보 2 (마지막 변경을 prefs에 반영 — 오늘 동작)**: 마지막으로 모드를 바꾼
 *   패널이 전역 기본값을 결정해 다음 세션의 **모든** 패널을 규정한다. REQ-PANEL-023이
 *   금지하는 형태다.
 * - **후보 3 (전역 단일 모드)**: REQ-PANEL-021의 "패널별 독립"과 정면으로 어긋난다.
 *
 * 확정은 후보 1 — 활성 패널 종속 컨트롤 + `defaultMode`는 **새 원고 패널의
 * 초기값으로만**.
 */

const store = () => useWorkspaceStore.getState();

beforeEach(() => {
  store().reset();
  useAppStore.setState({ defaultMode: 'wysiwyg' });
});

describe('AC-PANEL-020 — 원고 패널은 3-모드를 그대로 제공한다', () => {
  it('마크다운 문서에 바인딩된 패널의 사용 가능한 모드는 정확히 셋이다', () => {
    const panelId = store().activePanelId!;
    expect(availableModesOf(store(), panelId)).toEqual(['wysiwyg', 'typora', 'markdown']);
  });

  it('모드 집합은 이 SPEC 이전과 같은 이름·같은 순서다', () => {
    const panelId = store().activePanelId!;
    // 이름이나 개수가 바뀌면 REQ-PANEL-020의 "변경하지 않는다"가 깨진다.
    expect(availableModesOf(store(), panelId)).toHaveLength(3);
  });
});

describe('AC-PANEL-021 — 모드는 패널별로 독립이다', () => {
  it('한 패널의 모드를 바꿔도 다른 패널의 모드는 그대로다', () => {
    const a = store().activePanelId!;
    const b = store().openInNewPanel('/w/b.md', 'B\n').panelId;

    store().setPanelDisplayMode(a, 'markdown');

    expect(displayModeOf(store(), a)).toBe('markdown');
    expect(displayModeOf(store(), b), '한 패널의 변경이 다른 패널로 샜다').toBe('wysiwyg');
  });

  it('두 패널이 서로 다른 모드를 동시에 유지한다', () => {
    const a = store().activePanelId!;
    const b = store().openInNewPanel('/w/b.md', 'B\n').panelId;

    store().setPanelDisplayMode(a, 'typora');
    store().setPanelDisplayMode(b, 'markdown');

    expect(displayModeOf(store(), a)).toBe('typora');
    expect(displayModeOf(store(), b)).toBe('markdown');
  });
});

describe('AC-PANEL-022 — 보조 패널에는 3-모드가 적용되지 않는다', () => {
  it('보조 패널의 사용 가능한 모드 집합은 비어 있다', () => {
    const aux = store().openInNewPanel('/w/a.py', 'print(1)\n', 'auxiliary').panelId;
    expect(availableModesOf(store(), aux)).toEqual([]);
    expect(isMarkdownPanel(store(), aux)).toBe(false);
  });

  it('보조 패널의 실효 모드는 `markdown`이다 — 라이브 데코레이션 집합이 비어야 하므로', () => {
    const aux = store().openInNewPanel('/w/a.py', 'print(1)\n', 'auxiliary').panelId;
    expect(displayModeOf(store(), aux)).toBe('markdown');
  });

  it('보조 패널에는 모드를 설정해도 실효 모드가 바뀌지 않는다', () => {
    const aux = store().openInNewPanel('/w/a.py', 'print(1)\n', 'auxiliary').panelId;
    store().setPanelDisplayMode(aux, 'wysiwyg');
    expect(displayModeOf(store(), aux), '보조 패널에 3-모드가 적용됐다').toBe('markdown');
  });
});

describe('AC-PANEL-023 — `defaultMode`는 새 원고 패널의 초기값으로만 쓰인다', () => {
  it('새 원고 패널은 기본값으로 열린다', () => {
    useAppStore.getState().setDefaultMode('typora');
    const b = store().openInNewPanel('/w/b.md', 'B\n', 'markdown', 'typora').panelId;
    expect(displayModeOf(store(), b)).toBe('typora');
  });

  it('패널의 모드 변경은 기본값을 덮어쓰지 않는다', () => {
    const a = store().activePanelId!;
    store().setPanelDisplayMode(a, 'markdown');
    expect(useAppStore.getState().defaultMode, '패널 변경이 전역 기본값을 덮어썼다').toBe('wysiwyg');
  });

  it('패널 A를 바꾼 뒤 연 패널 B는 여전히 기본값으로 열린다', () => {
    const a = store().activePanelId!;
    store().setPanelDisplayMode(a, 'markdown');

    const defaultMode = useAppStore.getState().defaultMode;
    const b = store().openInNewPanel('/w/b.md', 'B\n', 'markdown', defaultMode).panelId;

    expect(displayModeOf(store(), b), 'A의 변경이 B의 초기값을 규정했다').toBe('wysiwyg');
    expect(displayModeOf(store(), a)).toBe('markdown');
  });
});

describe('모드 토글은 패널 단위다', () => {
  it('markdown이 아닌 모드로 바꾸면 그것이 그 패널의 마지막 비-markdown 모드가 된다', () => {
    const a = store().activePanelId!;
    store().setPanelDisplayMode(a, 'typora');
    store().setPanelDisplayMode(a, 'markdown');
    store().togglePanelSourceMode(a);
    expect(displayModeOf(store(), a), '되돌아갈 모드를 잃었다').toBe('typora');
  });

  it('토글은 markdown과 직전 모드를 오간다', () => {
    const a = store().activePanelId!;
    store().setPanelDisplayMode(a, 'typora');

    store().togglePanelSourceMode(a);
    expect(displayModeOf(store(), a)).toBe('markdown');

    store().togglePanelSourceMode(a);
    expect(displayModeOf(store(), a)).toBe('typora');
  });

  it('한 패널의 토글이 다른 패널의 되돌아갈 모드를 규정하지 않는다', () => {
    const a = store().activePanelId!;
    const b = store().openInNewPanel('/w/b.md', 'B\n').panelId;

    store().setPanelDisplayMode(a, 'typora');
    store().togglePanelSourceMode(a);
    store().togglePanelSourceMode(b);
    store().togglePanelSourceMode(b);

    // B는 한 번도 typora였던 적이 없다. A의 기억이 B로 새면 여기서 typora가 나온다.
    expect(displayModeOf(store(), b), 'A의 토글 기억이 B로 샜다').toBe('wysiwyg');
  });

  it('보조 패널의 토글은 아무 일도 하지 않는다', () => {
    const aux = store().openInNewPanel('/w/a.py', 'print(1)\n', 'auxiliary').panelId;
    store().togglePanelSourceMode(aux);
    expect(displayModeOf(store(), aux)).toBe('markdown');
  });
});

describe('없는 패널에 대한 조회', () => {
  it('실효 모드는 기본값으로 떨어지고 던지지 않는다', () => {
    expect(displayModeOf(store(), 'panel-does-not-exist')).toBe('wysiwyg');
    expect(availableModesOf(store(), 'panel-does-not-exist')).toEqual([]);
  });
});
