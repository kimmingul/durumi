import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EditorState, type Transaction } from '@codemirror/state';
import { noticeFor, reduceReconciliation, type ReconciliationEffect } from '@shared/reconciliation';
import { attachExternalChangeChannel } from '../../src/store/externalChangeChannel';
import {
  useReconciliationStore,
  type RoutedReconciliationEvent,
} from '../../src/store/reconciliationStore';
import { registerReconciliationExecutor } from '../../src/editor/applyExternalChange';
import type { ExternalFileChange } from '@shared/ipc-contract';

/**
 * SPEC-V03-WORKSPACE-002 M0 — 확정 이벤트의 **경로 라우팅**.
 *
 * SPEC-1은 조정 코어를 의도적으로 경로 무지(path-blind)로 두고 라우팅을 위
 * 계층에 남겼는데, 그 계층이 만들어지지 않은 채 v0.2.31이 출하되었다. 그
 * 결과가 **무성 버퍼 덮어쓰기**다 — 열지도 감시 등록하지도 않은 파일의 내용이
 * 현재 버퍼에 적용되고, 조정 상태는 정상 완료로 정착해 사용자가 알 수단이 없다.
 *
 * 대체하는 것은 **preload 브리지(`onExternalFileChange`)와 `DispatchTarget`
 * 둘뿐**이다. 후자는 `src/editor/applyExternalChange.ts:63-67`이 테스트 seam으로
 * 선언한 인터페이스다. 채널·스토어·실행자·문서 상태는 **실제 모듈**을 쓴다 —
 * 그러지 않으면 결함이 사는 지점을 우회한다.
 *
 * 대상 AC: AC-PANEL-080 / 080b / 080c / 080d / 080e / 080f / 083 / 084.
 */

// 리듀서 호출 여부가 AC-PANEL-080b의 판정 대상이므로 통과형 스파이를 건다.
vi.mock('@shared/reconciliation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/reconciliation')>();
  return { ...actual, reduceReconciliation: vi.fn(actual.reduceReconciliation) };
});

const reduceSpy = vi.mocked(reduceReconciliation);

// ---------------------------------------------------------------------------
// 스토어 어댑터 — AC 단언이 스토어 API 형태에 매이지 않도록 한 곳에 모은다.
// ---------------------------------------------------------------------------

type Handler = (effect: ReconciliationEffect) => void;

const store = () => useReconciliationStore.getState();

/** 경로 → 적용 대상 등록. 해제 클로저를 돌려준다. */
const bindTarget = (path: string, handler: Handler): (() => void) => {
  store().setEffectHandlerFor(path, handler);
  return () => store().setEffectHandlerFor(path, null);
};
/** 그 경로의 조정 상태. 열린 문서가 아니면 null. */
const stateOf = (path: string) => store().stateFor(path);
/** 경로 → 상태 Map의 키 목록. */
const statePathList = (): string[] => [...store().statePaths()].sort();
/** 경로 → 적용 대상 Map의 키 목록. */
const targetPathList = (): string[] => [...store().targetPaths()].sort();
/** 그 문서에 이벤트를 넣는다 (조합 이벤트는 게이트 합류를 거친다). */
const send = (path: string, event: RoutedReconciliationEvent): void => {
  store().dispatchFor(path, event);
};

// ---------------------------------------------------------------------------
// preload 브리지 대체 — main의 broadcast가 이 창에 전달하는 확정 이벤트.
// ---------------------------------------------------------------------------

let subscribers: Array<(c: ExternalFileChange) => void>;

const fakeApi = {
  onExternalFileChange(cb: (c: ExternalFileChange) => void) {
    subscribers.push(cb);
    return () => {
      subscribers = subscribers.filter((s) => s !== cb);
    };
  },
};

const emit = (c: Partial<ExternalFileChange>): void => {
  const full: ExternalFileChange = {
    path: '/w/a.md',
    kind: 'changed',
    content: 'A의 내용\n',
    decodeError: null,
    size: 10,
    mtimeMs: 1,
    ...c,
  };
  for (const s of subscribers) s(full);
};

// ---------------------------------------------------------------------------
// 패널 하나 — 문서 경로와 뷰 준비 신호 **양쪽**에 등록이 결속된다.
//
// 여기서 "뷰 준비"는 React 컴포넌트 마운트가 아니라 **주입된 `DispatchTarget`이
// 준비 신호를 내는 시점**이다(`design.md` §6.2a, R3 명확화). 프로덕션의
// `[filePath, readyView]` effect가 하는 일과 같은 형태다.
// ---------------------------------------------------------------------------

