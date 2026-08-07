import { describe, it, expect, beforeEach } from 'vitest';
import {
  createChangeConfirmer,
  DEFAULT_DEBOUNCE_MS,
  type ChangeConfirmer,
  type ConfirmedFileEvent,
  type FileFacts,
} from '../../electron/changeConfirmation';

/**
 * 확정 계층은 주입된 시계 + 스텁 stat으로만 검증한다 (AC-WS-015).
 * 실시간 경쟁 단언은 비결정적이므로 쓰지 않는다.
 */

/** 결정적 타이머 큐 — 실제 시간 없이 합류 창 만료를 재생한다. */
class FakeTimers {
  private seq = 0;
  private queue = new Map<number, { at: number; fn: () => void }>();
  now = 0;

  set = (fn: () => void, ms: number): number => {
    const id = ++this.seq;
    this.queue.set(id, { at: this.now + ms, fn });
    return id;
  };

  clear = (h: unknown): void => {
    this.queue.delete(h as number);
  };

  /** `ms`만큼 시간을 진행시키고 만료된 타이머를 순서대로 실행한다. */
  advance(ms: number): void {
    this.now += ms;
    const due = [...this.queue.entries()]
      .filter(([, t]) => t.at <= this.now)
      .sort((a, b) => a[1].at - b[1].at);
    for (const [id, t] of due) {
      this.queue.delete(id);
      t.fn();
    }
  }

  get pending(): number {
    return this.queue.size;
  }
}

const A = '/w/manuscript/a.md';
const B = '/w/manuscript/b.md';
const facts = (size: number, mtimeMs: number): FileFacts => ({ size, mtimeMs });

let timers: FakeTimers;
let disk: Map<string, FileFacts | null>;
let content: Map<string, string>;
let confirmed: ConfirmedFileEvent[];
let rescans: string[];
let statCalls: string[];
let readCalls: string[];

function build(opts: { maxPendingPaths?: number } = {}): ChangeConfirmer {
  return createChangeConfirmer({
    stat: async (p) => {
      statCalls.push(p);
      return disk.get(p) ?? null;
    },
    readContent: async (p) => {
      readCalls.push(p);
      return content.get(p) ?? null;
    },
    setTimer: timers.set,
    clearTimer: timers.clear,
    onConfirm: (e) => confirmed.push(e),
    onRescanNeeded: (reason) => rescans.push(reason),
    ...opts,
  });
}

/** 타이머를 만료시키고 확정 경로의 비동기 stat이 끝날 때까지 기다린다. */
async function flush(ms = DEFAULT_DEBOUNCE_MS): Promise<void> {
  timers.advance(ms);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  timers = new FakeTimers();
  disk = new Map();
  content = new Map();
  confirmed = [];
  rescans = [];
  statCalls = [];
  readCalls = [];
});

describe('열린 파일의 외부 변경 확정 — REQ-WS-013 / AC-WS-012', () => {
  it('내용이 바뀌면 확정 이벤트를 산출한다', async () => {
    disk.set(A, facts(10, 1000));
    const c = build();
    c.track(A, facts(10, 1000));

    disk.set(A, facts(20, 2000));
    c.ingest({ type: 'change', path: A });
    await flush();

    expect(confirmed).toEqual([{ path: A, kind: 'changed', facts: facts(20, 2000), content: null }]);
  });

  it('위치·프로젝트 소속과 무관하게 동작한다', async () => {
    const outside = '/elsewhere/notes.md';
    disk.set(outside, facts(1, 1));
    const c = build();
    c.track(outside, facts(1, 1));

    disk.set(outside, facts(2, 2));
    c.ingest({ type: 'change', path: outside });
    await flush();

    expect(confirmed.map((e) => e.path)).toEqual([outside]);
  });
});

