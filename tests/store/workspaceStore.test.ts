import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  activeDocument,
  documentOf,
  isDirty,
  isLastReferencingPanel,
  needsDiscardConfirm,
  panelById,
  panelsReferencing,
  requestClosePanel,
  revisionOf,
  saveDocument,
  useWorkspaceStore,
  type DocumentState,
  type PanelState,
} from '../../src/store/workspaceStore';
import { useReconciliationStore } from '../../src/store/reconciliationStore';

/**
 * SPEC-V03-WORKSPACE-002 M1 — 문서 축과 패널 축의 분리.
 *
 * 두 축을 합치면 v0.4의 dual-open이 재작성이 된다. v0.3은 1:1로만 쓰되 구조는
 * 1:N을 표현할 수 있게 남는다. 미저장 여부는 가변 boolean이 아니라 파생값이며,
 * 그것이 issue #12(sticky)와 저장의 await 창 결함을 **구조적으로** 닫는다.
 *
 * 대상 AC: AC-PANEL-010 / 010b / 011a / 011b / 012 / 013 / 013b / 014.
 *
 * **AC-PANEL-001·011은 M2 소속이다** — 둘 다 렌더된 편집 표면(캐럿·선택·스크롤·
 * `EditorView` 인스턴스 수)을 요구하므로 이 파일의 범위가 아니다.
 */

const store = () => useWorkspaceStore.getState();

/** 활성 패널에 파일 하나를 연 상태를 만든다. */
function openActive(path: string, content: string) {
  const { panelId } = store().openInActivePanel(path, content);
  return { panelId, documentId: panelById(store(), panelId)!.documentId };
}

beforeEach(() => {
  store().reset();
  useReconciliationStore.getState().reset();
});
afterEach(() => {
  store().reset();
  useReconciliationStore.getState().reset();
});

// ---------------------------------------------------------------------------

describe('AC-PANEL-010 — 문서 상태와 패널 상태의 소유 축이 분리된다', () => {
  it('경로·내용·미저장 여부·파일 종류는 문서에만, 표시 모드는 패널에만 있다', () => {
    const { panelId, documentId } = openActive('/w/a.md', 'A\n');
    const doc = store().documents.get(documentId)!;
    const panel = panelById(store(), panelId)!;

    const documentFields = Object.keys(doc).sort();
    const panelFields = Object.keys(panel).sort();

    expect(documentFields).toEqual(
      ['content', 'currentRevision', 'id', 'kind', 'path', 'savedRevision'].sort(),
    );
    // M4에서 `lastNonMarkdownMode`가 붙었다 — `Cmd+/`가 되돌아갈 모드의 기억은
    // 표시 모드 축의 일부이므로 패널이 갖는다(REQ-PANEL-021). 창 전역에 두면
    // 패널 A의 토글이 패널 B의 목적지를 규정한다.
    expect(panelFields).toEqual(
      ['displayMode', 'documentId', 'lastNonMarkdownMode', 'panelId'].sort(),
    );

    // 문서가 패널 소유 개념을 갖지 않는다.
    for (const owned of ['caret', 'selection', 'scroll', 'history', 'displayMode', 'panelId']) {
      expect(documentFields, `문서가 ${owned}를 갖는다`).not.toContain(owned);
    }
    // 패널이 문서 소유 개념을 갖지 않는다.
    for (const owned of ['path', 'content', 'isDirty', 'currentRevision', 'savedRevision', 'kind']) {
      expect(panelFields, `패널이 ${owned}를 갖는다`).not.toContain(owned);
    }

    // 두 필드 집합의 교집합이 공집합이다. `documentId`는 패널이 문서를
    // **참조**하는 링크이며 문서의 필드명(`id`)과 겹치지 않는다 — 참조는
    // 중복 보관이 아니다(AC-PANEL-011a가 그 참조를 요구한다).
    const intersection = documentFields.filter((f) => panelFields.includes(f));
    expect(intersection).toEqual([]);
  });

  it('조정 상태는 문서 축이며 패널에 없다', () => {
    const { panelId } = openActive('/w/a.md', 'A\n');
    const panel = panelById(store(), panelId)!;
    for (const owned of ['status', 'pending', 'composing', 'errorMessage']) {
      expect(Object.keys(panel)).not.toContain(owned);
    }
    // 조정 상태는 경로로 키잉되어 조정 스토어가 보관한다 (M0).
    expect(useReconciliationStore.getState().statePaths()).toBeInstanceOf(Array);
  });
});