function makePanel(initial: string) {
  let docState = EditorState.create({ doc: initial });
  const target = {
    get state() {
      return docState;
    },
    dispatch(tr: Transaction) {
      docState = tr.state;
    },
  };

  /** 이 패널의 적용 대상에 도달한 `apply-to-buffer` 내용 목록. */
  const applies: string[] = [];
  let path: string | null = null;
  let ready = false;
  let detach: (() => void) | null = null;

  const sync = (): void => {
    detach?.();
    detach = null;
    if (!ready || path === null) return;
    const bound = path;
    detach = registerReconciliationExecutor(target, (h) => {
      if (h === null) {
        bindTarget(bound, () => {})();
        return;
      }
      bindTarget(bound, (effect) => {
        if (effect.kind === 'apply-to-buffer') applies.push(effect.content);
        h(effect);
      });
    });
  };

  return {
    applies,
    text: () => docState.doc.toString(),
    /** 문서 재바인딩 — 이전 경로의 등록을 풀고 새 경로로 등록한다. */
    setPath(next: string | null) {
      path = next;
      sync();
    },
    /** 주입된 적용 대상이 준비 신호를 낸다. */
    signalReady() {
      ready = true;
      sync();
    },
    /** 패널 정리. */
    teardown() {
      detach?.();
      detach = null;
    },
  };
}

/** 경로를 갖고 준비까지 마친 패널 하나를 만든다. */
function openPanel(path: string, initial: string) {
  const panel = makePanel(initial);
  panel.setPath(path);
  panel.signalReady();
  return panel;
}

beforeEach(() => {
  subscribers = [];
  store().reset();
  reduceSpy.mockClear();
});
afterEach(() => store().reset());

// ---------------------------------------------------------------------------

describe('AC-PANEL-080 — 열지 않은 경로의 확정 변경이 깨끗한 버퍼를 덮어쓰지 않는다', () => {
  it('b.md만 연 창에 a.md의 확정 변경이 와도 b.md 버퍼가 불변이다', () => {
    const b = openPanel('/w/b.md', 'B의 내용\n');
    const detachChannel = attachExternalChangeChannel(fakeApi);

    // 판정은 반드시 **깨끗한 문서**에서 한다 — dirty만 검사하면 오늘의 코드가
    // 그대로 통과한다(`!state.isDirty`가 즉시 적용만 막기 때문).
    expect(stateOf('/w/b.md')?.isDirty, '깨끗한 문서에서 판정한다').toBe(false);

    emit({ path: '/w/a.md', content: 'A의 내용\n' });

    expect(b.text()).toBe('B의 내용\n');
    expect(b.applies, 'apply-to-buffer가 도달하지 않는다').toEqual([]);

    detachChannel();
    b.teardown();
  });
});

describe('AC-PANEL-080b — 폐기된 이벤트가 어떤 전이도 일으키지 않는다', () => {
  it('리듀서가 호출되지 않고, 상태 객체 참조도 Map 항목도 그대로다', () => {
    const b = openPanel('/w/b.md', 'B의 내용\n');
    const detachChannel = attachExternalChangeChannel(fakeApi);

    const before = stateOf('/w/b.md');
    const statesBefore = statePathList();
    const targetsBefore = targetPathList();
    reduceSpy.mockClear();

    emit({ path: '/w/a.md', content: 'A의 내용\n' });

    // 판정은 상태 **값**이 아니라 **전이 발생**으로 한다: 'idle'은 이벤트
    // 이전·수정 전 사후·수정 후 사후 세 시점 모두의 값이라 판별력이 없다.
    expect(reduceSpy, '리듀서가 호출되었다').not.toHaveBeenCalled();
    expect(stateOf('/w/b.md'), '상태 객체 참조가 교체되었다').toBe(before);
    expect(statePathList(), '미등록 경로에 상태 항목이 생겼다').toEqual(statesBefore);
    expect(targetPathList(), '미등록 경로에 적용 대상 항목이 생겼다').toEqual(targetsBefore);
    expect(statePathList()).not.toContain('/w/a.md');
    expect(targetPathList()).not.toContain('/w/a.md');

    detachChannel();
    b.teardown();
  });
});

