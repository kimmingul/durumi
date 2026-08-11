import { create } from 'zustand';
import { pathKey, samePath as samePathIdentity } from '@shared/pathIdentity';
import { EDIT_MODES, type EditMode } from '../editor/editMode';

/**
 * 워크스페이스 상태 — **문서 축**과 **패널 축**의 분리 (SPEC-V03-WORKSPACE-002 M1).
 *
 * ## 왜 두 축인가 (REQ-PANEL-010)
 *
 * 두 사용 흐름이 서로 다른 축을 요구한다. 서로 다른 파일을 나란히 보려면
 * 캐럿·스크롤·모드가 **패널별**이어야 하고, 같은 파일을 두 패널에서 고치려면
 * 내용·미저장 여부가 **하나**여야 한다 — 둘로 갈라지면 저장 시 어느 쪽을 쓸지
 * 정의할 수 없고 그것이 곧 데이터 손실이다.
 *
 * v0.3은 두 번째 흐름(dual-open)을 **금지한다**(REQ-PANEL-011). 그럼에도 축은
 * 합치지 않는다 — 합치면 v0.4의 dual-open이 재작성이 된다. 구조는 1:N을 표현할
 * 수 있게 남고 v0.3은 그중 1:1만 쓴다.
 *
 * ## 왜 두 축이 한 스토어에 있는가
 *
 * 축이 분리된다는 것은 **필드 집합과 참조 관계**의 성질이지 저장소 개수의
 * 성질이 아니다. 열기·닫기·저장·폐기 확인은 전부 두 축에 걸치므로, 하나의
 * 스토어 안에 두면 그 전이가 원자적이고 교차 구독 순서 문제가 생기지 않는다
 * (REQ-PANEL-014가 "임의 순서"를 요구한다).
 *
 * ## 캐럿·선택·스크롤·실행 취소는 왜 여기 없는가
 *
 * CodeMirror의 `StateField`와 `history()` extension이 `EditorState`마다 하나이므로
 * 뷰를 늘리면 그것들은 **공짜로 패널별**이 된다(`design.md` §2.1a). 스토어로
 * 끌어올리면 이미 맞는 것을 재작성하는 셈이다.
 */

// ---------------------------------------------------------------------------
// 문서 축
// ---------------------------------------------------------------------------

export type DocumentId = string;
export type PanelId = string;

/** 마크다운 원고인가 보조 파일인가. 판정 함수 자체는 M5 소관이다. */
export type FileKind = 'markdown' | 'auxiliary';

/**
 * 내용의 **정체성**. 같은 내용이면 같은 revision이다.
 *
 * **단조 증가 카운터가 아닌 것이 핵심이다.** 카운터로 두면 편집 후 원복이
 * 영원히 dirty로 남아 issue #12(sticky)를 다른 형태로 재도입한다 — 그 결함의
 * 정확한 형태가 "내용이 원복돼도 false로 돌아오지 않는다"이기 때문이다.
 * 내용 자체를 정체성으로 삼으면 원복이 clean으로 돌아오고(AC-PANEL-010b),
 * 해시가 아니므로 충돌로 dirty 문서를 clean으로 오판할 여지도 없다.
 *
 * 문자열은 불변이므로 저장 직후 `currentRevision`과 `savedRevision`은 **같은
 * 참조**다 — 사본이 생기는 것은 편집으로 갈라진 동안뿐이다.
 */
export type Revision = string & { readonly __revision: unique symbol };

export const revisionOf = (content: string): Revision => content as Revision;

/**
 * 문서 축 — 디스크 경로·버퍼 내용·미저장 여부·파일 종류.
 *
 * 캐럿·선택·스크롤·실행 취소 이력·표시 모드는 **여기 없다**(REQ-PANEL-010).
 */
export interface DocumentState {
  readonly id: DocumentId;
  /** 아직 저장된 적 없는 문서(untitled)는 null이다. */
  readonly path: string | null;
  readonly content: string;
  /** 항상 `revisionOf(content)`. 미저장 여부는 아래 부등식으로 파생된다. */
  readonly currentRevision: Revision;
  /** 마지막으로 디스크에 쓰인(또는 디스크에서 읽은) 내용의 revision. */
  readonly savedRevision: Revision;
  readonly kind: FileKind;
}

