import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { EditorView } from '@codemirror/view';
import { installFakeApi, mountApp, type MountedApp } from '../_helpers/appHarness';
import { useWorkspaceStore, activeDocument, isDirty } from '../../src/store/workspaceStore';

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
