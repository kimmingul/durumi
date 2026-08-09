import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EditorState, type Transaction } from '@codemirror/state';
import { bannerNotifyPolicy, type ReconciliationPolicy } from '@shared/reconciliation';
import { attachExternalChangeChannel } from '../../src/store/externalChangeChannel';
import { useReconciliationStore } from '../../src/store/reconciliationStore';
import { registerReconciliationExecutor } from '../../src/editor/applyExternalChange';
import type { ExternalFileChange } from '@shared/ipc-contract';

/**
 * SPEC-V03-WORKSPACE-002 M3 — 조정 계층의 **문서 축**.
 *
 * 대상 AC: AC-PANEL-051 / 052 / 055 / 055b / 056.
 *
 * ## 대체하는 것은 둘뿐이다
 *
 * preload 브리지(`onExternalFileChange`)와 `DispatchTarget`
 * (`src/editor/applyExternalChange.ts:63-67`이 테스트 seam으로 선언한 인터페이스).
 * 채널·스토어·실행자·상태 기계는 **실제 모듈**을 쓴다 — 그러지 않으면 결함이
 * 사는 지점을 우회한다. 특히 AC-PANEL-055 계열은 `registerReconciliationExecutor`
 * 자신이 결함의 무대였으므로 그 함수를 반드시 실물로 통과해야 한다.
 *
 * ## 왜 뷰가 아니라 유닛인가
 *
 * M3의 밀폐 범위는 상태 기계·라우팅·감시 등록이다(plan.md §C M3). 패널별 배너
 * 표면과 IME 게이트 합류는 편집 표면과 조합 관찰을 요구하므로 M4로 미뤄져 있다.
 */

const store = () => useReconciliationStore.getState();

// ---------------------------------------------------------------------------
// preload 브리지 대체 — main의 broadcast가 이 창에 전달하는 확정 이벤트.
// ---------------------------------------------------------------------------

let subscribers: Array<(c: ExternalFileChange) => void>;
let detachChannel: (() => void) | null = null;

const fakeApi = {
  onExternalFileChange(cb: (c: ExternalFileChange) => void) {
    subscribers.push(cb);
    return () => {
      subscribers = subscribers.filter((s) => s !== cb);
    };
  },
};

const emit = (path: string, content: string): void => {
  const change: ExternalFileChange = {
    path,
    kind: 'changed',
    content,
    decodeError: null,
    size: content.length,
    mtimeMs: 1,
  };
  for (const s of subscribers) s(change);
};

// ---------------------------------------------------------------------------
// 패널 하나 — 실제 실행자를 통과한다.
// ---------------------------------------------------------------------------

interface Panel {
  /** 이 패널의 버퍼 내용. */
  text: () => string;
  /** 이 패널의 실행자에 도달한 `apply-to-buffer` 내용 목록. */
  applies: string[];
  /** 패널 언마운트 — 실행자 등록을 거둔다. */
  unmount: () => void;
}

/** 경로를 갖고 준비까지 마친 패널을 연다. */
function openPanel(path: string, initial: string): Panel {
  let docState = EditorState.create({ doc: initial });
  const target = {
    get state() {
      return docState;
    },
    dispatch(tr: Transaction) {
      docState = tr.state;
    },
  };

  const applies: string[] = [];
  const detach = registerReconciliationExecutor(target, (h) => {
    if (h === null) {
      store().setEffectHandlerFor(path, null);
      return;
    }
    store().setEffectHandlerFor(path, (effect) => {
      if (effect.kind === 'apply-to-buffer') applies.push(effect.content);
      h(effect);
    });
  });

  return {
    text: () => docState.doc.toString(),
    applies,
    unmount: detach,
  };
}

/** 그 문서에 미저장 편집이 있음을 조정 계층에 알린다. */
const markDirty = (path: string): void => {
  store().dispatchFor(path, { type: 'dirty-changed', isDirty: true });
};

beforeEach(() => {
  subscribers = [];
  store().reset();
  detachChannel = attachExternalChangeChannel(fakeApi);
});

afterEach(() => {
  detachChannel?.();
  detachChannel = null;
  store().reset();
});

