/**
 * 외부 변경 조정 상태 기계 — 순수 함수. DOM·React·CodeMirror에 의존하지 않는다.
 *
 * 이 모듈이 M2의 검토 대상이다. 사용자에게 보이는 흐름(조용한 자동 반영, 배너,
 * 보류 표시, 사라짐 표시)을 상태와 전이로 기술하고, 렌더러는 그 위의 얇은
 * 표현 계층으로 둔다 — 상태 기계가 번복되어도 버려지는 코드가 적다.
 *
 * **모달 금지가 구조적인 이유**(REQ-WS-049): 알림 표면 종류는 `banner`와
 * `status` 둘뿐이며 `modal` 변형이 타입에 **존재하지 않는다**. 조정 알림에
 * 모달을 붙이려면 이 union을 먼저 넓혀야 하고, 그 순간 테스트가 깨진다.
 * 관례가 아니라 표현 불가능성으로 막는다 — 조합 중 포커스를 빼앗는 대화상자는
 * 한글 IME를 깨뜨리며, 이 저장소가 이미 다섯 번 출하한 결함 계열이다.
 *
 * **생산자는 여기에 없다**: `ConfirmedChange`를 실제로 만들어내는 감시·확정
 * 계층은 M4 소관이다. 이 모듈은 그 계약만 선언하고 소비만 한다.
 */

/** M4(감시·확정)가 산출할 확정 이벤트. M2는 계약만 정의한다. */
export interface ConfirmedChange {
  path: string;
  /** 재검사로 확정된 최종 디스크 내용. */
  content: string;
  mtimeMs: number;
  size: number;
}

export type ReconciliationEvent =
  | { type: 'external-change'; change: ConfirmedChange }
  | { type: 'external-delete'; path: string }
  | { type: 'decode-error'; path: string; message: string }
  /** IME 조합 경계. M5가 실제 관찰자를 배선한다. */
  | { type: 'composition-start' }
  | { type: 'composition-end' }
  | { type: 'dirty-changed'; isDirty: boolean }
  | { type: 'user-view-diff' }
  | { type: 'user-load-from-disk' }
  | { type: 'user-dismiss' }
  /** 저장 또는 재로드로 버퍼와 디스크가 일치하게 됨. */
  | { type: 'document-synced' };

export type ReconciliationStatus =
  | 'idle'
  /** 조합 중이라 보류 — 비침습 표시만 (REQ-WS-020, 023) */
  | 'held-composition'
  /** 정책이 알림을 택함 — 배너, 버퍼 불변 (REQ-WS-027) */
  | 'held-notify'
  /** 주입된 제3 정책이 승인을 기다림 (REQ-WS-029) */
  | 'held-approval'
  /** 디스크에서 사라짐 — 버퍼 보존 (REQ-WS-030) */
  | 'missing'
  /** 디코드 실패로 조정 중단 (REQ-WS-031) */
  | 'decode-error';

export interface ReconciliationState {
  status: ReconciliationStatus;
  isDirty: boolean;
  composing: boolean;
  /** 보류 중인 최신 디스크 상태. 같은 파일에 여러 변경이 오면 마지막만 남는다. */
  pending: ConfirmedChange | null;
  errorMessage: string | null;
  deferReason: string | null;
}

/**
 * 기계가 요청하는 부수 효과. 기계 자신은 버퍼를 건드리지 않는다 —
 * 실제 적용(최소 diff, 캐럿 보존)은 M6, diff 표면은 SPEC-4 소관이다.
 */
export type ReconciliationEffect =
  | { kind: 'apply-to-buffer'; content: string }
  | { kind: 'open-diff'; content: string };

export interface ReduceResult {
  state: ReconciliationState;
  effects: ReconciliationEffect[];
}

// ---------------------------------------------------------------------------
// 조정 정책 (REQ-WS-029)
// ---------------------------------------------------------------------------

export interface PolicyContext {
  change: ConfirmedChange;
  isDirty: boolean;
}

export type PolicyDecision =
  | { kind: 'apply' }
  | { kind: 'notify' }
  | { kind: 'defer'; reason: string };

export interface ReconciliationPolicy {
  readonly id: string;
  decide(ctx: PolicyContext): PolicyDecision;
}

/** 기본 정책 — 깨끗하면 조용히 반영하고, 미저장 편집이 있으면 배너로 알린다. */
export const autoApplyPolicy: ReconciliationPolicy = {
  id: 'auto-apply',
  decide: ({ isDirty }) => (isDirty ? { kind: 'notify' } : { kind: 'apply' }),
};

/** 항상 배너로 알리는 정책 — 깨끗한 버퍼에서도 자동 반영하지 않는다. */
export const bannerNotifyPolicy: ReconciliationPolicy = {
  id: 'banner-notify',
  decide: () => ({ kind: 'notify' }),
};

// ---------------------------------------------------------------------------
// 알림 표면 (REQ-WS-023, 027, 049)
// ---------------------------------------------------------------------------

/**
 * 알림 표면의 **전체** 목록. `modal`이 없는 것이 이 배열의 요점이다 —
 * REQ-WS-049를 관례가 아니라 타입으로 강제한다.
 */
export const NOTICE_PRESENTATIONS = ['banner', 'status'] as const;
export type NoticePresentation = (typeof NOTICE_PRESENTATIONS)[number];

export type NoticeAction = 'view-diff' | 'load-from-disk' | 'dismiss';

