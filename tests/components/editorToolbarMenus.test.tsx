import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { EditorToolbar } from '../../src/components/EditorToolbar';

/**
 * v0.2.31 — 문서모드 툴바 폭 축소.
 *
 * "삽입"(10개)과 "검토"(5개) 그룹을 각각 드롭다운 메뉴 하나로 접었다.
 * 이 테스트가 지키는 계약:
 *
 *   - 모든 명령은 여전히 도달 가능하다(사라진 액션 0개).
 *   - 상시 노출 버튼 수가 27 → 14 로 줄었다(스타일 select 포함 15 컨트롤).
 *   - 메뉴 항목의 data-testid 는 접기 전과 동일하다 → 기존 e2e/키맵 경로가
 *     그대로 유지된다.
 *   - 접근성: aria-haspopup/aria-expanded, role="menu"/"menuitem",
 *     Esc 로 닫고 트리거로 포커스 복귀, 바깥 클릭으로 닫기.
 */

/** 고정 지연 금지 — sidebar 테스트와 동일한 폴링 헬퍼. */
async function waitFor(
  predicate: () => boolean,
  description: string,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`waitFor timed out after ${timeout}ms waiting for: ${description}`);
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, interval));
    });
  }
}

interface Mounted {
  container: HTMLDivElement;
  view: EditorView;
  root: Root;
  citePaletteCalls: number[];
}

let mounted: Mounted | null = null;

function mount(doc = '', selection?: { from: number; to: number }): Mounted {
  const editorHost = document.createElement('div');
  document.body.appendChild(editorHost);
  const view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor: 0 } }),
    parent: editorHost,
  });
  if (selection) {
    view.dispatch({ selection: EditorSelection.range(selection.from, selection.to) });
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const state: Mounted = { container, view, root, citePaletteCalls: [] };
  act(() => {
    root.render(
      <EditorToolbar
        view={view}
        visible
        onOpenCitePalette={() => { state.citePaletteCalls.push(1); }}
        onPickImage={() => {}}
      />,
    );
  });
  mounted = state;
  return state;
}

afterEach(() => {
  if (mounted) {
    const m = mounted;
    mounted = null;
    act(() => { m.root.unmount(); });
    m.container.remove();
    m.view.destroy();
  }
  document.body.innerHTML = '';
});

beforeEach(() => {
  document.body.innerHTML = '';
});