describe('AC-PANEL-010b — dirty는 파생값이며 저장의 await 창을 견딘다', () => {
  it('저장 중 편집하면 저장이 끝나도 미저장 여부가 참으로 남는다', async () => {
    const { documentId } = openActive('/w/a.md', '원래 내용\n');
    store().editDocument(documentId, '저장할 내용\n');
    expect(isDirty(store().documents.get(documentId)!)).toBe(true);

    const written: Array<[string, string]> = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const saving = saveDocument(documentId, async (p, c) => {
      written.push([p, c]);
      await gate; // 저장이 끝나기 전에 사용자가 타이핑한다
    });

    store().editDocument(documentId, '저장 중에 타이핑한 내용\n');
    release();
    expect(await saving).toBe(true);

    expect(written).toEqual([['/w/a.md', '저장할 내용\n']]);
    expect(
      isDirty(store().documents.get(documentId)!),
      'await 창 안의 편집이 clean으로 표시되었다',
    ).toBe(true);
  });

  it('가변 boolean dirty 필드가 상태 계층에 존재하지 않는다', () => {
    const { documentId, panelId } = openActive('/w/a.md', 'A\n');
    const doc = store().documents.get(documentId)!;
    const panel = panelById(store(), panelId)!;

    for (const key of ['isDirty', 'dirty', 'modified', 'unsaved']) {
      expect(Object.keys(doc), `문서에 ${key}가 있다`).not.toContain(key);
      expect(Object.keys(panel), `패널에 ${key}가 있다`).not.toContain(key);
    }
    // 미저장 여부는 부등식으로만 얻는다.
    expect(isDirty(doc)).toBe(doc.currentRevision !== doc.savedRevision);

    // 명령형 "지금을 clean으로 선언" 연산이 없다 — 그것이 결함의 형태였다.
    expect(Object.keys(store())).not.toContain('markClean');
  });

  it('편집 후 원래 값으로 되돌리면 미저장 여부가 거짓으로 돌아온다 (sticky 아님)', () => {
    const { documentId } = openActive('/w/a.md', '원래 내용\n');
    expect(isDirty(store().documents.get(documentId)!)).toBe(false);

    store().editDocument(documentId, '바뀐 내용\n');
    expect(isDirty(store().documents.get(documentId)!)).toBe(true);

    store().editDocument(documentId, '원래 내용\n');
    expect(
      isDirty(store().documents.get(documentId)!),
      'issue #12의 sticky 형태가 재도입되었다',
    ).toBe(false);
  });
});

describe('AC-PANEL-011a — 축은 붕괴되지 않는다, 구조는 1:N을 표현할 수 있다', () => {
  it('패널이 문서를 참조하는 형태이며 1:1이 타입·구조로 강제되지 않는다', () => {
    const { panelId, documentId } = openActive('/w/a.md', 'A\n');

    // 패널은 문서를 참조한다 — 내용을 소유하지 않는다.
    const panel = panelById(store(), panelId)!;
    expect(panel.documentId).toBe(documentId);
    expect(store().documents.get(panel.documentId)!.content).toBe('A\n');

    // 같은 문서를 두 패널이 참조하는 것을 구조가 막지 않는다. v0.3은 그러지
    // 않을 뿐이며, 막혀 있다면 v0.4의 dual-open이 재작성이 된다.
    const second: PanelState = { panelId: 'panel-probe', documentId, displayMode: 'wysiwyg', lastNonMarkdownMode: 'wysiwyg' };
    useWorkspaceStore.setState({ panels: [...store().panels, second] });
    expect(panelsReferencing(store(), documentId).map((p) => p.panelId)).toEqual([
      panelId,
      'panel-probe',
    ]);
  });

  it('저장은 문서 단위, 폐기 확인은 마지막 참조 패널 판정으로 표현된다', () => {
    const { panelId, documentId } = openActive('/w/a.md', 'A\n');
    store().editDocument(documentId, 'A 편집\n');

    // 참조 패널이 하나면 마지막이다 → 확인이 필요하다.
    expect(isLastReferencingPanel(store(), panelId)).toBe(true);
    expect(needsDiscardConfirm(store(), panelId)).toBe(true);

    // v0.3에서 도달 불가한 분기: 참조 패널이 둘이면 확인을 요구하지 않는다.
    // 도달 불가한 채로 **표현되어 있다**는 것이 이 단언의 요점이다.
    useWorkspaceStore.setState({
      panels: [...store().panels, { panelId: 'panel-probe', documentId, displayMode: 'wysiwyg', lastNonMarkdownMode: 'wysiwyg' }],
    });
    expect(isLastReferencingPanel(store(), panelId)).toBe(false);
    expect(needsDiscardConfirm(store(), panelId)).toBe(false);
  });
});

