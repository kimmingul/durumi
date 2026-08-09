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
 * 조정 상태 기계의 렌더러 측 보관소 **겸 라우팅 계층**.
 *
 * 판정은 전부 `shared/reconciliation.ts`의 순수 함수가 하고 이 스토어는
 * (a) 현재 상태 보관, (b) 정책 주입 지점, (c) effect를 실행자에게 전달하는
 * 배선, 그리고 (d) **확정 이벤트를 어느 문서로 보낼지 고르는 것**을 맡는다.
 *
 * ## 왜 라우팅이 여기 있는가 (SPEC-V03-WORKSPACE-002 REQ-PANEL-072 / C-12)
 *
 * SPEC-1은 조정 코어 다섯 파일을 의도적으로 **경로 무지**로 만들었다 —
 * `tests/electron/extensionIndependence.test.ts`가 그 다섯 파일에 확장자 판독
 * 수단이 없음과 `applyExternalChange`의 arity 2를 강제한다. 한번 코어가 경로를
 * 받으면 확장자 분기가 한 줄 거리가 되어 그 방어가 관례로 전락한다.
 *
 * 그래서 경로 키는 **코어 밖**, 이 계층에 산다. `applyExternalChange(target,
 * content)`는 여전히 "이 target에 이 내용을 적용하라"만 알고 경로도 확장자도
 * 모른다 — 어느 target을 고를지가 라우팅이며, 그 선택이 여기서 일어난다.
 *
 * ## 세 개의 라우팅 키
 *
 * | 키 | 담는 것 | 소유자 |
 * |---|---|---|
 * | `states` | 경로 → 조정 상태 | 이 스토어 (리액티브 — 배너가 구독한다) |
 * | `effectHandlers` | 경로 → 적용 대상 | 패널의 조정 실행자 등록 |
 * | `openDocuments` | 열려 있는 경로 | 외부 변경 감시 배선 |
 *
 * **열린 문서가 아닌 경로의 이벤트는 폐기한다** — 리듀서를 호출하지 않고 Map
 * 항목도 만들지 않는다(REQ-PANEL-070). 그러지 않으면 열지도 않은 파일의 내용이
 * 현재 버퍼에 적용되고, 조정 상태는 정상 완료로 정착해 사용자가 알 수단이
 * 없다 — v0.2.31에 출하된 무성 데이터 손실 경로다.
 *
 * effect를 스토어가 직접 수행하지 않는 이유: 버퍼 적용은 최소 diff와 캐럿
 * 보존을 요구하므로 실행자 소관이고, diff 표면은 SPEC-4 소관이다. 여기서는
 * 핸들러를 등록받아 넘기기만 한다 — 아직 아무도 등록하지 않았다면 조용히 버린다.
 */

export type ReconciliationEffectHandler = (effect: ReconciliationEffect) => void;

/** 조합 게이트 하나의 식별자. 게이트가 스스로 만들어 들고 다닌다. */
export type CompositionGateToken = symbol;

/**
 * 문서로 라우팅되는 이벤트 — 조합 경계는 **제외된다**.
 *
 * 한 문서를 여러 편집 표면이 볼 수 있으므로 `composition-start` /
 * `composition-end`는 게이트별 합류(OR)를 거쳐야 한다(`design.md` §6.2b·§6.2c).
 * 리듀서의 `composition-end`가 `composing`을 **무조건** false로 만들기 때문에,
 * 합류를 건너뛰면 다른 표면의 조합 종료가 진행 중인 조합의 보류를 풀어 버린다
 * — REQ-PANEL-071이 닫는 결함이다. 타입에서 빼 두면 그 우회가 표현 불가능해진다.
 */
export type RoutedReconciliationEvent = Exclude<
  ReconciliationEvent,
  { type: 'composition-start' } | { type: 'composition-end' }
>;

/** 라우팅 키 2 — 경로 → 적용 대상. 리액티브할 이유가 없어 모듈 수준에 둔다. */
const effectHandlers = new Map<string, ReconciliationEffectHandler>();
/** 라우팅 키 3 — 경로 → 그 문서를 보고 있는 조합 게이트 집합 (OR 합류). */
const composingGates = new Map<string, Set<CompositionGateToken>>();
/** 열림 등록. 외부 변경 감시 배선이 소유한다. */
const openDocuments = new Set<string>();

interface ReconciliationStore {
  /** 라우팅 키 1 — 경로 → 조정 상태. 열린 문서에만 항목이 있다. */
  states: Map<string, ReconciliationState>;
  policy: ReconciliationPolicy;

  /** 그 경로의 조정 상태. 열린 문서가 아니면 null. */
  stateFor: (path: string | null) => ReconciliationState | null;
  /** 경로 → 상태 Map의 키 목록 (라우팅 키 관측용). */
  statePaths: () => string[];
  /** 경로 → 적용 대상 Map의 키 목록 (라우팅 키 관측용). */
  targetPaths: () => string[];