// ---------------------------------------------------------------------------

describe('AC-PANEL-051 — 확정 이벤트가 경로에 해당하는 문서로만 라우팅된다', () => {
  it('a.md의 확정 변경이 a.md에만 적용되고 b.md의 버퍼는 바이트 단위로 동일하다', () => {
    const a = openPanel('/w/a.md', 'A의 내용\n');
    const b = openPanel('/w/b.md', 'B의 내용\n');

    // 판정은 **깨끗한** 두 문서에서 한다 — dirty로 막으면 라우팅이 아니라
    // 미저장 편집 보호가 통과시키는 것이라 판별력이 없다.
    expect(store().stateFor('/w/a.md')?.isDirty).toBe(false);
    expect(store().stateFor('/w/b.md')?.isDirty).toBe(false);

    emit('/w/a.md', '디스크의 A\n');

    expect(a.text()).toBe('디스크의 A\n');
    expect(b.text(), 'a.md의 변경이 b.md 버퍼에 적용됐다').toBe('B의 내용\n');
    expect(b.applies, 'b.md의 실행자에 effect가 도달했다').toEqual([]);

    a.unmount();
    b.unmount();
  });

  it('열려 있지 않은 경로의 확정 이벤트는 어떤 버퍼도 바꾸지 않는다', () => {
    const a = openPanel('/w/a.md', 'A의 내용\n');
    const b = openPanel('/w/b.md', 'B의 내용\n');

    emit('/w/z.md', '열지 않은 문서의 내용\n');

    expect(a.text()).toBe('A의 내용\n');
    expect(b.text()).toBe('B의 내용\n');
    expect([...a.applies, ...b.applies]).toEqual([]);
    expect(store().statePaths(), '열지 않은 경로에 상태가 생겼다').not.toContain('/w/z.md');

    a.unmount();
    b.unmount();
  });

  it('경로 대조가 라우팅에 실제로 쓰인다 — Windows 표기 차이를 흡수한다', () => {
    // AC-PANEL-051b는 순수 함수를 판정한다. 이 단언은 그 함수가 **라우팅에서
    // 실제로 쓰이는지**를 본다 — 쓰이지 않으면 추출이 장식이고, main이 보낸
    // `\` 표기가 렌더러가 연 `/` 표기와 어긋나 Windows에서 조정이 통째로 죽는다.
    const win = openPanel('C:/w/a.md', 'A의 내용\n');

    emit('C:\\W\\A.MD', '디스크의 A\n');

    expect(win.text(), 'Windows 표기 차이로 라우팅이 끊겼다').toBe('디스크의 A\n');

    win.unmount();
  });
});

describe('AC-PANEL-052 — 조정 상태가 문서별로 독립이다', () => {
  it('dirty 문서는 알림으로, 깨끗한 문서는 자동 반영으로 서로 다르게 판정된다', () => {
    const a = openPanel('/w/a.md', 'A의 내용\n');
    const b = openPanel('/w/b.md', 'B의 내용\n');
    markDirty('/w/a.md');

    emit('/w/a.md', '디스크의 A\n');
    emit('/w/b.md', '디스크의 B\n');

    expect(store().stateFor('/w/a.md')?.status).toBe('held-notify');
    expect(a.text(), '미저장 편집이 있는데 버퍼가 교체됐다').toBe('A의 내용\n');

    expect(store().stateFor('/w/b.md')?.status).toBe('idle');
    expect(b.text()).toBe('디스크의 B\n');

    a.unmount();
    b.unmount();
  });

  it('한 문서의 상태 전이가 다른 문서의 상태를 바꾸지 않는다', () => {
    const a = openPanel('/w/a.md', 'A의 내용\n');
    const b = openPanel('/w/b.md', 'B의 내용\n');
    markDirty('/w/a.md');

    // 판정은 상태 **값**이 아니라 **객체 참조**로 한다: 두 문서의 상태 값이
    // 우연히 같으면 값 비교는 오염을 놓친다.
    const bBefore = store().stateFor('/w/b.md');
    emit('/w/a.md', '디스크의 A\n');
    expect(store().stateFor('/w/b.md'), 'a.md의 전이가 b.md의 상태를 갈아치웠다').toBe(bBefore);

    const aHeld = store().stateFor('/w/a.md');
    expect(aHeld?.status).toBe('held-notify');
    emit('/w/b.md', '디스크의 B\n');
    expect(store().stateFor('/w/a.md'), 'b.md의 전이가 a.md의 보류를 흔들었다').toBe(aHeld);
    expect(store().stateFor('/w/a.md')?.pending?.content).toBe('디스크의 A\n');

    a.unmount();
    b.unmount();
  });

  it('한 문서의 배너 동작이 다른 문서의 보류를 소비하지 않는다', () => {
    const a = openPanel('/w/a.md', 'A의 내용\n');
    const b = openPanel('/w/b.md', 'B의 내용\n');
    markDirty('/w/a.md');
    markDirty('/w/b.md');
    emit('/w/a.md', '디스크의 A\n');
    emit('/w/b.md', '디스크의 B\n');

    store().dispatchFor('/w/a.md', { type: 'user-load-from-disk' });

    expect(a.text()).toBe('디스크의 A\n');
    expect(b.text(), 'a.md의 동작이 b.md에 적용됐다').toBe('B의 내용\n');
    expect(store().stateFor('/w/b.md')?.status, 'b.md의 보류가 사라졌다').toBe('held-notify');

    a.unmount();
    b.unmount();
  });
});