/**
 * 미저장 여부 — **파생값이며 가변 boolean이 아니다**(REQ-PANEL-015).
 *
 * 파생값은 sticky일 수 없다. 그리고 저장이 `savedRevision = <저장을 시작한
 * 시점의 revision>` 대입이 되므로, 저장의 await 창 안에서 타이핑된 편집은
 * `currentRevision`을 갈라놓아 부등식이 참으로 남는다 — "지금을 clean으로
 * 선언하는" 명령형 연산이 사라지면 낡은 선언도 사라진다.
 */
export function isDirty(doc: DocumentState): boolean {
  return doc.currentRevision !== doc.savedRevision;
}

// ---------------------------------------------------------------------------
// 패널 축
// ---------------------------------------------------------------------------

/**
 * 패널 축 — 문서를 **참조한다**. 내용도 미저장 여부도 여기 없다.
 *
 * `documentId`는 소유가 아니라 참조다. 문서가 패널을 1개만 가질 수 있다고
 * 타입으로도 구조로도 강제하지 않는다 — 여러 패널이 같은 `documentId`를
 * 가리킬 수 있고, v0.3이 그러지 않을 뿐이다(REQ-PANEL-011a).
 */
export interface PanelState {
  readonly panelId: PanelId;
  readonly documentId: DocumentId;
  /**
   * 이 패널의 표시 모드 (REQ-PANEL-021).
   *
   * M1이 이 필드를 만들었으나 읽는 곳이 0곳이었고, 살아 있는 모드는 창 전역의
   * `appStore.editMode` 하나였다. M4가 그 배선을 뒤집는다 — 이제 이 값이 살아
   * 있는 모드이고 `appStore.defaultMode`는 **새 원고 패널의 초기값**으로만 쓰인다
   * (REQ-PANEL-023).
   *
   * 보조 패널에서는 이 값이 쓰이지 않는다. 실효 모드는 `displayModeOf`가 준다.
   */
  readonly displayMode: EditMode;
  /**
   * `Cmd+/`가 되돌아갈 모드. **패널마다 따로** 기억한다.
   *
   * 창 전역으로 두면 패널 A에서 토글한 기억이 패널 B의 목적지를 규정한다 —
   * REQ-PANEL-023이 `defaultMode`에 대해 금지한 것과 같은 형태의 결함이다.
   */
  readonly lastNonMarkdownMode: Exclude<EditMode, 'markdown'>;
}

// ---------------------------------------------------------------------------
// 경로 동일성
// ---------------------------------------------------------------------------

/**
 * 두 경로가 같은 문서를 가리키는가 (REQ-PANEL-011a).
 *
 * **보장하는 것**: 같은 파일을 가리키는 두 표기는 그 플랫폼의 규칙으로 동일시된다
 * (Windows의 구분자·대소문자 차이 흡수 — REQ-PANEL-051).
 * **보장하지 않는 것**: 같은 파일을 가리키는 심볼릭·하드 링크 별칭은 서로 다른
 * 경로로 인식된다. `electron/pathGuard.ts`가 `fs.realpath`를 **의도적으로
 * 호출하지 않으므로**(모든 guarded 호출에 비동기 디스크 접근을 붙이지 않기 위한
 * 기록된 수용 위험) 앱은 바이트 수준 파일 동일성 탐지를 **주장하지 않는다**.
 *
 * 판정 자체는 `shared/pathIdentity.ts`의 순수 함수가 한다 — 여기 두면 Windows
 * 규칙이 Windows에서만 검증 가능해지는데 이 저장소에는 Windows e2e가 없다(C-7).
 * 예고된 교체 지점이 여기였고, 호출부는 바뀌지 않았다.
 */
export function samePath(a: string | null, b: string | null): boolean {
  return samePathIdentity(a, b);
}

// ---------------------------------------------------------------------------
// 스냅샷과 순수 조회
// ---------------------------------------------------------------------------

export interface WorkspaceSnapshot {
  readonly documents: ReadonlyMap<DocumentId, DocumentState>;
  readonly panels: readonly PanelState[];
  readonly activePanelId: PanelId | null;
}

export function panelById(s: WorkspaceSnapshot, panelId: PanelId): PanelState | null {
  return s.panels.find((p) => p.panelId === panelId) ?? null;
}

