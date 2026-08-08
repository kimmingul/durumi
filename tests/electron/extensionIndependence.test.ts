import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EditorState, type Transaction } from '@codemirror/state';
import {
  createChangeConfirmer,
  DEFAULT_DEBOUNCE_MS,
  type ConfirmedFileEvent,
  type FileFacts,
} from '../../electron/changeConfirmation';
import { applyExternalChange } from '../../src/editor/applyExternalChange';

/**
 * REQ-WS-032 / AC-WS-034 — 감시·확정·조정 계층은 확장자에 의존하지 않는다.
 *
 * 이것은 **부정 명제**다. 다섯 확장자를 넣어 보고 같은 결과가 나왔다고
 * 부정을 증명할 수는 없다 — 여섯 번째(`.tex`)에 분기가 있어도 통과한다.
 *
 * 그래서 두 겹으로 단언한다:
 *   1. **구조적** — 해당 계층의 소스가 확장자를 **읽는 수단** 자체를 갖지 않는다.
 *      확장자로 분기하려면 반드시 `extname`·`endsWith('.`·확장자 정규식·
 *      `split('.')` 중 하나가 필요하므로, 그 수단의 부재가 곧 분기의 부재다.
 *   2. **행위적** — 다섯 확장자가 동일한 확정 이벤트 형태와 조정 결과를 낸다.
 *
 * 구조적 단언이 없으면 이 검사는 표본 다섯 개짜리 추측이고, 행위적 단언이
 * 없으면 우회 경로(주입된 콜백 등)를 놓친다.
 */

const EXTENSIONS = ['.py', '.csv', '.bib', '.json', '.md'] as const;

// --- 1. 구조적 단언 ---------------------------------------------------------

/** 감시·확정·조정 계층. 확장자를 알 이유가 없는 파일들이다. */
const LAYER_FILES = [
  'electron/changeConfirmation.ts',
  'electron/watchScope.ts',
  'shared/reconciliation.ts',
  'src/editor/minimalDiff.ts',
  'src/editor/applyExternalChange.ts',
];

/** 확장자를 읽어내는 수단들. 하나라도 있으면 분기가 가능해진다. */
const EXTENSION_READERS: Array<[string, RegExp]> = [
  ['extname 호출', /\bextname\b/],
  ["endsWith('.', 확장자 접미 비교", /endsWith\(\s*['"`]\./],
  ['확장자 정규식', /\\\.\((?:[a-z|]+)\)/i],
  ["split('.') 확장자 분해", /split\(\s*['"`]\.\s*['"`]\s*\)/],
  ['마크다운 특례 함수', /isMarkdownFile/],
  ['확장자 리터럴 비교', /['"`]\.(?:md|markdown|py|csv|bib|json|txt)['"`]/],
];

describe('구조적 — 계층이 확장자를 읽지 않는다', () => {
  for (const file of LAYER_FILES) {
    it(`${file}에 확장자를 읽는 수단이 없다`, () => {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      // 주석은 제외한다 — 설명문에 `.md`가 나오는 것은 분기가 아니다.
      const code = src
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
      for (const [label, re] of EXTENSION_READERS) {
        expect(re.test(code), `${file}: ${label}`).toBe(false);
      }
    });
  }

  it('감지 수단 목록 자체가 실제로 무언가를 잡을 수 있다', () => {
    // 정규식이 전부 오타여도 위 검사는 통과한다. 확장자 분기가 실제로 있는
    // 파일(`electron/fs.ts`의 폴더 트리용 마크다운 필터)로 감지력을 확인한다.
    const withBranching = readFileSync(join(process.cwd(), 'electron', 'fs.ts'), 'utf8');
    const hits = EXTENSION_READERS.filter(([, re]) => re.test(withBranching));
    expect(hits.length, '감지 정규식이 알려진 확장자 분기를 잡지 못한다').toBeGreaterThan(0);
  });
});

// --- 2. 행위적 단언 ---------------------------------------------------------

class FakeTimers {
  private seq = 0;
  private queue = new Map<number, () => void>();
  set = (fn: () => void): number => {
    const id = ++this.seq;
    this.queue.set(id, fn);
    return id;
  };
  clear = (h: unknown): void => {
    this.queue.delete(h as number);
  };
  flush(): void {
    const due = [...this.queue.values()];
    this.queue.clear();
    for (const fn of due) fn();
  }
}

const facts = (size: number, mtimeMs: number): FileFacts => ({ size, mtimeMs });

describe('행위적 — 다섯 확장자가 같은 확정 이벤트를 낸다 (AC-WS-034)', () => {
  let events: Record<string, ConfirmedFileEvent[]>;

  beforeEach(() => {
    events = {};
  });

  async function confirmFor(ext: string): Promise<ConfirmedFileEvent[]> {
    const timers = new FakeTimers();
    const path = `/w/manuscript/doc${ext}`;
    const disk = new Map<string, FileFacts>([[path, facts(10, 1000)]]);
    const out: ConfirmedFileEvent[] = [];

    const confirmer = createChangeConfirmer({
      stat: async (p) => disk.get(p) ?? null,
      readContent: async () => 'irrelevant',
      setTimer: timers.set,
      clearTimer: timers.clear,
      onConfirm: (e) => out.push(e),
    });
    confirmer.track(path, facts(10, 1000));
    disk.set(path, facts(42, 4200));
    confirmer.ingest({ type: 'change', path });
    timers.flush();
    await Promise.resolve();
    await Promise.resolve();
    return out;
  }

  it('확정 이벤트의 형태가 확장자에 무관하게 동일하다', async () => {
    for (const ext of EXTENSIONS) events[ext] = await confirmFor(ext);

    const shapes = EXTENSIONS.map((ext) => {
      const list = events[ext]!;
      expect(list, ext).toHaveLength(1);
      // 경로만 다르고 나머지는 같아야 한다.
      const { path, ...rest } = list[0]!;
      expect(path).toContain(ext);
      return JSON.stringify(rest);
    });
    expect(new Set(shapes).size, `형태가 갈렸다: ${shapes.join(' | ')}`).toBe(1);
  });

  it('debounce 창도 확장자에 따라 달라지지 않는다', () => {
    expect(DEFAULT_DEBOUNCE_MS).toBe(200);
  });
});

describe('행위적 — 다섯 확장자가 같은 조정 결과를 낸다 (AC-WS-034)', () => {
  function reconcile(doc: string, next: string): string {
    let state = EditorState.create({ doc });
    const target = {
      get state() {
        return state;
      },
      dispatch(tr: Transaction) {
        state = tr.state;
      },
    };
    applyExternalChange(target, next);
    return state.sliceDoc();
  }

  it('같은 내용 변경이면 확장자와 무관하게 같은 결과다', () => {
    // 조정 계층은 경로를 아예 받지 않는다 — 그 자체가 확장자 독립의 증거다.
    const before = 'alpha\nbeta\ngamma\n';
    const after = 'alpha\nBETA\ngamma\n';
    const results = EXTENSIONS.map(() => reconcile(before, after));
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe(after);
  });

  it('조정 API 시그니처에 경로가 없다', () => {
    // 확장자로 분기하려면 먼저 경로를 알아야 한다. 받지 않으면 분기할 수 없다.
    expect(applyExternalChange.length).toBe(2); // (target, nextContent)
  });
});