describe('AC-PANEL-011b — 중복 판정의 보장 범위와 한계가 정직하게 고정된다', () => {
  it('별칭 경로는 같은 파일로 탐지되지 않아 두 패널이 열린다', () => {
    // `a.md`와 그것을 가리키는 심볼릭 링크 `alias.md`.
    const first = store().openInActivePanel('/w/a.md', 'A\n');
    const second = store().openInNewPanel('/w/alias.md', 'A\n');

    expect(second.reused, '별칭을 같은 파일로 탐지했다').toBe(false);
    expect(second.panelId).not.toBe(first.panelId);
    expect(store().panels).toHaveLength(2);
    expect(store().documents.size).toBe(2);
  });

  it('정규화 후 동일한 절대 경로는 같은 문서로 인식된다 (보장하는 쪽)', () => {
    const first = store().openInActivePanel('/w/a.md', 'A\n');
    const again = store().openInNewPanel('/w/a.md', 'A\n');

    expect(again.reused).toBe(true);
    expect(again.panelId).toBe(first.panelId);
    expect(store().panels).toHaveLength(1);
    expect(store().documents.size).toBe(1);
  });

  it('한계가 소스에 정의된 한계로 기록되어 있다', () => {
    const src = readFileSync(
      join(process.cwd(), 'src', 'store', 'workspaceStore.ts'),
      'utf8',
    );
    expect(src).toContain('REQ-PANEL-011a');
    expect(src).toMatch(/realpath/);
  });
});

describe('AC-PANEL-012 — 저장이 패널 상태에 매이지 않는다', () => {
  it('디스크 쓰기가 정확히 1회 발생하고 대상은 문서 식별자로 결정된다', async () => {
    const { documentId } = openActive('/w/a.md', 'A\n');
    store().editDocument(documentId, 'A 편집\n');

    const write = vi.fn(async () => {});
    expect(await saveDocument(documentId, write)).toBe(true);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('/w/a.md', 'A 편집\n');
    expect(isDirty(store().documents.get(documentId)!)).toBe(false);
  });

  it('저장 API가 패널 식별자를 받지 않는다 (소스 스캔)', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'store', 'workspaceStore.ts'), 'utf8');
    const signature = src.slice(src.indexOf('export async function saveDocument'));
    const head = signature.slice(0, signature.indexOf('{'));
    expect(head).toContain('documentId: DocumentId');
    expect(head, '저장이 패널 식별자를 받는다').not.toContain('panelId');
  });
});

describe('AC-PANEL-013 — 마지막 참조 패널을 닫을 때 폐기 확인을 거친다', () => {
  it('미저장 편집이 있으면 confirmDiscard가 호출된다', async () => {
    openActive('/w/a.md', 'A\n');
    const opened = store().openInNewPanel('/w/b.md', 'B\n');
    const documentId = panelById(store(), opened.panelId)!.documentId;
    store().editDocument(documentId, 'B 편집\n');

    const confirmDiscard = vi.fn(async () => 'discard' as const);
    const save = vi.fn(async () => true);
    expect(await requestClosePanel(opened.panelId, { confirmDiscard, save })).toBe(true);

    expect(confirmDiscard).toHaveBeenCalledTimes(1);
    expect(confirmDiscard).toHaveBeenCalledWith('/w/b.md');
    expect(store().panels.map((p) => p.panelId)).not.toContain(opened.panelId);
  });

  it('취소하면 패널이 닫히지 않고 문서 내용이 보존된다', async () => {
    openActive('/w/a.md', 'A\n');
    const opened = store().openInNewPanel('/w/b.md', 'B\n');
    const documentId = panelById(store(), opened.panelId)!.documentId;
    store().editDocument(documentId, 'B 편집\n');

    const confirmDiscard = vi.fn(async () => 'cancel' as const);
    const save = vi.fn(async () => true);
    expect(await requestClosePanel(opened.panelId, { confirmDiscard, save })).toBe(false);

    expect(store().panels.map((p) => p.panelId)).toContain(opened.panelId);
    expect(store().documents.get(documentId)!.content).toBe('B 편집\n');
    expect(save).not.toHaveBeenCalled();
  });

  it('깨끗한 문서를 닫을 때는 확인을 요구하지 않는다', async () => {
    openActive('/w/a.md', 'A\n');
    const opened = store().openInNewPanel('/w/b.md', 'B\n');

    const confirmDiscard = vi.fn(async () => 'cancel' as const);
    const save = vi.fn(async () => true);
    expect(await requestClosePanel(opened.panelId, { confirmDiscard, save })).toBe(true);
    expect(confirmDiscard).not.toHaveBeenCalled();
  });
});