export function documentOf(s: WorkspaceSnapshot, panelId: PanelId): DocumentState | null {
  const panel = panelById(s, panelId);
  return panel ? (s.documents.get(panel.documentId) ?? null) : null;
}

export function activePanel(s: WorkspaceSnapshot): PanelState | null {
  return s.activePanelId === null ? null : panelById(s, s.activePanelId);
}

export function activeDocument(s: WorkspaceSnapshot): DocumentState | null {
  return s.activePanelId === null ? null : documentOf(s, s.activePanelId);
}

// ---------------------------------------------------------------------------
// 표시 모드 조회 (REQ-PANEL-020·021·022·024)
// ---------------------------------------------------------------------------

/** 이 패널이 마크다운 원고를 보고 있는가. 판정의 근거는 **문서의 종류**다. */
export function isMarkdownPanel(s: WorkspaceSnapshot, panelId: PanelId): boolean {
  return documentOf(s, panelId)?.kind === 'markdown';
}

/**
 * 그 패널에 제시할 수 있는 모드 집합 (REQ-PANEL-020·022).
 *
 * 원고 패널은 3-모드를 그대로 제공하고, 보조 패널은 **빈 집합**이다 — 마크다운
 * 마커를 숨기거나 드러내는 개념이 `.py` 문서에 존재하지 않으므로 선택 수단을
 * 제시하지 않는다. 없는 패널도 빈 집합이다(제시할 대상이 없다).
 */
export function availableModesOf(s: WorkspaceSnapshot, panelId: PanelId): readonly EditMode[] {
  return isMarkdownPanel(s, panelId) ? EDIT_MODES : [];
}

/**
 * 그 패널의 **실효** 표시 모드 — 편집 표면에 실제로 넘어가는 값.
 *
 * 보조 패널은 `panel.displayMode`가 무엇이든 `markdown`이다. 그 한 줄이
 * AC-PANEL-022의 "라이브 데코레이션 집합이 비어 있다"를 만든다 —
 * `MarkdownEditor`의 `decorationsForMode('markdown')`가 빈 배열이기 때문이다.
 * 데코레이션을 끄는 별도 축을 새로 만들지 않은 이유가 이것이다: 이미 있는 축이
 * 정확히 그 뜻을 갖고 있고, 축을 하나 더 두면 둘이 어긋날 자리가 생긴다.
 *
 * `editModeField` 자체는 여전히 등록된다(`editModeStateExtension`은 모드
 * 컴파트먼트 **밖**에 있다) — 필드가 없으면 `currentEditMode`의 `typora` 폴백이
 * 흘러든다(`design.md` §5.2).
 */
export function displayModeOf(s: WorkspaceSnapshot, panelId: PanelId): EditMode {
  const panel = panelById(s, panelId);
  if (!panel) return 'wysiwyg';
  return isMarkdownPanel(s, panelId) ? panel.displayMode : 'markdown';
}

/** 그 문서를 참조하는 패널 전부. v0.3에서는 언제나 0개 또는 1개다. */
export function panelsReferencing(s: WorkspaceSnapshot, documentId: DocumentId): PanelState[] {
  return s.panels.filter((p) => p.documentId === documentId);
}

/**
 * 패널이 하나 이상 참조하는, **경로를 가진** 문서 전부 (REQ-PANEL-050).
 *
 * 외부 변경 감시의 등록 대상이 이 목록이다. 활성 패널의 문서 하나가 아니라
 * **열린 모든 패널의 문서**인 것이 요점이다 — 보조 패널의 문서가 빠지면 그
 * 문서의 외부 변경이 영영 올라오지 않고, 사용자는 남이 고친 파일 위에 저장한다.
 *
 * ## 참조 카운트를 숫자로 들고 다니지 않는 이유
 *
 * 등록은 **경로당 1회**다. 그러면 "참조하는 패널이 하나라도 있는가"만으로
 * REQ-PANEL-050의 등록·해제 규칙이 그대로 성립한다 — 두 패널이 같은 문서를
 * 보면 목록에 한 번 나타나므로 등록이 1회이고, 마지막 패널이 닫히는 순간
 * 목록에서 사라지므로 해제도 1회다. 숫자를 따로 관리하면 그 숫자와 집합이
 * 어긋날 여지가 생기고, 어긋나면 감시가 조용히 끊긴다.
 *
 * 중복 제거는 **경로 동일성**으로 한다(REQ-PANEL-051). 문서 식별자로만 접으면
 * 같은 파일을 가리키는 두 표기가 두 번 등록된다.
 */
