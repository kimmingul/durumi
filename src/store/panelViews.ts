import type { EditorView } from '@codemirror/view';
import { useWorkspaceStore, type PanelId } from './workspaceStore';

/**
 * 패널 ↔ 편집 표면의 대응 (SPEC-V03-WORKSPACE-002 M4, OQ-4 확정 = 후보 1).
 *
 * ## 왜 `RefObject`가 아니라 **접근자**인가
 *
 * 기각된 후보 2는 `RefObject<EditorView | null>`의 의미론을 유지하는 것이었다.
 * 그 형태에서 훅은 진입 시점에 `ref.current`를 한 번 뽑아 지역 변수에 담는다 —
 * `src/hooks/useMenuCommandRouter.ts`의 `const view = editorViewRef.current`가
 * `async` 핸들러의 첫 줄이었고 그 아래로 `await` 분기가 여럿이었다. 비동기 커맨드
 * 처리 중 활성 패널이 바뀌면 그 지역 변수는 **이미 활성이 아닌 패널의 뷰**를
 * 가리킨다. 오늘은 뷰가 하나뿐이라 무해했을 뿐이고, 패널이 둘이 되는 순간
 * 사용자가 보고 있지 않은 문서가 조용히 바뀐다.
 *
 * 접근자는 그 창을 닫는다 — **사용 시점에** 활성 패널을 읽으므로 `await` 이후의
 * 호출은 언제나 그 시점의 활성 패널로 간다.
 *
 * 기각된 후보 3(각 훅에 패널 ID 인자)은 REQ-PANEL-030의 "활성 패널은 하나"라는
 * 단일 정의를 호출부 수마다 흩뿌린다. 정의가 한 곳에 있어야 그것이 하나임을
 * 보장할 수 있다.
 *
 * ## 왜 zustand 상태가 아니라 모듈 레지스트리인가
 *
 * `EditorView`는 살아 있는 DOM 결속 객체다. 스토어 상태에 넣으면 (a) 값 비교가
 * 불가능해 구독자가 뷰 교체마다 전부 재렌더되고, (b) `workspaceStore`가 문서
 * 축·패널 축의 **직렬화 가능한** 상태만 담는다는 경계가 깨진다. 그 경계는
 * `workspaceStore`의 머리말이 "캐럿·선택·스크롤은 왜 여기 없는가"로 이미 적어 둔
 * 것이며, 뷰 객체는 그 목록의 극단이다.
 */

const viewsByPanel = new Map<PanelId, EditorView>();

/** 그 패널의 편집 표면이 준비되었거나(view) 파기되었다(null). */
export function setPanelView(panelId: PanelId, view: EditorView | null): void {
  if (view) viewsByPanel.set(panelId, view);
  else viewsByPanel.delete(panelId);
}

export function getPanelView(panelId: PanelId): EditorView | null {
  return viewsByPanel.get(panelId) ?? null;
}

/**
 * 그 뷰가 속한 패널. 편집 표면에서 발신되는 창 전역 이벤트가 **발신 패널을
 * 식별**하는 근거다(REQ-PANEL-034).
 */
export function panelIdOfView(view: EditorView): PanelId | null {
  for (const [panelId, registered] of viewsByPanel) {
    if (registered === view) return panelId;
  }
  return null;
}

/**
 * **활성 패널의** 편집 표면 — 뷰 의존 커맨드의 유일한 대상(REQ-PANEL-031).
 *
 * 호출 시점에 스토어를 읽는다. 이 한 줄이 낡은 뷰 창을 닫는다.
 */
export function getActiveView(): EditorView | null {
  const panelId = useWorkspaceStore.getState().activePanelId;
  return panelId === null ? null : getPanelView(panelId);
}

/** 테스트 격리용. 프로덕션 경로에서는 쓰지 않는다. */
export function resetPanelViews(): void {
  viewsByPanel.clear();
}
