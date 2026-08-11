import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { EditorView } from '@codemirror/view';
import { installFakeApi, mountApp, type MountedApp } from '../_helpers/appHarness';
import {
  useWorkspaceStore,
  activeDocument,
  displayModeOf,
  isDirty,
} from '../../src/store/workspaceStore';
import { getPanelView, panelIdOfView } from '../../src/store/panelViews';
import { dispatchPanelEvent, panelIdOfEvent } from '../../src/editor/panelEvents';

/**
 * 패널의 편집이 **그 패널의 현재 문서**에 도달하는가 (REQ-PANEL-010, REQ-WS-028).
 *
 * ## 이 파일이 존재하는 이유
 *
 * 이 불변식이 깨진 채로 유닛 2316건이 전부 green이었고, 회귀는 실사용에서만
 * 드러났다 — IME 조합으로 친 글자가 디스크 내용으로 조용히 교체됐다. 깨진
 * 경로가 **조용했기** 때문이다: `editDocument`는 없는 문서 식별자를 이른 반환으로
 * 무시하므로(`withDocument`) 오류도 경고도 나지 않는다.
 *
 * ## 무엇이 깨졌었나
 *
 * 편집 표면은 문서를 갈아타며 재사용된다 — `MarkdownEditor`는 `key`를 받지 않고,
 * 그 안의 CodeMirror `updateListener`는 **마운트 시점의 `onChange`를 영구히**
 * 붙든다(마운트 이펙트의 deps가 `[]`). 그래서 `onChange`가 렌더 스코프의 문서를
 * 닫아 버리면, 패널이 다른 문서로 재바인딩된 뒤에도 처음 마운트 때의 문서
 * 식별자로 편집을 보낸다. 그 문서는 `bind`가 이미 거둬 갔다.
 *
 * 결과는 "문서가 영원히 clean"이고, 그러면 조정 정책이 미저장 편집을 보지 못해
 * 외부 변경을 자동 반영한다(`shared/reconciliation.ts`의 `apply` 분기는
 * `!isDirty`를 요구한다). 사용자의 편집이 확인 없이 사라진다.
 *
 * ## 그래서 무엇을 고정하는가
 *
 * 아래 검사들은 편집이 스토어에 도달하는지와 **`isDirty`가 뒤집히는지**를 함께
 * 단언한다. 조정 정책이 읽는 값이 바로 그것이므로, 내용만 보면 이 회귀를 다시
 * 놓친다.
 */

const store = () => useWorkspaceStore.getState();

/** 단일 패널의 편집 표면. */
function soleView(app: MountedApp): EditorView {
  const el = app.host.querySelector('.cm-content');
  if (!el) throw new Error('.cm-content가 없다');
  const view = EditorView.findFromDOM(el as HTMLElement);
  if (!view) throw new Error('EditorView를 찾지 못했다');
  return view;
}

/** 사용자의 타건이 CodeMirror를 거쳐 나오는 경로와 같은 모양의 편집. */
function typeInto(view: EditorView, text: string): void {
  act(() => {
    view.dispatch({ changes: { from: 0, insert: text } });
  });
}

let app: MountedApp | null = null;

beforeEach(() => {
  store().reset();
  installFakeApi();
});

afterEach(() => {
  app?.unmount();
  app = null;
  store().reset();
});

describe('패널 편집은 그 패널의 현재 문서로 간다', () => {
  it('마운트 시점의 untitled 문서를 편집하면 스토어에 반영되고 dirty가 된다', () => {
    app = mountApp();

    typeInto(soleView(app), 'X');

    const doc = activeDocument(store())!;
    expect(doc.content, '편집이 문서에 도달하지 않았다').toBe('X');
    expect(isDirty(doc), '편집했는데 clean으로 남았다').toBe(true);
  });

  it('문서를 연 뒤 편집하면 **새로 바인딩된** 문서가 dirty가 된다', () => {
    app = mountApp();
    const mountDocId = activeDocument(store())!.id;

    act(() => {
      store().openInActivePanel('/w/a.md', '원래 내용\n');
    });
    const openedDocId = activeDocument(store())!.id;
    // 전제: 열기는 문서를 새로 만들고 옛 문서를 거둔다. 이 전제가 깨지면
    // 아래 단언은 회귀를 잡지 못한다 — 스테일 클로저가 여전히 유효한
    // 식별자를 가리키기 때문이다.
    expect(openedDocId, '열기가 새 문서를 만들지 않았다').not.toBe(mountDocId);
    expect(store().documents.has(mountDocId), '옛 문서가 거둬지지 않았다').toBe(false);

    typeInto(soleView(app), '한');

    const doc = activeDocument(store())!;
    expect(doc.content, '편집이 사라진 옛 문서로 갔다').toBe('한원래 내용\n');
    expect(isDirty(doc), 'clean으로 남으면 조정이 외부 변경을 자동 반영한다').toBe(true);
  });

  it('같은 패널에서 문서를 갈아탄 뒤에도 편집은 최신 문서로 간다', () => {
    app = mountApp();

    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    const firstId = activeDocument(store())!.id;

    act(() => {
      store().openInActivePanel('/w/b.md', 'B\n');
    });
    const secondId = activeDocument(store())!.id;
    expect(secondId, '두 번째 열기가 문서를 갈아타지 않았다').not.toBe(firstId);

    typeInto(soleView(app), 'Z');

    const doc = activeDocument(store())!;
    expect(doc.path, '활성 문서가 바뀌지 않았다').toBe('/w/b.md');
    expect(doc.content, '편집이 이전 문서로 갔다').toBe('ZB\n');
    expect(isDirty(doc), '재바인딩 뒤 편집이 dirty를 만들지 못했다').toBe(true);
  });
});