export function openDocuments(s: WorkspaceSnapshot): DocumentState[] {
  const byPath = new Map<string, DocumentState>();
  for (const panel of s.panels) {
    const doc = s.documents.get(panel.documentId);
    if (!doc || doc.path === null) continue;
    const key = pathKey(doc.path);
    if (!byPath.has(key)) byPath.set(key, doc);
  }
  return [...byPath.values()];
}

/** 그 경로를 이미 열고 있는 패널. dual-open 판정의 근거다(REQ-PANEL-011). */
export function panelShowingPath(s: WorkspaceSnapshot, path: string | null): PanelState | null {
  if (path === null) return null;
  return s.panels.find((p) => samePath(s.documents.get(p.documentId)?.path ?? null, path)) ?? null;
}

/**
 * 이 패널이 그 문서를 참조하는 **마지막** 패널인가 (REQ-PANEL-013).
 *
 * 판정을 "패널을 닫는가"가 아니라 참조 수로 표현하는 것이 요점이다. v0.3은
 * 1:1이라 두 표현이 같은 결과를 내지만, 참조 수로 적어 두어야 v0.4의 dual-open이
 * 이 분기를 재작성 없이 활성화한다.
 */
export function isLastReferencingPanel(s: WorkspaceSnapshot, panelId: PanelId): boolean {
  const panel = panelById(s, panelId);
  if (!panel) return false;
  return panelsReferencing(s, panel.documentId).length <= 1;
}

/**
 * 이 패널을 닫을 때 폐기 확인이 필요한가 (REQ-PANEL-013·014).
 *
 * 미저장 편집이 있고 **그 문서를 참조하는 마지막 패널**일 때만 필요하다. 다른
 * 패널이 남아 있으면 편집이 소실되지 않으므로 확인을 요구하지 않는다 — v0.3에서
 * 도달 불가한 분기이며, 도달 불가한 채로 표현해 두는 것이 이 함수의 목적이다.
 */
export function needsDiscardConfirm(s: WorkspaceSnapshot, panelId: PanelId): boolean {
  const doc = documentOf(s, panelId);
  if (doc === null || !isDirty(doc)) return false;
  return isLastReferencingPanel(s, panelId);
}

// ---------------------------------------------------------------------------
// 스토어
// ---------------------------------------------------------------------------

export interface OpenResult {
  readonly panelId: PanelId;
  /** 이미 그 경로를 열고 있던 패널로 이동했는가 (dual-open 금지의 결과). */
  readonly reused: boolean;
}

interface WorkspaceStore extends WorkspaceSnapshot {
  documents: Map<DocumentId, DocumentState>;
  panels: PanelState[];
  activePanelId: PanelId | null;

  /**
   * 경로로 문서를 연다 (REQ-PANEL-011).
   *
   * 이미 그 경로를 열고 있는 패널이 있으면 **새 문서도 새 패널도 만들지 않고**
   * 그 패널을 활성화한다. 사용자에게는 금지가 아니라 그 패널로의 이동이다.
   */
  openInActivePanel: (path: string | null, content: string, kind?: FileKind) => OpenResult;
  /**
   * 새 패널을 만들어 연다. 같은 경로가 이미 열려 있으면 그 패널로 이동한다.
   *
   * `initialMode`는 **새 원고 패널의 초기 모드**다(REQ-PANEL-023). 스토어가
   * `prefs`를 읽지 않고 호출부가 넘기는 이유: 그래야 이 스토어가 preload 브리지에
   * 의존하지 않고, 기본값의 출처가 호출부에서 눈에 보인다.
   */
  openInNewPanel: (
    path: string | null,
    content: string,
    kind?: FileKind,
    initialMode?: EditMode,
  ) => OpenResult;

