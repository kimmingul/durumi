import { create } from 'zustand';
import {
  autoApplyPolicy,
  initialReconciliationState,
  reduceReconciliation,
  type ReconciliationEffect,
  type ReconciliationEvent,
  type ReconciliationPolicy,
  type ReconciliationState,
} from '@shared/reconciliation';

/**
 * 조정 상태 기계의 렌더러 측 보관소. 판정은 전부 `shared/reconciliation.ts`의
 * 순수 함수가 하고 이 스토어는 (a) 현재 상태 보관, (b) 정책 주입 지점,
 * (c) effect를 실행자에게 전달하는 배선만 맡는다.
 *
 * effect를 스토어가 직접 수행하지 않는 이유: 버퍼 적용은 최소 diff와 캐럿
 * 보존을 요구하므로 M6 소관이고, diff 표면은 SPEC-4 소관이다. 여기서는
 * 핸들러를 등록받아 넘기기만 한다 — 아직 아무도 등록하지 않았다면 조용히 버린다.
 */

export type ReconciliationEffectHandler = (effect: ReconciliationEffect) => void;

interface ReconciliationStore {
  state: ReconciliationState;
  policy: ReconciliationPolicy;
  /** 이벤트를 기계에 넣고 산출된 effect를 등록된 핸들러로 흘린다. */
  dispatch: (event: ReconciliationEvent) => ReconciliationEffect[];
  /** 조정 정책 교체 지점 (REQ-WS-029). SPEC-4의 승인 정책이 여기로 들어온다. */
  setPolicy: (policy: ReconciliationPolicy) => void;
  setEffectHandler: (handler: ReconciliationEffectHandler | null) => void;
  reset: () => void;
}

let effectHandler: ReconciliationEffectHandler | null = null;

export const useReconciliationStore = create<ReconciliationStore>((set, get) => ({
  state: initialReconciliationState(),
  policy: autoApplyPolicy,

  dispatch: (event) => {
    const { state, policy } = get();
    const result = reduceReconciliation(state, event, policy);
    set({ state: result.state });
    for (const effect of result.effects) effectHandler?.(effect);
    return result.effects;
  },

  setPolicy: (policy) => set({ policy }),

  setEffectHandler: (handler) => {
    effectHandler = handler;
  },

  reset: () => {
    effectHandler = null;
    set({ state: initialReconciliationState(), policy: autoApplyPolicy });
  },
}));