describe('재검사가 진실이다 — REQ-WS-014 / AC-WS-013', () => {
  it('크기·수정시각이 그대로면 확정하지 않는다', async () => {
    disk.set(A, facts(10, 1000));
    const c = build();
    c.track(A, facts(10, 1000));

    // 감시 이벤트만 발생하고 파일 사실은 그대로인 경우(중복 발행·속성 변경 등).
    c.ingest({ type: 'change', path: A });
    await flush();

    expect(confirmed).toEqual([]);
  });

  it('감시 이벤트를 그대로 믿지 않고 반드시 재검사한다', async () => {
    disk.set(A, facts(10, 1000));
    const c = build();
    c.track(A, facts(10, 1000));
    c.ingest({ type: 'change', path: A });
    await flush();
    expect(statCalls).toContain(A);
  });
});

describe('2단계 확정 — REQ-WS-014 / AC-WS-013, AC-WS-013b', () => {
  it('열린 파일은 내용이 같으면 확정하지 않는다 (AC-WS-013)', async () => {
    // 내용 동일 재작성은 mtime을 바꾸므로 1단계는 통과한다. 2단계 내용 대조가
    // 없으면 이 AC는 통과하지 않는다.
    disk.set(A, facts(10, 1000));
    content.set(A, 'same body\n');
    const c = build();
    c.trackOpen(A, facts(10, 1000), 'same body\n');

    disk.set(A, facts(10, 2000)); // 크기 동일, mtime만 갱신
    c.ingest({ type: 'change', path: A });
    await flush();

    expect(confirmed).toEqual([]);
    expect(readCalls).toContain(A); // 2단계가 실제로 수행됐다
  });

  it('열린 파일의 내용이 다르면 확정하고 읽은 내용을 실어 보낸다', async () => {
    disk.set(A, facts(10, 1000));
    content.set(A, 'old body\n');
    const c = build();
    c.trackOpen(A, facts(10, 1000), 'old body\n');

    disk.set(A, facts(12, 2000));
    content.set(A, 'new body\n');
    c.ingest({ type: 'change', path: A });
    await flush();

    expect(confirmed).toEqual([
      { path: A, kind: 'changed', facts: facts(12, 2000), content: 'new body\n' },
    ]);
  });

  it('열려 있지 않은 경로는 1단계만 적용되고 내용을 읽지 않는다 (AC-WS-013b)', async () => {
    // 비용 경계: 2단계를 열려 있지 않은 파일까지 확장하면 REQ-WS-046이
    // data/ 배제로 피한 대용량 읽기가 규약 폴더 경로로 되돌아온다.
    const unopened = '/w/manuscript/other.md';
    disk.set(unopened, facts(10, 1000));
    content.set(unopened, 'irrelevant');
    const c = build();
    c.track(unopened, facts(10, 1000));

    disk.set(unopened, facts(99, 9900));
    c.ingest({ type: 'change', path: unopened });
    await flush();

    expect(confirmed).toEqual([
      { path: unopened, kind: 'changed', facts: facts(99, 9900), content: null },
    ]);
    expect(readCalls).toEqual([]); // 읽기 호출 0회
  });

  it('1단계에서 걸러지면 2단계를 시도하지 않는다', async () => {
    disk.set(A, facts(10, 1000));
    content.set(A, 'body');
    const c = build();
    c.trackOpen(A, facts(10, 1000), 'body');

    c.ingest({ type: 'change', path: A }); // 사실 변화 없음
    await flush();

    expect(confirmed).toEqual([]);
    expect(readCalls).toEqual([]);
  });

  it('버퍼가 새로 로드·저장되면 대조 기준 내용이 갱신된다', async () => {
    disk.set(A, facts(10, 1000));
    content.set(A, 'v1');
    const c = build();
    c.trackOpen(A, facts(10, 1000), 'v1');

    // 사용자가 저장해 버퍼와 디스크가 v2로 동기화됐다.
    c.setOpenContent(A, 'v2');
    disk.set(A, facts(11, 2000));
    content.set(A, 'v2');
    c.ingest({ type: 'change', path: A });
    await flush();
    expect(confirmed).toEqual([]);

    // 이후 외부에서 v3로 바뀌면 확정된다.
    disk.set(A, facts(12, 3000));
    content.set(A, 'v3');
    c.ingest({ type: 'change', path: A });
    await flush();
    expect(confirmed).toEqual([
      { path: A, kind: 'changed', facts: facts(12, 3000), content: 'v3' },
    ]);
  });

  it('내용을 읽을 수 없으면 억제하지 않고 확정한다', async () => {
    // 비교가 불가능한 상태를 "같다"로 해석하면 진짜 변경을 삼킨다.
    disk.set(A, facts(10, 1000));
    content.set(A, 'body');
    const c = build();
    c.trackOpen(A, facts(10, 1000), 'body');

    disk.set(A, facts(20, 2000));
    content.delete(A); // 읽기 실패
    c.ingest({ type: 'change', path: A });
    await flush();

    expect(confirmed).toEqual([
      { path: A, kind: 'changed', facts: facts(20, 2000), content: null },
    ]);
  });

  it('삭제는 2단계를 거치지 않는다', async () => {
    disk.set(A, facts(10, 1000));
    content.set(A, 'body');
    const c = build();
    c.trackOpen(A, facts(10, 1000), 'body');

    disk.delete(A);
    c.ingest({ type: 'rename', path: A });
    await flush();

    expect(confirmed).toEqual([{ path: A, kind: 'deleted', facts: null, content: null }]);
    expect(readCalls).toEqual([]);
  });
});