/**
 * ## 같은 위험이 `onChange` 하나에만 있는 것이 아니다
 *
 * 위 검사가 고정하는 것은 `onChange` 하나다. 그러나 위험의 원인은 콜백의
 * 이름이 아니라 **편집 표면이 문서를 갈아타며 재사용된다**는 성질이다 —
 * `MarkdownEditor`는 `key`를 받지 않고 그 마운트 이펙트의 deps는 `[]`다(뷰를
 * 다시 만들면 캐럿·스크롤·실행 취소를 잃으므로 의도된 설계다).
 *
 * M4는 그 표면에 콜백과 구독을 더 붙였다(활성 뷰 레지스트리 등록, 편집 포커스에
 * 의한 활성 패널 판정, 패널별 모드). 그래서 같은 성질을 **계열 전체**에 대해
 * 고정한다: 문서를 갈아탄 뒤에도 각 배선이 마운트 시점이 아니라 **지금**의
 * 패널·문서를 가리키는가.
 */
describe('문서를 갈아탄 뒤에도 패널 배선 전체가 최신을 가리킨다', () => {
  it('뷰 레지스트리가 같은 패널을 계속 가리킨다', () => {
    app = mountApp();
    const panelId = store().activePanelId!;
    const viewBefore = getPanelView(panelId);
    expect(viewBefore, '편집 표면이 등록되지 않았다').not.toBeNull();

    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });

    // 표면은 재사용되므로 같은 인스턴스여야 하고, 귀속도 그대로여야 한다.
    expect(getPanelView(panelId), '재바인딩이 레지스트리를 끊었다').toBe(viewBefore);
    expect(panelIdOfView(viewBefore!), '뷰가 다른 패널로 귀속됐다').toBe(panelId);
  });

  it('편집 포커스에 의한 활성 패널 판정이 계속 그 패널을 가리킨다', () => {
    app = mountApp();
    const panelA = store().activePanelId!;
    act(() => {
      store().openInNewPanel('/w/b.md', 'B\n');
    });
    const panelB = store().activePanelId!;

    // 패널 A가 다른 문서로 갈아탄다.
    act(() => {
      store().setActivePanel(panelA);
      store().openInActivePanel('/w/a2.md', 'A2\n');
      store().setActivePanel(panelB);
    });

    const surfaces = [...app.host.querySelectorAll('.cm-content')] as HTMLElement[];
    act(() => {
      surfaces[0]!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
    expect(store().activePanelId, '갈아탄 패널의 포커스가 옛 패널을 활성으로 만들었다').toBe(panelA);
  });

  it('창 전역 이벤트의 발신 패널이 계속 그 패널이다', () => {
    app = mountApp();
    const panelId = store().activePanelId!;
    act(() => {
      store().openInActivePanel('/w/a.md', 'A\n');
    });

    let seen: string | null | undefined;
    const onEvent = (e: Event) => { seen = panelIdOfEvent(e); };
    window.addEventListener('durumi:memo-panel-toggle', onEvent);
    try {
      dispatchPanelEvent(getPanelView(panelId)!, 'durumi:memo-panel-toggle');
    } finally {
      window.removeEventListener('durumi:memo-panel-toggle', onEvent);
    }
    expect(seen, '재바인딩 뒤 발신 패널이 어긋났다').toBe(panelId);
  });

  it('표시 모드가 계속 그 패널의 것이다', () => {
    app = mountApp();
    const panelId = store().activePanelId!;
    act(() => {
      store().setPanelDisplayMode(panelId, 'typora');
      store().openInActivePanel('/w/a.md', 'A\n');
    });
    // 문서를 갈아타도 패널의 모드는 패널에 남는다 — 모드는 문서 축이 아니다.
    expect(displayModeOf(store(), panelId)).toBe('typora');
  });
});