function byTestId(container: HTMLElement, id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

function click(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function pressKey(key: string, target: EventTarget = document): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

/** 접기 전 "삽입" 그룹에 있던 10개 액션(DOM 순서). */
const INSERT_IDS = [
  'toolbar-link',
  'toolbar-image',
  'toolbar-table',
  'toolbar-math-inline',
  'toolbar-math',
  'toolbar-footnote',
  'toolbar-citation',
  'toolbar-hr',
  'toolbar-mermaid',
  'toolbar-toc',
];

/** 접기 전 "검토" 그룹에 있던 5개 액션(DOM 순서). */
const REVIEW_IDS = [
  'toolbar-cm-insert',
  'toolbar-cm-delete',
  'toolbar-cm-substitute',
  'toolbar-cm-highlight',
  'toolbar-cm-comment',
];

/** 접힌 뒤에도 항상 보여야 하는 버튼들(고빈도 컨트롤 + 트리거 2개). */
const ALWAYS_VISIBLE_IDS = [
  'toolbar-bold', 'toolbar-italic', 'toolbar-strike', 'toolbar-code',
  'toolbar-sup', 'toolbar-sub',
  'toolbar-bullet', 'toolbar-numbered', 'toolbar-task',
  'toolbar-outdent', 'toolbar-indent',
  'toolbar-insert-menu', 'toolbar-review-menu',
  'toolbar-memo',
];

describe('EditorToolbar — 삽입/검토 드롭다운', () => {
  it('두 드롭다운 트리거가 문서모드에서 렌더된다', () => {
    const { container } = mount();
    const insert = byTestId(container, 'toolbar-insert-menu');
    const review = byTestId(container, 'toolbar-review-menu');
    expect(insert).not.toBeNull();
    expect(review).not.toBeNull();
    expect(insert!.tagName).toBe('BUTTON');
    expect(review!.tagName).toBe('BUTTON');
    expect(insert!.getAttribute('aria-haspopup')).toBe('menu');
    expect(review!.getAttribute('aria-haspopup')).toBe('menu');
    expect(insert!.getAttribute('aria-expanded')).toBe('false');
    expect(review!.getAttribute('aria-expanded')).toBe('false');
  });

  it('상시 노출 버튼은 14개로 줄었다 (접기 전 27개)', () => {
    const { container } = mount();
    const buttons = container.querySelectorAll('button.editor-toolbar-btn');
    expect(buttons.length).toBe(14);
    // 스타일 select 는 버튼이 아니므로 별도로 남아 있어야 한다.
    expect(byTestId(container, 'editor-toolbar-style')).not.toBeNull();
    for (const id of ALWAYS_VISIBLE_IDS) {
      expect(byTestId(container, id), `${id} 가 상시 노출이어야 한다`).not.toBeNull();
    }
    // 접힌 액션들은 메뉴를 열기 전에는 DOM 에 없다.
    for (const id of [...INSERT_IDS, ...REVIEW_IDS]) {
      expect(byTestId(container, id), `${id} 는 닫힌 상태에서 숨겨져야 한다`).toBeNull();
    }
  });

  it('삽입 메뉴를 열면 10개 액션이 모두 드러난다', () => {
    const { container } = mount();
    click(byTestId(container, 'toolbar-insert-menu')!);
    const menu = byTestId(container, 'toolbar-insert-menu-list');
    expect(menu).not.toBeNull();
    expect(menu!.getAttribute('role')).toBe('menu');
    const items = menu!.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(10);
    for (const id of INSERT_IDS) {
      expect(byTestId(container, id), `${id} 가 삽입 메뉴에 있어야 한다`).not.toBeNull();
    }
    expect(byTestId(container, 'toolbar-insert-menu')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('검토 메뉴를 열면 5개 액션이 모두 드러난다', () => {
    const { container } = mount();
    click(byTestId(container, 'toolbar-review-menu')!);
    const menu = byTestId(container, 'toolbar-review-menu-list');
    expect(menu).not.toBeNull();
    expect(menu!.getAttribute('role')).toBe('menu');
    const items = menu!.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(5);
    for (const id of REVIEW_IDS) {
      expect(byTestId(container, id), `${id} 가 검토 메뉴에 있어야 한다`).not.toBeNull();
    }
    expect(byTestId(container, 'toolbar-review-menu')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('메뉴에서 고른 액션이 접기 전과 동일한 명령을 실행한다 (CriticMarkup 삽입)', () => {
    const { container, view } = mount('hi', { from: 0, to: 2 });
    click(byTestId(container, 'toolbar-review-menu')!);
    click(byTestId(container, 'toolbar-cm-insert')!);
    expect(view.state.doc.toString()).toBe('{++ hi ++}');
  });

  it('메뉴에서 고른 액션이 접기 전과 동일한 명령을 실행한다 (TOC 삽입)', () => {
    const { container, view } = mount();
    click(byTestId(container, 'toolbar-insert-menu')!);
    click(byTestId(container, 'toolbar-toc')!);
    expect(view.state.doc.toString()).toContain('[toc]');
  });

  it('메뉴에서 고른 액션이 prop 콜백도 그대로 호출한다 (참고문헌 팔레트)', () => {
    const m = mount();
    click(byTestId(m.container, 'toolbar-insert-menu')!);
    click(byTestId(m.container, 'toolbar-citation')!);
    expect(m.citePaletteCalls.length).toBe(1);
  });

  it('액션을 실행하면 메뉴가 닫힌다', () => {
    const { container } = mount();
    click(byTestId(container, 'toolbar-insert-menu')!);
    expect(byTestId(container, 'toolbar-insert-menu-list')).not.toBeNull();
    click(byTestId(container, 'toolbar-hr')!);
    expect(byTestId(container, 'toolbar-insert-menu-list')).toBeNull();
  });

  it('Esc 로 닫히고 포커스가 트리거로 돌아온다', () => {
    const { container } = mount();
    const trigger = byTestId(container, 'toolbar-insert-menu')!;
    click(trigger);
    expect(byTestId(container, 'toolbar-insert-menu-list')).not.toBeNull();
    pressKey('Escape');
    expect(byTestId(container, 'toolbar-insert-menu-list')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('바깥 클릭으로 닫힌다', async () => {
    const { container } = mount();
    click(byTestId(container, 'toolbar-review-menu')!);
    expect(byTestId(container, 'toolbar-review-menu-list')).not.toBeNull();
    // 메뉴를 연 클릭이 곧바로 자신을 닫지 않도록 리스너 등록이 한 틱 지연된다.
    await waitFor(
      () => {
        act(() => {
          document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        });
        return byTestId(container, 'toolbar-review-menu-list') === null;
      },
      '바깥 mousedown 이 검토 메뉴를 닫는 것',
    );
    expect(byTestId(container, 'toolbar-review-menu')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('한 번에 하나의 메뉴만 열린다', () => {
    const { container } = mount();
    click(byTestId(container, 'toolbar-insert-menu')!);
    expect(byTestId(container, 'toolbar-insert-menu-list')).not.toBeNull();
    click(byTestId(container, 'toolbar-review-menu')!);
    expect(byTestId(container, 'toolbar-review-menu-list')).not.toBeNull();
    expect(byTestId(container, 'toolbar-insert-menu-list')).toBeNull();
  });

  it('트리거를 다시 누르면 토글로 닫힌다', () => {
    const { container } = mount();
    const trigger = byTestId(container, 'toolbar-insert-menu')!;
    click(trigger);
    expect(byTestId(container, 'toolbar-insert-menu-list')).not.toBeNull();
    click(trigger);
    expect(byTestId(container, 'toolbar-insert-menu-list')).toBeNull();
  });

  it('링크가 메뉴로 옮겨가도 Cmd+K 경로(durumi:open-link-dialog)는 그대로 동작한다', async () => {
    const { container } = mount('Durumi', { from: 0, to: 6 });
    act(() => {
      window.dispatchEvent(new CustomEvent('durumi:open-link-dialog'));
    });
    // 다이얼로그는 lazy 로드라 마운트까지 폴링한다.
    await waitFor(
      () => byTestId(document.body, 'insert-link-dialog') !== null,
      '링크 다이얼로그가 마운트되는 것',
    );
    expect(byTestId(container, 'toolbar-insert-menu-list')).toBeNull();
  });

  it('view 가 없으면 두 트리거 모두 비활성화된다', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<EditorToolbar view={null} visible />);
    });
    const insert = byTestId(container, 'toolbar-insert-menu') as HTMLButtonElement;
    const review = byTestId(container, 'toolbar-review-menu') as HTMLButtonElement;
    expect(insert.disabled).toBe(true);
    expect(review.disabled).toBe(true);
    act(() => { root.unmount(); });
    container.remove();
  });
});
