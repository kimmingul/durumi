import { describe, it, expect } from 'vitest';
import {
  initialReconciliationState,
  reduceReconciliation,
  noticeFor,
  autoApplyPolicy,
  bannerNotifyPolicy,
  NOTICE_PRESENTATIONS,
  type ConfirmedChange,
  type ReconciliationState,
  type ReconciliationPolicy,
  type ReconciliationEvent,
  type ReconciliationEffect,
} from '@shared/reconciliation';

const CHANGE: ConfirmedChange = {
  path: '/w/a.md',
  content: '# from disk\n',
  mtimeMs: 1000,
  size: 12,
};

const CHANGE2: ConfirmedChange = { ...CHANGE, content: '# newer\n', mtimeMs: 2000, size: 9 };

/** 이벤트 열을 순차 적용하고 최종 상태와 누적 effect를 돌려준다. */
function run(
  events: ReconciliationEvent[],
  opts: { policy?: ReconciliationPolicy; from?: ReconciliationState } = {},
): { state: ReconciliationState; effects: ReconciliationEffect[] } {
  let state = opts.from ?? initialReconciliationState();
  const effects: ReconciliationEffect[] = [];
  for (const ev of events) {
    const r = reduceReconciliation(state, ev, opts.policy ?? autoApplyPolicy);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}

const dirty = (isDirty: boolean): ReconciliationEvent => ({ type: 'dirty-changed', isDirty });
const change = (c: ConfirmedChange = CHANGE): ReconciliationEvent => ({ type: 'external-change', change: c });

describe('깨끗한 버퍼는 자동 반영된다 — REQ-WS-024 / AC-WS-025', () => {
  it('미저장 편집이 없으면 디스크 내용을 버퍼에 반영한다', () => {
    const { state, effects } = run([change()]);
    expect(effects).toEqual([{ kind: 'apply-to-buffer', content: '# from disk\n' }]);
    expect(state.status).toBe('idle');
    expect(state.pending).toBeNull();
  });

  it('자동 반영 후 알림 표면이 없다', () => {
    const { state } = run([change()]);
    expect(noticeFor(state)).toBeNull();
  });
});

describe('미저장 편집이 있으면 배너로 알린다 — REQ-WS-027 / AC-WS-029', () => {
  it('버퍼를 교체하지 않고 배너 상태로 들어간다', () => {
    const { state, effects } = run([dirty(true), change()]);
    expect(effects).toEqual([]);
    expect(state.status).toBe('held-notify');
    expect(state.pending).toEqual(CHANGE);
  });

  it('배너가 차이 보기와 디스크에서 불러오기 두 동작을 제공한다', () => {
    const { state } = run([dirty(true), change()]);
    const notice = noticeFor(state)!;
    expect(notice.presentation).toBe('banner');
    expect(notice.actions).toContain('view-diff');
    expect(notice.actions).toContain('load-from-disk');
  });

  it('배너가 해제 가능하다', () => {
    const { state } = run([dirty(true), change()]);
    expect(noticeFor(state)!.actions).toContain('dismiss');
  });

  it('차이 보기는 배너를 유지한 채 diff effect만 낸다', () => {
    const { state, effects } = run([dirty(true), change(), { type: 'user-view-diff' }]);
    expect(effects).toEqual([{ kind: 'open-diff', content: '# from disk\n' }]);
    expect(state.status).toBe('held-notify');
  });

  it('디스크에서 불러오기는 명시적 확인이므로 버퍼를 교체한다', () => {
    const { state, effects } = run([dirty(true), change(), { type: 'user-load-from-disk' }]);
    expect(effects).toEqual([{ kind: 'apply-to-buffer', content: '# from disk\n' }]);
    expect(state.status).toBe('idle');
  });
});

describe('미저장 편집은 조용히 사라지지 않는다 — REQ-WS-028 / AC-WS-030', () => {
  it('배너를 해제해도 버퍼 교체 effect가 없다', () => {
    const { state, effects } = run([dirty(true), change(), { type: 'user-dismiss' }]);
    expect(effects).toEqual([]);
    expect(state.status).toBe('idle');
    expect(state.pending).toBeNull();
  });

  it('배너를 무시하고 변경이 더 와도 버퍼 교체 effect가 없다', () => {
    const { effects } = run([dirty(true), change(), change(CHANGE2)]);
    expect(effects).toEqual([]);
  });

  it('정책이 apply를 반환해도 dirty면 기계가 교체를 거부한다', () => {
    // REQ-WS-028은 타협 불가다 — 정책이 버퍼 교체를 지시해도 미저장 편집이
    // 있으면 기계 수준에서 막는다. 정책은 이 불변식을 위반할 수 없다.
    const rogue: ReconciliationPolicy = { id: 'rogue-always-apply', decide: () => ({ kind: 'apply' }) };
    const { state, effects } = run([dirty(true), change()], { policy: rogue });
    expect(effects).toEqual([]);
    expect(state.status).toBe('held-notify');
  });
});

describe('IME 조합 중에는 보류한다 — REQ-WS-020, 021, 023 / AC-WS-023', () => {
  it('조합 중에는 버퍼를 건드리지 않고 보류 상태가 된다', () => {
    const { state, effects } = run([{ type: 'composition-start' }, change()]);
    expect(effects).toEqual([]);
    expect(state.status).toBe('held-composition');
  });

  it('보류 상태가 비침습적으로 표시된다 (포커스를 요구하지 않는 status 표면)', () => {
    const { state } = run([{ type: 'composition-start' }, change()]);
    const notice = noticeFor(state)!;
    expect(notice.presentation).toBe('status');
    expect(notice.actions).toEqual([]);
  });

  it('조합 종료 시 보류된 조정이 적용된다', () => {
    const { state, effects } = run([
      { type: 'composition-start' },
      change(),
      { type: 'composition-end' },
    ]);
    expect(effects).toEqual([{ kind: 'apply-to-buffer', content: '# from disk\n' }]);
    expect(state.status).toBe('idle');
  });

  it('보류 중 복수 변경은 최종 상태 1회만 적용된다', () => {
    const { effects } = run([
      { type: 'composition-start' },
      change(),
      change(CHANGE2),
      change({ ...CHANGE, content: '# final\n', mtimeMs: 3000 }),
      { type: 'composition-end' },
    ]);
    expect(effects).toEqual([{ kind: 'apply-to-buffer', content: '# final\n' }]);
  });

  it('조합 종료 시 미저장 편집이 있으면 적용 대신 배너로 간다', () => {
    const { state, effects } = run([
      dirty(true),
      { type: 'composition-start' },
      change(),
      { type: 'composition-end' },
    ]);
    expect(effects).toEqual([]);
    expect(state.status).toBe('held-notify');
  });

  it('보류 표시는 정책 결과로 인계된다 — 무성 소실 경로가 없다 (AC-WS-023c)', () => {
    // 금지 상태: 보류가 풀렸는데 배너도 없고 버퍼도 그대로. 사용자가 외부
    // 변경이 취소된 것으로 오해한다. 세 정책 분기 전부에서 확인한다.
    const cases: Array<[string, ReconciliationPolicy, boolean]> = [
      ['clean/auto', autoApplyPolicy, false],
      ['dirty/auto', autoApplyPolicy, true],
      ['banner', bannerNotifyPolicy, false],
    ];
    for (const [label, policy, isDirty] of cases) {
      const events: ReconciliationEvent[] = [dirty(isDirty), { type: 'composition-start' }, change()];
      const held = run(events, { policy });
      expect(held.state.status, `${label}: 보류 표시가 뜨지 않았다`).toBe('held-composition');
      expect(noticeFor(held.state)).not.toBeNull();

      const after = run([{ type: 'composition-end' }], { policy, from: held.state });
      const hasSurface = noticeFor(after.state) !== null;
      const bufferChanged = after.effects.some((e) => e.kind === 'apply-to-buffer');
      expect(
        hasSurface || bufferChanged,
        `${label}: 보류 표시가 후속 표면 없이 사라졌다 (무성 소실)`,
      ).toBe(true);
    }
  });

  it('게이트는 라우팅을 지연시킬 뿐 결과를 결정하지 않는다 (REQ-WS-021 불변식)', () => {
    // 같은 게이트를 통과한 두 시나리오가 dirty 여부로만 갈린다.
    const viaGate = (isDirty: boolean) =>
      run([dirty(isDirty), { type: 'composition-start' }, change(), { type: 'composition-end' }]);
    const direct = (isDirty: boolean) => run([dirty(isDirty), change()]);

    for (const isDirty of [false, true]) {
      const g = viaGate(isDirty);
      const d = direct(isDirty);
      expect(g.state.status, `dirty=${isDirty}: 게이트가 결과를 바꿨다`).toBe(d.state.status);
      expect(g.effects.map((e) => e.kind)).toEqual(d.effects.map((e) => e.kind));
    }
  });

  it('보류할 변경이 없으면 조합 종료는 무해하다', () => {
    const { state, effects } = run([{ type: 'composition-start' }, { type: 'composition-end' }]);
    expect(effects).toEqual([]);
    expect(state.status).toBe('idle');
  });
});

describe('파일 삭제 시 버퍼가 보존된다 — REQ-WS-030 / AC-WS-031', () => {
  it('버퍼를 비우지 않고 사라짐 상태를 표시한다', () => {
    const { state, effects } = run([{ type: 'external-delete', path: '/w/a.md' }]);
    expect(effects).toEqual([]);
    expect(state.status).toBe('missing');
    expect(noticeFor(state)!.presentation).toBe('status');
  });

  it('사라짐 상태는 해제 대상이 아니다 (현실 반영이지 알림이 아니다)', () => {
    const after = run([{ type: 'external-delete', path: '/w/a.md' }, { type: 'user-dismiss' }]);
    expect(after.state.status).toBe('missing');
    expect(noticeFor(after.state)!.actions).not.toContain('dismiss');
  });

  it('해제 동작이 두 표면에서 반대로 작동한다 (AC-WS-031b)', () => {
    // 같은 검사 안에서 대조하는 것이 요점이다. 따로 두면 한쪽이 조용히
    // 다른 쪽을 닮아가도 둘 다 통과한다.
    //
    // 배너(REQ-WS-027)는 "이런 일이 있었다"는 알림이므로 해제된다.
    // 상태 표시(REQ-WS-030)는 "지금 이렇다"는 디스크의 사실이므로 해제되지
    // 않는다 — 해제 가능하면 파일이 없는데 있는 것처럼 보여 사용자가
    // 저장 가능 여부를 오판한다.
    const missing = run([
      { type: 'external-delete', path: '/w/a.md' },
      { type: 'user-dismiss' },
    ]);
    expect(missing.state.status, '사라짐 표시는 해제되지 않는다').toBe('missing');
    expect(noticeFor(missing.state)!.actions).not.toContain('dismiss');

    const banner = run([dirty(true), change(), { type: 'user-dismiss' }]);
    expect(banner.state.status, '배너는 해제된다').toBe('idle');
    expect(noticeFor(banner.state)).toBeNull();

    // 대조가 성립하려면 두 상태가 애초에 서로 달라야 한다.
    expect(missing.state.status).not.toBe(banner.state.status);
  });

  it('저장·재로드로 동기화되면 사라짐 상태가 풀린다', () => {
    const { state } = run([{ type: 'external-delete', path: '/w/a.md' }, { type: 'document-synced' }]);
    expect(state.status).toBe('idle');
  });
});

describe('디코드 불가 내용은 버퍼를 덮어쓰지 않는다 — REQ-WS-031 / AC-WS-032', () => {
  it('조정을 중단하고 사용자에게 보고한다', () => {
    const { state, effects } = run([
      { type: 'decode-error', path: '/w/a.md', message: 'invalid utf-8 at byte 12' },
    ]);
    expect(effects).toEqual([]);
    expect(state.status).toBe('decode-error');
    expect(state.errorMessage).toBe('invalid utf-8 at byte 12');
    expect(noticeFor(state)!.detail).toBe('invalid utf-8 at byte 12');
  });

  it('보류 중이던 변경을 적용하지 않는다', () => {
    const { effects } = run([
      dirty(true),
      change(),
      { type: 'decode-error', path: '/w/a.md', message: 'bad' },
      { type: 'user-load-from-disk' },
    ]);
    expect(effects).toEqual([]);
  });
});

describe('조정 정책은 교체 가능하다 — REQ-WS-029 / AC-WS-033', () => {
  it('자동 반영 정책과 배너 알림 정책이 모두 존재한다', () => {
    expect(autoApplyPolicy.id).toBeTruthy();
    expect(bannerNotifyPolicy.id).toBeTruthy();
    expect(autoApplyPolicy.id).not.toBe(bannerNotifyPolicy.id);
  });

  it('배너 알림 정책은 깨끗한 버퍼에서도 자동 반영하지 않는다', () => {
    const { state, effects } = run([change()], { policy: bannerNotifyPolicy });
    expect(effects).toEqual([]);
    expect(state.status).toBe('held-notify');
  });

  it('제3의 승인 대기 정책을 주입할 수 있다', () => {
    const approvalQueue: ReconciliationPolicy = {
      id: 'test-approval-queue',
      decide: () => ({ kind: 'defer', reason: 'awaiting reviewer' }),
    };
    const { state, effects } = run([change()], { policy: approvalQueue });
    expect(effects).toEqual([]);
    expect(state.status).toBe('held-approval');
    expect(state.deferReason).toBe('awaiting reviewer');
    expect(state.pending).toEqual(CHANGE);
  });

  it('정책은 확정 이벤트와 dirty 상태를 함께 본다', () => {
    const seen: { isDirty: boolean; path: string }[] = [];
    const spy: ReconciliationPolicy = {
      id: 'spy',
      decide: (ctx) => {
        seen.push({ isDirty: ctx.isDirty, path: ctx.change.path });
        return { kind: 'notify' };
      },
    };
    run([dirty(true), change()], { policy: spy });
    expect(seen).toEqual([{ isDirty: true, path: '/w/a.md' }]);
  });
});

describe('모달 금지는 구조적이다 — REQ-WS-049 / AC-WS-060', () => {
  it('표면 종류에 modal 변형이 존재하지 않는다', () => {
    // 타입 수준에서 모달을 표현할 수 없다. 새 표면을 추가하려면 이 배열과
    // 렌더러를 함께 고쳐야 하고, 그 순간 이 단언이 깨진다.
    expect([...NOTICE_PRESENTATIONS]).toEqual(['banner', 'status']);
  });

  it('모든 상태의 알림이 banner 또는 status만 사용한다', () => {
    const states: ReconciliationState[] = [
      run([dirty(true), change()]).state,
      run([{ type: 'composition-start' }, change()]).state,
      run([{ type: 'external-delete', path: '/w/a.md' }]).state,
      run([{ type: 'decode-error', path: '/w/a.md', message: 'x' }]).state,
      run([change()], { policy: { id: 'q', decide: () => ({ kind: 'defer', reason: 'r' }) } }).state,
    ];
    for (const s of states) {
      const n = noticeFor(s);
      expect(n, s.status).not.toBeNull();
      expect(NOTICE_PRESENTATIONS).toContain(n!.presentation);
    }
  });
});

describe('상태 기계 일반 성질', () => {
  it('reduce는 입력 상태를 변형하지 않는다', () => {
    const before = initialReconciliationState();
    const snapshot = JSON.parse(JSON.stringify(before));
    reduceReconciliation(before, change(), autoApplyPolicy);
    expect(before).toEqual(snapshot);
  });

  it('idle 상태에는 알림이 없다', () => {
    expect(noticeFor(initialReconciliationState())).toBeNull();
  });

  it('document-synced는 어떤 상태에서도 idle로 되돌린다', () => {
    const froms: ReconciliationState[] = [
      run([dirty(true), change()]).state,
      run([{ type: 'composition-start' }, change()]).state,
      run([{ type: 'decode-error', path: 'p', message: 'm' }]).state,
    ];
    for (const from of froms) {
      const { state } = run([{ type: 'document-synced' }], { from });
      expect(state.status, from.status).toBe('idle');
      expect(state.pending).toBeNull();
    }
  });
});