  /** 문서를 열림으로 등록한다. 경로가 없으면 아무것도 하지 않는다. */
  openDocument: (path: string | null) => void;
  /** 열림 등록을 해제한다. */
  closeDocument: (path: string | null) => void;
  /** 그 경로의 적용 대상을 등록·해제한다 (REQ-PANEL-055 / 070a / 070b). */
  setEffectHandlerFor: (path: string | null, handler: ReconciliationEffectHandler | null) => void;

  /** 이벤트를 그 문서의 기계에 넣고 산출된 effect를 그 문서의 실행자로 흘린다. */
  dispatchFor: (path: string | null, event: RoutedReconciliationEvent) => ReconciliationEffect[];
  /** 게이트 하나가 조합을 열었다. OR가 처음 참이 될 때만 기계에 알린다. */
  compositionStart: (path: string | null, gate: CompositionGateToken) => void;
  /** 게이트 하나가 조합을 닫았다. OR가 거짓으로 떨어질 때만 기계에 알린다. */
  compositionEnd: (path: string | null, gate: CompositionGateToken) => void;

  /** 조정 정책 교체 지점 (REQ-WS-029). SPEC-4의 승인 정책이 여기로 들어온다. */
  setPolicy: (policy: ReconciliationPolicy) => void;
  reset: () => void;
}

export const useReconciliationStore = create<ReconciliationStore>((set, get) => {
  /** 열림 등록과 적용 대상 등록 중 하나라도 있으면 그 경로는 열린 문서다. */
  const isOpen = (path: string): boolean => openDocuments.has(path) || effectHandlers.has(path);

  /** 등록 상태에 맞춰 상태 Map 항목을 세우거나 거둔다. */
  const syncOpenness = (path: string): void => {
    const states = get().states;
    if (isOpen(path)) {
      if (states.has(path)) return;
      set({ states: new Map(states).set(path, initialReconciliationState()) });
      return;
    }
    composingGates.delete(path);
    if (!states.has(path)) return;
    const next = new Map(states);
    next.delete(path);
    set({ states: next });
  };

  const route = (path: string, event: ReconciliationEvent): ReconciliationEffect[] => {
    const current = get().states.get(path);
    // 열린 문서가 아니면 **폐기**한다 — 리듀서를 호출하지 않고 Map 항목도
    // 만들지 않는다. 폐기가 어떤 전이도 일으키지 않는 것이 REQ-PANEL-070의
    // 세 번째 조항이며, 판정은 상태 값이 아니라 전이 발생으로 이루어진다.
    if (!current) return [];

    const result = reduceReconciliation(current, event, get().policy);
    if (result.state !== current) {
      set({ states: new Map(get().states).set(path, result.state) });
    }
    const handler = effectHandlers.get(path);
    for (const effect of result.effects) handler?.(effect);
    return result.effects;
  };

  return {
    states: new Map<string, ReconciliationState>(),
    policy: autoApplyPolicy,

    stateFor: (path) => (path === null ? null : (get().states.get(path) ?? null)),
    statePaths: () => [...get().states.keys()],
    targetPaths: () => [...effectHandlers.keys()],

    openDocument: (path) => {
      if (path === null) return;
      openDocuments.add(path);
      syncOpenness(path);
    },

    closeDocument: (path) => {
      if (path === null) return;
      openDocuments.delete(path);
      syncOpenness(path);
    },

    setEffectHandlerFor: (path, handler) => {
      // 경로 없는 문서(untitled)는 라우팅 키를 갖지 않는다 — null도 빈 문자열도
      // 키로 쓰지 않는다(REQ-PANEL-070b). 그러지 않으면 서로 다른 untitled
      // 문서가 같은 키를 공유한다.
      if (path === null) return;
      if (handler === null) effectHandlers.delete(path);
      else effectHandlers.set(path, handler);
      syncOpenness(path);
    },

    dispatchFor: (path, event) => (path === null ? [] : route(path, event)),

    compositionStart: (path, gate) => {
      if (path === null || !isOpen(path)) return;
      const gates = composingGates.get(path) ?? new Set<CompositionGateToken>();
      const wasIdle = gates.size === 0;
      gates.add(gate);
      composingGates.set(path, gates);
      if (wasIdle) route(path, { type: 'composition-start' });
    },

    compositionEnd: (path, gate) => {
      if (path === null) return;
      const gates = composingGates.get(path);
      if (!gates || !gates.delete(gate)) return;
      // 다른 게이트가 아직 조합 중이면 억제한다 — 그러지 않으면 이 표면의
      // 종료가 저 표면의 보류를 푼다(REQ-PANEL-071).
      if (gates.size > 0) return;
      composingGates.delete(path);
      route(path, { type: 'composition-end' });
    },

    setPolicy: (policy) => set({ policy }),

    reset: () => {
      effectHandlers.clear();
      composingGates.clear();
      openDocuments.clear();
      set({ states: new Map<string, ReconciliationState>(), policy: autoApplyPolicy });
    },
  };
});