describe('AC-PANEL-055 — 실행자가 마운트 탈취로 무효화되지 않는다', () => {
  it('두 번째 패널이 마운트해도 첫 패널의 조정이 살아 있다', () => {
    // 오늘의 결함 형태: 모듈 수준 단일 슬롯을 두 번째 등록이 조용히 가져간다.
    // 컴파일 오류도 런타임 오류도 나지 않으므로 전용 AC가 필요하다.
    const a = openPanel('/w/a.md', 'A의 내용\n');
    const b = openPanel('/w/b.py', 'print("B")\n');

    emit('/w/a.md', '디스크의 A\n');

    expect(a.text(), '나중 마운트가 앞 패널의 실행자를 가져갔다').toBe('디스크의 A\n');
    expect(a.applies).toEqual(['디스크의 A\n']);
    expect(b.text(), 'a.md의 내용이 b.py 버퍼에 적용됐다').toBe('print("B")\n');

    a.unmount();
    b.unmount();
  });

  it('나중에 마운트한 패널의 조정도 함께 살아 있다', () => {
    // 슬롯이 하나면 둘 중 하나는 반드시 죽는다. 둘 다 살아 있음을 본다.
    const a = openPanel('/w/a.md', 'A의 내용\n');
    const b = openPanel('/w/b.py', 'print("B")\n');

    emit('/w/b.py', 'print("디스크")\n');

    expect(b.text()).toBe('print("디스크")\n');
    expect(a.text()).toBe('A의 내용\n');

    a.unmount();
    b.unmount();
  });

  it('세 패널이 동시에 조정을 받는다', () => {
    const a = openPanel('/w/a.md', 'A\n');
    const b = openPanel('/w/b.py', 'B\n');
    const c = openPanel('/w/c.csv', 'C\n');

    emit('/w/a.md', 'A2\n');
    emit('/w/b.py', 'B2\n');
    emit('/w/c.csv', 'C2\n');

    expect([a.text(), b.text(), c.text()]).toEqual(['A2\n', 'B2\n', 'C2\n']);

    a.unmount();
    b.unmount();
    c.unmount();
  });
});