describe('AC-PANEL-080c — dirty 문서의 pending이 다른 경로의 변경으로 오염되지 않는다', () => {
  it('다른 경로의 변경은 pending에 심기지 않고 배너도 뜨지 않는다', () => {
    const b = openPanel('/w/b.md', 'B의 내용\n');
    const detachChannel = attachExternalChangeChannel(fakeApi);
    send('/w/b.md', { type: 'dirty-changed', isDirty: true });

    emit({ path: '/w/a.md', content: 'A의 내용\n' });

    expect(stateOf('/w/b.md')?.pending, 'a.md의 변경이 b.md의 pending에 심겼다').toBeNull();
    expect(noticeFor(stateOf('/w/b.md')!), 'b.md에 배너가 떴다').toBeNull();

    // 배너 동작을 눌러도 다른 경로의 내용이 적용되지 않는다.
    send('/w/b.md', { type: 'user-load-from-disk' });
    expect(b.text()).toBe('B의 내용\n');

    detachChannel();
    b.teardown();
  });

  it('정상 경로 회귀 — 자기 경로의 변경은 배너를 띄우고 그 내용을 적용한다', () => {
    const b = openPanel('/w/b.md', 'B의 내용\n');
    const detachChannel = attachExternalChangeChannel(fakeApi);
    send('/w/b.md', { type: 'dirty-changed', isDirty: true });

    emit({ path: '/w/b.md', content: '디스크의 B\n' });

    expect(stateOf('/w/b.md')?.status).toBe('held-notify');
    expect(stateOf('/w/b.md')?.pending?.path).toBe('/w/b.md');

    send('/w/b.md', { type: 'user-load-from-disk' });
    expect(b.text()).toBe('디스크의 B\n');

    detachChannel();
    b.teardown();
  });
});

describe('AC-PANEL-080d — 오염된 내용이 쓰기 채널로 전달되지 않는다', () => {
  it('저장 시 쓰기 채널에 전달된 바이트가 원래 버퍼와 동일하다', () => {
    // 쓰기 채널은 주입된 스텁이다 — M0은 상태 계층 유닛으로 밀폐되므로
    // 실제 디스크가 아니라 **채널에 전달된 값**을 단언한다.
    const writes: Array<[string, string]> = [];
    const saveToDisk = (p: string, content: string): void => {
      writes.push([p, content]);
    };

    const b = openPanel('/w/b.md', 'B의 내용\n');
    const detachChannel = attachExternalChangeChannel(fakeApi);

    emit({ path: '/w/a.md', content: 'A의 내용\n' });
    saveToDisk('/w/b.md', b.text());

    expect(writes).toEqual([['/w/b.md', 'B의 내용\n']]);

    detachChannel();
    b.teardown();
  });
});

describe('AC-PANEL-080e — 패널이 문서를 재바인딩하면 라우팅 키도 재키잉된다', () => {
  it('재바인딩 후 옛 경로는 도달하지 않고 새 경로만 도달한다', () => {
    const panel = openPanel('/w/a.md', '패널 버퍼\n');
    const detachChannel = attachExternalChangeChannel(fakeApi);

    panel.setPath('/w/b.md');

    emit({ path: '/w/a.md', content: 'A의 새 내용\n' });
    expect(panel.applies, '옛 경로의 변경이 도달했다').toEqual([]);

    emit({ path: '/w/b.md', content: 'B의 새 내용\n' });
    expect(panel.applies).toEqual(['B의 새 내용\n']);

    expect(targetPathList(), '옛 경로의 적용 대상 항목이 남아 있다').not.toContain('/w/a.md');
    expect(targetPathList()).toContain('/w/b.md');

    detachChannel();
    panel.teardown();
  });

  it('경로를 이미 가진 상태에서 뷰가 준비되면 그 시점의 현재 경로로 등록된다', () => {
    // `[filePath]` effect의 몸통에는 `if (view)` 가드가 있어 마운트 시 건너뛴다.
    // 등록이 `filePath` 변화에만 결속되면, 경로를 이미 가진 채 준비된 패널은
    // 재실행이 없어 외부 변경을 영영 받지 못한다 — 오류도 나지 않는다.
    const panel = makePanel('복원된 버퍼\n');
    const detachChannel = attachExternalChangeChannel(fakeApi);

    panel.setPath('/w/restored.md'); // 뷰가 아직 준비되지 않았다
    panel.signalReady(); // 준비 신호 — 이 시점의 현재 경로로 등록되어야 한다

    emit({ path: '/w/restored.md', content: '디스크 내용\n' });
    expect(panel.applies).toEqual(['디스크 내용\n']);

    detachChannel();
    panel.teardown();
  });
});