  /**
   * 그 패널의 표시 모드를 바꾼다 (REQ-PANEL-021·023).
   *
   * **`prefs`에 쓰지 않는다.** 마지막으로 모드를 바꾼 패널이 전역 기본값을
   * 결정하면 다음 세션의 모든 패널이 그 선택에 규정된다(기각된 후보 2).
   * AC-PANEL-023이 `prefsSet` 호출 횟수 0으로 이 성질을 판정한다.
   */
  setPanelDisplayMode: (panelId: PanelId, mode: EditMode) => void;
  /** `Cmd+/` — 그 패널을 markdown과 직전 비-markdown 모드 사이에서 오간다. */
  togglePanelSourceMode: (panelId: PanelId) => void;

  /** 버퍼 편집. `currentRevision`이 내용을 따라가고 미저장 여부는 파생된다. */
  editDocument: (documentId: DocumentId, content: string) => void;
  /**
   * 저장 완료를 기록한다 — **저장을 시작한 시점의 revision**을 넘긴다.
   * 그 사이에 편집이 있었다면 `currentRevision`이 갈라져 dirty로 남는다.
   */
  markDocumentSaved: (documentId: DocumentId, revision: Revision) => void;
  /** 저장 대상은 **문서**다. 패널 식별자로 고르지 않는다(REQ-PANEL-012). */
  setDocumentPath: (documentId: DocumentId, path: string, content?: string) => void;

  setActivePanel: (panelId: PanelId) => void;
  /** 확인 없이 닫는다. 폐기 확인은 `requestClosePanel`이 앞에서 처리한다. */
  closePanel: (panelId: PanelId) => boolean;

  reset: () => void;
}

let seq = 0;
const nextId = (prefix: string): string => `${prefix}-${++seq}`;

function emptyDocument(): DocumentState {
  const content = '';
  return {
    id: nextId('doc'),
    path: null,
    content,
    currentRevision: revisionOf(content),
    savedRevision: revisionOf(content),
    kind: 'markdown',
  };
}

interface WorkspaceData {
  documents: Map<DocumentId, DocumentState>;
  panels: PanelState[];
  activePanelId: PanelId | null;
}