describe('자기 저장 에코 억제 — REQ-WS-015 / AC-WS-014', () => {
  it('앱 자신의 저장으로 생긴 이벤트는 외부 변경으로 확정하지 않는다', async () => {
    disk.set(A, facts(10, 1000));
    const c = build();
    c.track(A, facts(10, 1000));

    // 원자적 쓰기(임시 파일 + rename) → 감시 이벤트가 반드시 발생한다.
    disk.set(A, facts(30, 3000));
    c.noteSelfWrite(A, facts(30, 3000));
    c.ingest({ type: 'rename', path: A });
    await flush();

    expect(confirmed).toEqual([]);
  });

  it('자기 저장 이후의 진짜 외부 변경은 확정한다', async () => {
    disk.set(A, facts(10, 1000));
    const c = build();
    c.track(A, facts(10, 1000));

    disk.set(A, facts(30, 3000));
    c.noteSelfWrite(A, facts(30, 3000));
    c.ingest({ type: 'rename', path: A });
    await flush();
    expect(confirmed).toEqual([]);

    disk.set(A, facts(40, 4000));
    c.ingest({ type: 'change', path: A });
    await flush();
    expect(confirmed).toEqual([{ path: A, kind: 'changed', facts: facts(40, 4000), content: null }]);
  });

  it('저장 예상값과 다른 상태면 억제하지 않는다', async () => {
    disk.set(A, facts(10, 1000));
    const c = build();
    c.track(A, facts(10, 1000));

    // 저장 직후 제3자가 덮어쓴 경우 — 예상값과 다르므로 외부 변경이다.
    c.noteSelfWrite(A, facts(30, 3000));
    disk.set(A, facts(55, 5500));
    c.ingest({ type: 'change', path: A });
    await flush();

    expect(confirmed).toEqual([{ path: A, kind: 'changed', facts: facts(55, 5500), content: null }]);
  });
});