export interface ReconciliationNotice {
  status: Exclude<ReconciliationStatus, 'idle'>;
  presentation: NoticePresentation;
  actions: NoticeAction[];
  detail: string | null;
}

const CONFLICT_ACTIONS: NoticeAction[] = ['view-diff', 'load-from-disk', 'dismiss'];

/** 현재 상태가 사용자에게 보여야 할 알림. idle이면 null. */
export function noticeFor(state: ReconciliationState): ReconciliationNotice | null {
  switch (state.status) {
    case 'idle':
      return null;
    case 'held-composition':
      // 조합 중에는 어떤 동작도 제시하지 않는다 — 버튼은 포커스를 유혹한다.
      return { status: state.status, presentation: 'status', actions: [], detail: null };
    case 'held-notify':
      return { status: state.status, presentation: 'banner', actions: CONFLICT_ACTIONS, detail: null };
    case 'held-approval':
      return {
        status: state.status,
        presentation: 'banner',
        actions: CONFLICT_ACTIONS,
        detail: state.deferReason,
      };
    case 'missing':
      // 알림이 아니라 현실의 반영이므로 해제 대상이 아니다.
      return { status: state.status, presentation: 'status', actions: [], detail: null };
    case 'decode-error':
      return {
        status: state.status,
        presentation: 'banner',
        actions: ['dismiss'],
        detail: state.errorMessage,
      };
  }
}

// ---------------------------------------------------------------------------
// 상태 기계
// ---------------------------------------------------------------------------

export function initialReconciliationState(): ReconciliationState {
  return {
    status: 'idle',
    isDirty: false,
    composing: false,
    pending: null,
    errorMessage: null,
    deferReason: null,
  };
}

function settled(state: ReconciliationState): ReconciliationState {
  return { ...state, status: 'idle', pending: null, errorMessage: null, deferReason: null };
}

/**
 * 확정된 변경을 정책에 통과시킨다.
 *
 * 조합 중이면 정책을 묻지 않고 무조건 보류한다 — IME 안전이 정책보다 위다.
 * 정책이 `apply`를 반환해도 미저장 편집이 있으면 배너로 강등한다: REQ-WS-028은
 * 타협 불가이므로 **정책이 위반할 수 없는 위치**에 둔다.
 */
function routeChange(state: ReconciliationState, change: ConfirmedChange, policy: ReconciliationPolicy): ReduceResult {
  if (state.composing) {
    return { state: { ...state, status: 'held-composition', pending: change }, effects: [] };
  }

  const decision = policy.decide({ change, isDirty: state.isDirty });

  if (decision.kind === 'apply' && !state.isDirty) {
    return {
      state: settled(state),
      effects: [{ kind: 'apply-to-buffer', content: change.content }],
    };
  }
  if (decision.kind === 'defer') {
    return {
      state: { ...state, status: 'held-approval', pending: change, deferReason: decision.reason },
      effects: [],
    };
  }
  // notify — 그리고 dirty 상태에서 정책이 apply를 지시한 경우도 여기로 강등된다.
  return { state: { ...state, status: 'held-notify', pending: change, deferReason: null }, effects: [] };
}

export function reduceReconciliation(
  state: ReconciliationState,
  event: ReconciliationEvent,
  policy: ReconciliationPolicy = autoApplyPolicy,
): ReduceResult {
  switch (event.type) {
    case 'dirty-changed':
      return { state: { ...state, isDirty: event.isDirty }, effects: [] };

    case 'composition-start':
      return { state: { ...state, composing: true }, effects: [] };

    case 'composition-end': {
      const next = { ...state, composing: false };
      if (next.status !== 'held-composition' || !next.pending) {
        return { state: next, effects: [] };
      }
      // 보류 중 쌓인 변경 중 최종 상태 하나만 정책에 태운다 (REQ-WS-021).
      return routeChange(next, next.pending, policy);
    }

    case 'external-change':
      return routeChange(state, event.change, policy);

    case 'external-delete':
      // 버퍼를 비우지 않는다 — effect 없음이 곧 버퍼 보존이다 (REQ-WS-030).
      return {
        state: { ...state, status: 'missing', pending: null, deferReason: null },
        effects: [],
      };

    case 'decode-error':
      // 손상된 내용으로 덮어쓰지 않고 보류분도 폐기한다 (REQ-WS-031).
      return {
        state: { ...state, status: 'decode-error', pending: null, errorMessage: event.message },
        effects: [],
      };

    case 'user-view-diff':
      if (!state.pending) return { state, effects: [] };
      return { state, effects: [{ kind: 'open-diff', content: state.pending.content }] };

    case 'user-load-from-disk':
      // 사용자의 명시적 확인이므로 미저장 편집을 대체해도 REQ-WS-028을 지킨다.
      if (!state.pending) return { state, effects: [] };
      return {
        state: settled(state),
        effects: [{ kind: 'apply-to-buffer', content: state.pending.content }],
      };

    case 'user-dismiss':
      // 사라짐은 알림이 아니라 상태이므로 해제되지 않는다.
      if (state.status === 'missing') return { state, effects: [] };
      // 보류분을 버리되 버퍼는 사용자의 편집 그대로 남는다 (AC-WS-030).
      return { state: settled(state), effects: [] };

    case 'document-synced':
      return { state: settled(state), effects: [] };
  }
}