function initialState(): WorkspaceData {
  // 창은 언제나 패널을 하나 이상 담는다. 시작 상태는 빈 untitled 버퍼 하나이며
  // 이것이 오늘의 단일 패널 동작과 관측상 같다.
  const doc = emptyDocument();
  const panel: PanelState = {
    panelId: nextId('panel'),
    documentId: doc.id,
    displayMode: 'wysiwyg',
    lastNonMarkdownMode: 'wysiwyg',
  };
  return {
    documents: new Map([[doc.id, doc]]),
    panels: [panel],
    activePanelId: panel.panelId,
  };
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => {
  const withDocument = (documentId: DocumentId, next: (doc: DocumentState) => DocumentState): void => {
    const doc = get().documents.get(documentId);
    if (!doc) return;
    set({ documents: new Map(get().documents).set(documentId, next(doc)) });
  };

  /** 문서를 새로 만든다. 열기·재바인딩의 공통 경로다. */
  const makeDocument = (path: string | null, content: string, kind: FileKind): DocumentState => ({
    id: nextId('doc'),
    path,
    content,
    currentRevision: revisionOf(content),
    // 방금 디스크에서 읽었거나 디스크로 쓴 내용이므로 clean으로 시작한다.
    savedRevision: revisionOf(content),
    kind,
  });

  /** 그 패널을 새 문서에 바인딩하고, 아무도 참조하지 않게 된 문서는 거둔다. */
  const bind = (panelId: PanelId, doc: DocumentState): void => {
    const s = get();
    const previous = panelById(s, panelId)?.documentId ?? null;
    const documents = new Map(s.documents).set(doc.id, doc);
    const panels = s.panels.map((p) => (p.panelId === panelId ? { ...p, documentId: doc.id } : p));
    if (previous !== null && !panels.some((p) => p.documentId === previous)) {
      documents.delete(previous);
    }
    set({ documents, panels, activePanelId: panelId });
  };

  return {
    ...initialState(),

    openInActivePanel: (path, content, kind = 'markdown') => {
      const s = get();
      const existing = panelShowingPath(s, path);
      if (existing) {
        set({ activePanelId: existing.panelId });
        return { panelId: existing.panelId, reused: true };
      }
      const panelId = s.activePanelId ?? s.panels[0]?.panelId ?? null;
      if (panelId === null) return get().openInNewPanel(path, content, kind);
      bind(panelId, makeDocument(path, content, kind));
      return { panelId, reused: false };
    },

    openInNewPanel: (path, content, kind = 'markdown', initialMode = 'wysiwyg') => {
      const s = get();
      const existing = panelShowingPath(s, path);
      if (existing) {
        set({ activePanelId: existing.panelId });
        return { panelId: existing.panelId, reused: true };
      }
      const doc = makeDocument(path, content, kind);
      const panel: PanelState = {
        panelId: nextId('panel'),
        documentId: doc.id,
        displayMode: initialMode,
        lastNonMarkdownMode: initialMode === 'markdown' ? 'wysiwyg' : initialMode,
      };
      set({
        documents: new Map(s.documents).set(doc.id, doc),
        panels: [...s.panels, panel],
        activePanelId: panel.panelId,
      });
      return { panelId: panel.panelId, reused: false };
    },

    editDocument: (documentId, content) => {
      withDocument(documentId, (doc) =>
        doc.content === content ? doc : { ...doc, content, currentRevision: revisionOf(content) },
      );
    },

    markDocumentSaved: (documentId, revision) => {
      withDocument(documentId, (doc) => ({ ...doc, savedRevision: revision }));
    },

    setDocumentPath: (documentId, path, content) => {
      withDocument(documentId, (doc) => {
        const next = content ?? doc.content;
        return {
          ...doc,
          path,
          content: next,
          currentRevision: revisionOf(next),
          savedRevision: revisionOf(next),
        };
      });
    },

    setActivePanel: (panelId) => {
      if (!panelById(get(), panelId)) return;
      set({ activePanelId: panelId });
    },

    setPanelDisplayMode: (panelId, mode) => {
      const s = get();
      // 그 패널이 제시하지 않는 모드는 설정되지 않는다 — 보조 패널의 모드 집합은
      // 비어 있으므로(REQ-PANEL-022) 여기서 걸러진다. 저장해 두고 실효값에서만
      // 무시하면 필드가 조용히 드리프트하고, 그 패널이 나중에 원고로 재바인딩될 때
      // 사용자가 고른 적 없는 모드가 되살아난다.
      if (!availableModesOf(s, panelId).includes(mode)) return;
      set({
        panels: s.panels.map((p) =>
          p.panelId === panelId
            ? {
                ...p,
                displayMode: mode,
                lastNonMarkdownMode: mode === 'markdown' ? p.lastNonMarkdownMode : mode,
              }
            : p,
        ),
      });
    },

    togglePanelSourceMode: (panelId) => {
      const s = get();
      const panel = panelById(s, panelId);
      if (!panel) return;
      const next = panel.displayMode === 'markdown' ? panel.lastNonMarkdownMode : 'markdown';
      get().setPanelDisplayMode(panelId, next);
    },

    closePanel: (panelId) => {
      const s = get();
      // 마지막 패널은 닫히지 않는다 — 창은 언제나 패널을 하나 이상 담는다.
      if (s.panels.length <= 1) return false;
      const panel = panelById(s, panelId);
      if (!panel) return false;
      const panels = s.panels.filter((p) => p.panelId !== panelId);
      const documents = new Map(s.documents);
      if (!panels.some((p) => p.documentId === panel.documentId)) {
        documents.delete(panel.documentId);
      }
      set({
        documents,
        panels,
        activePanelId: s.activePanelId === panelId ? (panels[0]?.panelId ?? null) : s.activePanelId,
      });
      return true;
    },

    reset: () => set({ ...initialState() }),
  };
});

// ---------------------------------------------------------------------------
// 구독 헬퍼
// ---------------------------------------------------------------------------

/**
 * 활성 패널이 참조하는 문서를 구독한다.
 *
 * `select`는 **안정된 값**을 돌려줘야 한다(원시값이거나 문서 객체 그대로).
 * 매번 새 객체를 만들면 zustand의 참조 비교가 항상 달라져 무한 렌더가 된다.
 */
export function useActiveDocument<T>(select: (doc: DocumentState | null) => T): T {
  return useWorkspaceStore((s) => select(activeDocument(s)));
}