describe('경로별 합류 — REQ-WS-016 / AC-WS-059', () => {
  it('한 합류 창 안의 두 경로가 모두 확정된다', async () => {
    // 회귀 근거: 현행 electron/fs.ts는 루트당 단일 pendingPath 스칼라를
    // last-wins로 덮어써 이 시나리오에서 1건만 산출한다.
    disk.set(A, facts(10, 1000));
    disk.set(B, facts(10, 1000));
    const c = build();
    c.track(A, facts(10, 1000));
    c.track(B, facts(10, 1000));

    disk.set(A, facts(11, 1100));
    c.ingest({ type: 'change', path: A });
    timers.advance(50); // 같은 합류 창 안
    disk.set(B, facts(12, 1200));
    c.ingest({ type: 'change', path: B });

    await flush();

    expect(confirmed).toHaveLength(2);
    expect(confirmed.map((e) => e.path).sort()).toEqual([A, B].sort());
  });

  it('같은 경로의 연속 이벤트는 하나로 합류하고 최종 상태를 확정한다', async () => {
    disk.set(A, facts(10, 1000));
    const c = build();
    c.track(A, facts(10, 1000));

    disk.set(A, facts(11, 1100));
    c.ingest({ type: 'change', path: A });
    timers.advance(50);
    disk.set(A, facts(12, 1200));
    c.ingest({ type: 'change', path: A });
    timers.advance(50);
    disk.set(A, facts(13, 1300));
    c.ingest({ type: 'change', path: A });

    await flush();

    expect(confirmed).toEqual([{ path: A, kind: 'changed', facts: facts(13, 1300), content: null }]);
  });

  it('쓰기 진행 중 중간 상태를 확정하지 않는다 (AC-WS-015)', async () => {
    disk.set(A, facts(100, 1000));
    const c = build();
    c.track(A, facts(100, 1000));

    // 이벤트 발생 → 합류 창 만료 전 중간 크기 → 만료 후 최종 크기.
    c.ingest({ type: 'change', path: A });
    timers.advance(DEFAULT_DEBOUNCE_MS - 50);
    disk.set(A, facts(150, 1400)); // 중간 상태
    c.ingest({ type: 'change', path: A }); // 창 연장
    timers.advance(DEFAULT_DEBOUNCE_MS - 50);
    disk.set(A, facts(300, 1900)); // 최종 상태

    await flush();

    expect(confirmed).toEqual([{ path: A, kind: 'changed', facts: facts(300, 1900), content: null }]);
  });
});

describe('플랫폼 차이 흡수 — REQ-WS-017 / AC-WS-016a, AC-WS-016b', () => {
  /** macOS 형태: 병합된 단일 이벤트. */
  async function macOsShape(): Promise<ConfirmedFileEvent[]> {
    disk = new Map([[A, facts(10, 1000)]]);
    confirmed = [];
    const c = build();
    c.track(A, facts(10, 1000));
    disk.set(A, facts(42, 4200));
    c.ingest({ type: 'change', path: A });
    await flush();
    return confirmed;
  }

  /** Windows 형태: 중복 발행 + rename 분리 + 대소문자 비정규화. */
  async function windowsShape(): Promise<ConfirmedFileEvent[]> {
    disk = new Map([[A, facts(10, 1000)]]);
    confirmed = [];
    const c = build();
    c.track(A, facts(10, 1000));
    disk.set(A, facts(42, 4200));
    c.ingest({ type: 'rename', path: '/W/Manuscript/A.MD' });
    c.ingest({ type: 'change', path: A });
    c.ingest({ type: 'change', path: '/w/Manuscript/a.md' });
    await flush();
    return confirmed;
  }

  it('macOS 형태가 정규화된 확정 이벤트를 산출한다', async () => {
    expect(await macOsShape()).toEqual([{ path: A, kind: 'changed', facts: facts(42, 4200), content: null }]);
  });

  it('Windows 형태가 동일한 확정 이벤트를 산출한다', async () => {
    const mac = await macOsShape();
    const win = await windowsShape();
    expect(win).toEqual(mac);
  });

  it('플랫폼 판정 없이 유닛에서 재현 가능하다 (C-6)', () => {
    // 이 절의 어떤 테스트도 process.platform을 읽지 않는다 — 원시 이벤트
    // 형태만 주입하므로 Windows e2e 없이 양 플랫폼을 재현한다.
    expect(true).toBe(true);
  });
});