describe('AC-PANEL-080f — 경로 없는 문서는 라우팅 키를 갖지 않는다', () => {
  it('untitled 문서는 어느 Map에도 항목을 만들지 않는다', () => {
    const panel = makePanel('');
    panel.setPath(null);
    panel.signalReady();

    expect(statePathList(), 'null이 키로 쓰였다').toEqual([]);
    expect(targetPathList(), 'null이 키로 쓰였다').toEqual([]);

    panel.teardown();
  });

  it('서로 다른 untitled 문서 둘이 같은 키를 공유하지 않는다', () => {
    const one = makePanel('');
    const two = makePanel('');
    one.setPath(null);
    one.signalReady();
    two.setPath(null);
    two.signalReady();

    expect(statePathList()).toEqual([]);
    expect(targetPathList()).toEqual([]);

    one.teardown();
    two.teardown();
  });

  it('경로를 획득하면 그 시점에 등록이 수립된다', () => {
    const panel = makePanel('새 문서\n');
    const detachChannel = attachExternalChangeChannel(fakeApi);
    panel.setPath(null);
    panel.signalReady();

    panel.setPath('/w/saved-as.md'); // 다른 이름으로 저장

    expect(targetPathList()).toEqual(['/w/saved-as.md']);
    emit({ path: '/w/saved-as.md', content: '디스크 내용\n' });
    expect(panel.applies).toEqual(['디스크 내용\n']);

    detachChannel();
    panel.teardown();
  });
});

// ---------------------------------------------------------------------------
// 소스 단언 — 라우팅 계층의 **위치**를 고정한다.
// ---------------------------------------------------------------------------

/** 조정 코어. 확장자도 경로도 알 이유가 없는 다섯 파일이다. */
const LAYER_FILES = [
  'electron/changeConfirmation.ts',
  'electron/watchScope.ts',
  'shared/reconciliation.ts',
  'src/editor/minimalDiff.ts',
  'src/editor/applyExternalChange.ts',
];

const read = (rel: string): string => readFileSync(join(process.cwd(), ...rel.split('/')), 'utf8');

describe('AC-PANEL-083 — 라우팅 키가 조정 코어 밖에 있다', () => {
  it('경로 키 Map이 src/store/ 아래에 산다', () => {
    const src = read('src/store/reconciliationStore.ts');
    expect(src, '경로 → 상태 Map이 없다').toMatch(/Map<string,\s*ReconciliationState>/);
    expect(src, '경로 → 적용 대상 Map이 없다').toMatch(/Map<string,\s*ReconciliationEffectHandler>/);
  });

  it('다섯 조정 코어 파일 어디에도 경로 키 라우팅이 없다', () => {
    // 확정 계층은 자기 살림(디바운스 타이머·기준 사실)을 위해 `Map<string, …>`을
    // 쓰므로 Map 자체를 금지하면 오탐이 난다. 금지 대상은 **라우팅 키** —
    // 경로 → 조정 상태 / 경로 → 적용 대상 — 와 그것을 다루는 이름들이다.
    for (const file of LAYER_FILES) {
      const src = read(file);
      expect(src, `${file}: 경로 → 조정 상태 Map`).not.toMatch(/Map<\s*string\s*,\s*Reconciliation/);
      for (const symbol of [
        'setEffectHandlerFor',
        'dispatchFor',
        'stateFor',
        'statePaths',
        'targetPaths',
        'openDocument',
      ]) {
        expect(src.includes(symbol), `${file}: ${symbol}`).toBe(false);
      }
    }
  });
});

describe('AC-PANEL-084 — 브로드캐스트 범위가 소스 단언으로 고정된다', () => {
  it('main은 여전히 모든 창에 브로드캐스트한다 (변경하지 않았다는 사실의 고정)', () => {
    // M0은 렌더러 측 경로 대조로 결함을 닫고 main의 브로드캐스트 범위는
    // 건드리지 않는다. 창 간 소유권 모델은 이 SPEC의 범위 밖이므로, 이
    // 단언이 나중에 그 지점을 잊지 않게 한다. **엔드투엔드 다중 창 전달을
    // 주장하지 않는다** — 소스에 존재함만 단언한다.
    const src = read('electron/ipc/project.ts');
    expect(src).toMatch(/BrowserWindow\.getAllWindows\(\)/);
  });
});