// ---------------------------------------------------------------------------
// 저장 흐름
// ---------------------------------------------------------------------------

/**
 * 문서를 저장한다 — **대상은 문서이며 패널이 아니다**(REQ-PANEL-012).
 *
 * v0.3은 문서:패널이 1:1이라 두 표현이 같은 결과를 내지만, 문서 단위로 적어
 * 두어야 v0.4에서 "어느 패널이 저장 권한을 갖는가"를 재정의하지 않는다.
 *
 * **await 창을 구조적으로 닫는다**(REQ-PANEL-015): 쓸 내용과 그 revision을
 * 쓰기 **전에** 붙잡고, 완료 후 `savedRevision`에 그 revision을 대입한다.
 * 쓰는 동안 타이핑된 편집은 `currentRevision`을 갈라놓으므로 문서는 dirty로
 * 남는다 — "지금을 clean으로 선언하는" 명령형 연산이 없기 때문이다.
 */
export async function saveDocument(
  documentId: DocumentId,
  write: (path: string, content: string) => Promise<string | void>,
): Promise<boolean> {
  const doc = useWorkspaceStore.getState().documents.get(documentId);
  if (!doc || doc.path === null) return false;

  // 쓰기 시작 시점의 내용과 revision을 붙잡는다.
  const { path, content, currentRevision } = doc;
  const onDisk = await write(path, content);

  const store = useWorkspaceStore.getState();
  const after = store.documents.get(documentId);
  if (!after) return false;

  // main이 내용을 다시 쓴 경우(예: pending 이미지 참조를 `assets/`로 이관하며
  // 마크다운을 재작성) 디스크에 있는 것은 우리가 보낸 문자열이 아니다.
  //
  // 그 결과를 버퍼에 반영하는 것은 **쓰는 동안 아무도 타이핑하지 않았을
  // 때만** 한다. 타이핑이 있었다면 반영은 곧 사용자의 미저장 편집을 확인 없이
  // 덮어쓰는 것이며, REQ-PANEL-014가 타협 불가라고 못박은 결과다. 그 경우
  // 문서는 dirty로 남고 사용자가 다시 저장하면 이관된 내용 위에 쓰인다.
  const untouched = after.currentRevision === currentRevision;
  if (typeof onDisk === 'string' && onDisk !== content && untouched) {
    store.editDocument(documentId, onDisk);
    useWorkspaceStore.getState().markDocumentSaved(documentId, revisionOf(onDisk));
    return true;
  }

  store.markDocumentSaved(documentId, currentRevision);
  return true;
}

// ---------------------------------------------------------------------------
// 패널 닫기 흐름
// ---------------------------------------------------------------------------

export type DiscardChoice = 'save' | 'discard' | 'cancel';

export interface ClosePanelHandlers {
  /** 기존 폐기 확인 대화상자 (`window.api.confirmDiscard`). */
  confirmDiscard: (name: string | null) => Promise<DiscardChoice>;
  /** 확인에서 '저장'을 고른 경우의 저장 흐름. 성공하면 true. */
  save: (doc: DocumentState) => Promise<boolean>;
}

/**
 * 패널 닫기 요청 — 닫혔으면 true (REQ-PANEL-013·014).
 *
 * 확인을 요구하는 조건은 "패널을 닫는가"가 아니라 **"미저장 편집이 있고 그
 * 문서를 참조하는 마지막 패널인가"** 다(`needsDiscardConfirm`). 사용자가
 * 취소하면 패널도 문서 내용도 그대로 남는다 — 확인 없이 편집이 사라지지 않는
 * 것은 SPEC-1 REQ-WS-028의 패널 축 확장이며 동일하게 타협 불가다.
 */
export async function requestClosePanel(
  panelId: PanelId,
  handlers: ClosePanelHandlers,
): Promise<boolean> {
  const store = useWorkspaceStore.getState();
  if (!needsDiscardConfirm(store, panelId)) return store.closePanel(panelId);

  const doc = documentOf(store, panelId)!;
  const choice = await handlers.confirmDiscard(doc.path);
  if (choice === 'cancel') return false;
  if (choice === 'save' && !(await handlers.save(doc))) return false;
  return useWorkspaceStore.getState().closePanel(panelId);
}