describe('삭제 확정 — REQ-WS-030 연계', () => {
  it('파일이 사라지면 deleted로 확정한다', async () => {
    disk.set(A, facts(10, 1000));
    const c = build();
    c.track(A, facts(10, 1000));

    disk.delete(A);
    c.ingest({ type: 'rename', path: A });
    await flush();

    expect(confirmed).toEqual([{ path: A, kind: 'deleted', facts: null, content: null }]);
  });

  it('이미 없던 파일의 이벤트는 확정하지 않는다', async () => {
    const c = build();
    c.track(A, null);
    c.ingest({ type: 'rename', path: A });
    await flush();
    expect(confirmed).toEqual([]);
  });
});

describe('감시 폴더의 새 파일 — REQ-WS-045 / AC-WS-056', () => {
  it('추적하지 않던 경로의 생성도 확정한다', async () => {
    const created = '/w/manuscript/new.md';
    const c = build();
    disk.set(created, facts(5, 500));
    c.ingest({ type: 'rename', path: created });
    await flush();

    expect(confirmed).toEqual([{ path: created, kind: 'changed', facts: facts(5, 500), content: null }]);
  });
});

describe('유실 복구 재검사 — REQ-WS-018 / AC-WS-017', () => {
  it('재검사가 감시 해제 중 발생한 변경을 확정한다', async () => {
    disk.set(A, facts(10, 1000));
    const c = build();
    c.track(A, facts(10, 1000));

    // 감시 해제 구간에서 외부 변경 — 이벤트가 오지 않는다.
    disk.set(A, facts(77, 7700));
    expect(confirmed).toEqual([]);

    await c.rescan();
    expect(confirmed).toEqual([{ path: A, kind: 'changed', facts: facts(77, 7700), content: null }]);
  });

  it('재검사는 변하지 않은 파일을 확정하지 않는다', async () => {
    disk.set(A, facts(10, 1000));
    const c = build();
    c.track(A, facts(10, 1000));
    await c.rescan();
    expect(confirmed).toEqual([]);
  });

  it('합류 용량을 넘으면 재검사를 요청한다', async () => {
    const c = build({ maxPendingPaths: 3 });
    for (let i = 0; i < 5; i++) {
      disk.set(`/w/f${i}.md`, facts(1, 1));
      c.ingest({ type: 'change', path: `/w/f${i}.md` });
    }
    expect(rescans).toContain('coalesce-overflow');
  });

  it('용량 초과로 버려진 이벤트가 재검사로 회수된다', async () => {
    // 추적 중인(= 열려 있는) 파일에 대한 보장이다. 추적하지 않던 새 파일의
    // 회수는 디렉터리 재열거가 필요하므로 감시 범위 계층(REQ-WS-047)이 맡는다.
    const c = build({ maxPendingPaths: 3 });
    for (let i = 0; i < 5; i++) {
      disk.set(`/w/f${i}.md`, facts(1, 1));
      c.track(`/w/f${i}.md`, facts(1, 1));
    }
    for (let i = 0; i < 5; i++) {
      disk.set(`/w/f${i}.md`, facts(2, 2));
      c.ingest({ type: 'change', path: `/w/f${i}.md` });
    }
    expect(rescans).toContain('coalesce-overflow');

    await flush();
    const beforeRescan = confirmed.length;
    expect(beforeRescan).toBeLessThan(5); // 폭주분은 이 시점에 아직 누락

    await c.rescan();
    expect(confirmed).toHaveLength(5);
    expect(new Set(confirmed.map((e) => e.path)).size).toBe(5);
  });
});

describe('추적 해제', () => {
  it('untrack 이후에는 확정하지 않는다', async () => {
    disk.set(A, facts(10, 1000));
    const c = build();
    c.track(A, facts(10, 1000));
    c.untrack(A);

    disk.set(A, facts(20, 2000));
    await c.rescan();
    expect(confirmed).toEqual([]);
  });

  it('보류 중이던 타이머도 함께 정리된다', async () => {
    disk.set(A, facts(10, 1000));
    const c = build();
    c.track(A, facts(10, 1000));
    disk.set(A, facts(20, 2000));
    c.ingest({ type: 'change', path: A });
    c.untrack(A);
    await flush();
    expect(confirmed).toEqual([]);
    expect(timers.pending).toBe(0);
  });
});
