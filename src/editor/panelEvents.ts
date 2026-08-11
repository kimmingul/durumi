import type { EditorView } from '@codemirror/view';
import { panelIdOfView } from '../store/panelViews';
import type { PanelId } from '../store/workspaceStore';

/**
 * 편집 표면에서 발신되어 셸이 수신하는 창 전역 이벤트 (REQ-PANEL-034).
 *
 * ## 무엇이 깨져 있었나
 *
 * 이 이벤트들은 발신 패널을 담지 않았고, 수신 측은 `window`에 붙는다. 패널이
 * 하나일 때는 구분할 것이 없어 무해했지만, 패널이 N개면 **N개의 수신기가 같은
 * 이벤트에 반응한다** — `EditorToolbar`는 패널마다 하나씩 마운트되고 두 리스너가
 * 모두 `durumi:edit-link`를 받으므로 링크 대화상자가 N개 열린다. REQ-PANEL-034가
 * 이름으로 지목한 결함이 그것이다.
 *
 * ## 어떻게 고쳤나
 *
 * 발신 측은 `detail.panelId`를 붙이고(식별), 패널에 매인 수신 측은 자기 패널이
 * 발신자가 아닌 이벤트를 건너뛴다(필터). 이벤트 이름·기존 `detail` 필드·버블링
 * 여부는 그대로다 — 기존 수신부와 테스트가 읽는 계약을 바꾸지 않기 위해서다.
 *
 * ## `panelId`가 없는 이벤트는 왜 통과시키는가
 *
 * 발신자가 편집 표면이 아닌 경로(뷰가 아직 등록되지 않은 순간, 장래의 셸 발신)가
 * 남아 있다. 그런 이벤트를 조용히 버리면 기능이 이유 없이 죽는다 — 식별할 수
 * 없는 발신자는 "누구의 것도 아니다"가 아니라 "모두의 것"으로 다룬다.
 */

export const PANEL_EVENT_NAMES = [
  'durumi:edit-link',
  'durumi:open-link-dialog',
  'durumi:memo-focus',
  'durumi:cm-focus',
  'durumi:reference-open',
  'durumi:memo-panel-toggle',
] as const;

export type PanelEventName = (typeof PANEL_EVENT_NAMES)[number];

/** 모든 패널 이벤트의 `detail`이 공통으로 갖는 부분. */
export interface PanelEventDetail {
  /** 발신 패널. 뷰가 아직 등록되지 않았으면 null이다. */
  panelId: PanelId | null;
}

/** 그 뷰가 속한 패널을 실은 `detail`을 만든다. */
export function withPanelId<D extends object>(
  view: EditorView,
  detail: D,
): D & PanelEventDetail {
  return { ...detail, panelId: panelIdOfView(view) };
}

/**
 * 편집 표면에서 창 전역 이벤트를 발신한다.
 *
 * `bubbles`가 필요한 발신부(위젯의 DOM 요소에서 올려 보내는 것)는 이 함수를 쓰지
 * 않고 `withPanelId`만 쓴다 — 그 이벤트들은 `window.dispatchEvent`가 아니라
 * 위젯 요소에서 버블링으로 올라가야 하고, 그 형태를 기존 테스트가 고정하고 있다.
 */
export function dispatchPanelEvent<D extends object>(
  view: EditorView,
  type: PanelEventName,
  detail?: D,
): void {
  window.dispatchEvent(
    new CustomEvent(type, { detail: withPanelId(view, detail ?? ({} as D)) }),
  );
}

/** 이벤트에 실린 발신 패널. 식별할 수 없으면 null. */
export function panelIdOfEvent(event: Event): PanelId | null {
  const detail = (event as CustomEvent<Partial<PanelEventDetail>>).detail;
  return detail?.panelId ?? null;
}

/**
 * 이 수신기가 그 이벤트를 처리해야 하는가 (REQ-PANEL-034의 "shall not").
 *
 * 자기 패널을 아직 모르는 수신기(뷰가 없어 `panelId`가 null인 툴바)는 처리한다 —
 * 패널이 하나뿐인 오늘의 동작이 그것이고, 여기서 막으면 마운트 직후의 이벤트가
 * 사라진다.
 */
export function acceptsPanelEvent(event: Event, receiverPanelId: PanelId | null): boolean {
  const sender = panelIdOfEvent(event);
  if (sender === null || receiverPanelId === null) return true;
  return sender === receiverPanelId;
}

/**
 * 패널에 매인 `window` 리스너. 자기 패널이 발신자가 아닌 이벤트는 건너뛴다.
 *
 * `receiverPanelId`를 값이 아니라 **함수**로 받는다: 툴바의 패널 식별자는 뷰가
 * 준비된 뒤에야 정해지고, 값으로 받으면 리스너가 그 시점의 null을 영구히 붙든다.
 */
export function addPanelScopedListener(
  type: PanelEventName,
  receiverPanelId: () => PanelId | null,
  handler: (event: Event) => void,
): () => void {
  const wrapped = (event: Event): void => {
    if (!acceptsPanelEvent(event, receiverPanelId())) return;
    handler(event);
  };
  window.addEventListener(type, wrapped as EventListener);
  return () => window.removeEventListener(type, wrapped as EventListener);
}