describe('AC-PANEL-055b — 실행자가 다른 패널의 언마운트로 무효화되지 않는다', () => {
  it('패널 B를 언마운트해도 패널 A의 조정이 살아 있다', () => {
    // 마운트 탈취와는 **별개 경로**다: 정리 클로저가 슬롯을 비울 때 자기 것이
    // 아닌 등록까지 끄는 형태. 그래서 AC도 둘이다.
    const a = openPanel('/w/a.md', 'A의 내용\n');
    const b = openPanel('/w/b.py', 'print("B")\n');

    b.unmount();
    emit('/w/a.md', '디스크의 A\n');

    expect(a.text(), '남의 언마운트가 이 패널의 조정을 껐다').toBe('디스크의 A\n');
    expect(a.applies).toEqual(['디스크의 A\n']);

    a.unmount();
  });

  it('먼저 마운트한 패널을 언마운트해도 나중 패널의 조정이 살아 있다', () => {
    const a = openPanel('/w/a.md', 'A의 내용\n');
    const b = openPanel('/w/b.py', 'print("B")\n');

    a.unmount();
    emit('/w/b.py', 'print("디스크")\n');

    expect(b.text()).toBe('print("디스크")\n');

    b.unmount();
  });

  it('언마운트한 패널의 경로에는 더 이상 적용되지 않는다', () => {
    // 해제가 **자기 경로만** 거두는지를 본다. 너무 많이 거두면 위 두 단언이
    // 잡고, 너무 적게 거두면 이 단언이 잡는다.
    const a = openPanel('/w/a.md', 'A의 내용\n');
    const b = openPanel('/w/b.py', 'print("B")\n');

    b.unmount();
    emit('/w/b.py', 'print("디스크")\n');

    expect(b.text(), '언마운트한 패널의 버퍼가 바뀌었다').toBe('print("B")\n');
    expect(store().targetPaths()).toEqual(['/w/a.md']);

    a.unmount();
  });
});

describe('AC-PANEL-056 — 정책 주입 지점이 보존된다', () => {
  /** 주입 횟수를 세는 래퍼. 실제 주입은 스토어의 창 단위 지점을 통과한다. */
  let injections: number;
  const injectPolicy = (policy: ReconciliationPolicy): void => {
    injections += 1;
    store().setPolicy(policy);
  };

  beforeEach(() => {
    injections = 0;
  });

  it('한 번 주입한 정책이 세 문서 모두에 적용된다', () => {
    const a = openPanel('/w/a.md', 'A\n');
    const b = openPanel('/w/b.py', 'B\n');
    const c = openPanel('/w/c.csv', 'C\n');

    injectPolicy(bannerNotifyPolicy);

    emit('/w/a.md', 'A2\n');
    emit('/w/b.py', 'B2\n');
    emit('/w/c.csv', 'C2\n');

    for (const path of ['/w/a.md', '/w/b.py', '/w/c.csv']) {
      expect(store().stateFor(path)?.status, `${path}가 알림 상태가 아니다`).toBe('held-notify');
    }
    // 깨끗한 버퍼여도 자동 반영되지 않았다 — 정책이 실제로 판정을 바꿨다.
    expect([a.text(), b.text(), c.text()]).toEqual(['A\n', 'B\n', 'C\n']);
    expect(injections, '문서마다 주입해야 했다').toBe(1);

    a.unmount();
    b.unmount();
    c.unmount();
  });

  it('주입 뒤에 열린 문서에도 재주입 없이 적용된다', () => {
    // "문서 수와 무관하게 1회"의 실질이 여기 있다. 새 문서마다 재주입이
    // 필요하면 SPEC-4의 승인 정책이 문서 열기 경로를 전부 알아야 한다.
    injectPolicy(bannerNotifyPolicy);
    const late = openPanel('/w/late.md', 'L\n');

    emit('/w/late.md', 'L2\n');

    expect(store().stateFor('/w/late.md')?.status).toBe('held-notify');
    expect(late.text()).toBe('L\n');
    expect(injections).toBe(1);

    late.unmount();
  });

  it('정책은 창 단위 값 하나다 — 문서별 정책 맵이 없다', () => {
    // 정책을 문서별로 키잉하면 SPEC-4가 "모든 문서에 승인 정책을 걸기" 위해
    // N번 주입해야 한다(`design.md` §6.5). 상태만 문서별이고 정책은 창 단위다.
    const src = readFileSync(join(process.cwd(), 'src', 'store', 'reconciliationStore.ts'), 'utf8');
    expect(src, '문서별 정책 맵이 생겼다').not.toMatch(
      /Map<\s*string\s*,\s*ReconciliationPolicy\s*>/,
    );
    expect(src, '창 단위 정책 필드가 없다').toMatch(/policy:\s*ReconciliationPolicy/);
  });
});