describe('AC-PANEL-013b — 판정이 "마지막 참조 패널인가"로 표현된다', () => {
  it('폐기 확인 조건이 참조 수로 표현되고 "패널을 닫는가"로 표현되지 않는다', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'store', 'workspaceStore.ts'), 'utf8');

    const bodyOf = (name: string): string => {
      const start = src.indexOf(`export function ${name}`);
      expect(start, `${name}이 없다`).toBeGreaterThan(-1);
      const open = src.indexOf('{', start);
      return src.slice(open, src.indexOf('\n}', open));
    };

    // 확인 필요 판정은 마지막 참조 패널 판정에 위임한다.
    expect(bodyOf('needsDiscardConfirm')).toContain('isLastReferencingPanel');
    // 그 판정은 참조 **수**로 이루어진다.
    expect(bodyOf('isLastReferencingPanel')).toMatch(/panelsReferencing\([^)]*\)\.length/);
  });
});

describe('AC-PANEL-014 — 어떤 패널의 미저장 편집도 확인 없이 사라지지 않는다', () => {
  it('분할·닫기 취소·활성 전환·외부 변경을 임의 순서로 해도 내용이 보존된다', async () => {
    const a = openActive('/w/a.md', 'A 원본\n');
    const b = store().openInNewPanel('/w/b.md', 'B 원본\n');
    const bDoc = panelById(store(), b.panelId)!.documentId;

    store().editDocument(a.documentId, 'A 미저장\n');
    store().editDocument(bDoc, 'B 미저장\n');

    // 두 문서를 조정 계층에 열린 문서로 등록하고 dirty를 전달한다 (M0 배선).
    const reconcile = useReconciliationStore.getState();
    for (const path of ['/w/a.md', '/w/b.md']) {
      reconcile.openDocument(path);
      reconcile.dispatchFor(path, { type: 'dirty-changed', isDirty: true });
    }

    // 임의 순서: 분할 → 활성 전환 → 외부 변경 수신 → 닫기 취소 → 활성 전환
    store().openInNewPanel('/w/c.md', 'C\n');
    store().setActivePanel(a.panelId);
    reconcile.dispatchFor('/w/a.md', {
      type: 'external-change',
      change: { path: '/w/a.md', content: '디스크의 A\n', mtimeMs: 1, size: 9 },
    });
    reconcile.dispatchFor('/w/b.md', {
      type: 'external-change',
      change: { path: '/w/b.md', content: '디스크의 B\n', mtimeMs: 1, size: 9 },
    });
    const confirmDiscard = vi.fn(async () => 'cancel' as const);
    await requestClosePanel(b.panelId, { confirmDiscard, save: async () => true });
    store().setActivePanel(b.panelId);

    // 어느 문서의 내용도 사용자 확인 없이 바뀌지 않았다.
    expect(store().documents.get(a.documentId)!.content).toBe('A 미저장\n');
    expect(store().documents.get(bDoc)!.content).toBe('B 미저장\n');
    // 외부 변경은 배너로 보류되었을 뿐 적용되지 않았다.
    expect(useReconciliationStore.getState().stateFor('/w/a.md')?.status).toBe('held-notify');
    expect(useReconciliationStore.getState().stateFor('/w/b.md')?.status).toBe('held-notify');
    expect(confirmDiscard).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 축 분리를 떠받치는 보조 검사 (AC 소속이 아니다)
// ---------------------------------------------------------------------------

describe('보조 — 문서 축의 기본 동작', () => {
  it('열기는 clean에서 시작하고 편집이 dirty로 만든다', () => {
    const { documentId } = openActive('/w/a.md', '디스크 내용\n');
    const doc = (): DocumentState => store().documents.get(documentId)!;
    expect(isDirty(doc())).toBe(false);
    store().editDocument(documentId, '편집\n');
    expect(isDirty(doc())).toBe(true);
  });

  it('currentRevision은 언제나 내용의 정체성이다', () => {
    const { documentId } = openActive('/w/a.md', 'A\n');
    store().editDocument(documentId, 'B\n');
    const doc = store().documents.get(documentId)!;
    expect(doc.currentRevision).toBe(revisionOf(doc.content));
  });

  it('마지막 패널은 닫히지 않는다', () => {
    const { panelId } = openActive('/w/a.md', 'A\n');
    expect(store().closePanel(panelId)).toBe(false);
    expect(store().panels).toHaveLength(1);
  });

  it('활성 패널의 문서를 조회할 수 있다', () => {
    const { panelId, documentId } = openActive('/w/a.md', 'A\n');
    expect(activeDocument(store())?.id).toBe(documentId);
    expect(documentOf(store(), panelId)?.id).toBe(documentId);
  });
});
