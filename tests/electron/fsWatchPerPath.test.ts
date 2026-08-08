import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';

/**
 * 경로별 합류(REQ-WS-016)와 Linux 폴링 경로 단위 승격 검증.
 *
 * 기존 `tests/electron/fs.test.ts`는 감시자 개수·정리만 보고 콜백을 버린다.
 * 여기서는 콜백을 붙잡아 이벤트를 결정적으로 재생한다.
 */

vi.mock('node:fs/promises', () => {
  const readdir = vi.fn();
  const stat = vi.fn();
  return { default: { readdir, stat }, readdir, stat };
});

type WatchListener = (event: string, filename: string | null) => void;
const watchCalls: Array<{ path: string; listener: WatchListener; close: ReturnType<typeof vi.fn> }> = [];

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    watch: vi.fn((p: string, _opts: unknown, listener: WatchListener) => {
      const close = vi.fn();
      watchCalls.push({ path: p, listener, close });
      return { close } as unknown as import('node:fs').FSWatcher;
    }),
  };
});

import { readdir, stat } from 'node:fs/promises';
import { watchRoot, unwatchAllRoots, WATCH_DEBOUNCE_MS, WATCH_POLL_MS } from '../../electron/fs';

const readdirMock = readdir as unknown as ReturnType<typeof vi.fn>;
const statMock = stat as unknown as ReturnType<typeof vi.fn>;

const ROOT = '/w';
const realPlatform = process.platform;

function setPlatform(p: string): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}

function dirent(name: string, isDir: boolean) {
  return { name, isDirectory: () => isDir, isFile: () => !isDir };
}

beforeEach(async () => {
  vi.useFakeTimers();
  readdirMock.mockReset();
  statMock.mockReset();
  watchCalls.length = 0;
  await unwatchAllRoots();
});

afterEach(async () => {
  await unwatchAllRoots();
  vi.useRealTimers();
  Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
});

describe('경로별 합류 — REQ-WS-016 / AC-WS-059', () => {
  beforeEach(() => setPlatform('darwin'));

  it('한 합류 창 안의 두 파일 변경이 모두 방출된다', async () => {
    // 회귀 근거: 기존 구현은 루트당 단일 pendingPath 스칼라를 last-wins로
    // 덮어써 이 시나리오에서 1건만 방출한다.
    const seen: string[] = [];
    await watchRoot(ROOT, (p) => seen.push(p));
    const listener = watchCalls[0]!.listener;

    listener('change', 'manuscript/a.md');
    vi.advanceTimersByTime(50); // 같은 창 안
    listener('change', 'manuscript/b.md');
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);

    expect(seen.sort()).toEqual([join(ROOT, 'manuscript/a.md'), join(ROOT, 'manuscript/b.md')].sort());
  });

  it('같은 경로의 연속 이벤트는 하나로 합류한다', async () => {
    const seen: string[] = [];
    await watchRoot(ROOT, (p) => seen.push(p));
    const listener = watchCalls[0]!.listener;

    listener('change', 'a.md');
    vi.advanceTimersByTime(50);
    listener('change', 'a.md');
    vi.advanceTimersByTime(50);
    listener('change', 'a.md');
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);

    expect(seen).toEqual([join(ROOT, 'a.md')]);
  });

  it('세 경로가 한 창에 몰려도 전부 방출된다', async () => {
    const seen: string[] = [];
    await watchRoot(ROOT, (p) => seen.push(p));
    const listener = watchCalls[0]!.listener;

    for (const f of ['a.md', 'b.md', 'c.md']) listener('change', f);
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);

    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toBe(3);
  });

  it('filename이 null이면 루트 경로를 방출한다', async () => {
    const seen: string[] = [];
    await watchRoot(ROOT, (p) => seen.push(p));
    watchCalls[0]!.listener('change', null);
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    expect(seen).toEqual([ROOT]);
  });

  it('감시 해제 시 보류 타이머가 방출되지 않는다', async () => {
    const seen: string[] = [];
    await watchRoot(ROOT, (p) => seen.push(p));
    watchCalls[0]!.listener('change', 'a.md');
    await unwatchAllRoots();
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS * 5);
    expect(seen).toEqual([]);
  });
});

describe('Linux 폴링 경로 단위 승격 — REQ-WS-016 / plan.md §B.5 (a)', () => {
  beforeEach(() => setPlatform('linux'));

  /** listDirectory가 주어진 (이름, mtime) 목록을 돌려주게 만든다. */
  function mockTree(entries: Array<[string, number]>): void {
    readdirMock.mockResolvedValue(entries.map(([n]) => dirent(n, false)));
    statMock.mockImplementation(async (p: string) => {
      const hit = entries.find(([n]) => p === join(ROOT, n));
      return { mtimeMs: hit ? hit[1] : 0 };
    });
  }

  it('루트 경로가 아니라 변경된 파일 경로를 방출한다', async () => {
    // 기존 구현은 onChange(rootPath)를 방출해 REQ-WS-016의 경로별 보장을
    // 구조적으로 만족할 수 없었다.
    const seen: string[] = [];
    mockTree([
      ['a.md', 100],
      ['b.md', 100],
    ]);
    await watchRoot(ROOT, (p) => seen.push(p));

    mockTree([
      ['a.md', 100],
      ['b.md', 200], // b만 변경
    ]);
    await vi.advanceTimersByTimeAsync(WATCH_POLL_MS);

    expect(seen).toEqual([join(ROOT, 'b.md')]);
  });

  it('한 주기에 두 파일이 바뀌면 두 건을 방출한다', async () => {
    const seen: string[] = [];
    mockTree([
      ['a.md', 100],
      ['b.md', 100],
    ]);
    await watchRoot(ROOT, (p) => seen.push(p));

    mockTree([
      ['a.md', 111],
      ['b.md', 222],
    ]);
    await vi.advanceTimersByTimeAsync(WATCH_POLL_MS);

    expect(seen.sort()).toEqual([join(ROOT, 'a.md'), join(ROOT, 'b.md')].sort());
  });

  it('추가된 파일과 삭제된 파일 모두 경로 단위로 방출한다', async () => {
    const seen: string[] = [];
    mockTree([['a.md', 100]]);
    await watchRoot(ROOT, (p) => seen.push(p));

    mockTree([['b.md', 100]]); // a 삭제, b 추가
    await vi.advanceTimersByTimeAsync(WATCH_POLL_MS);

    expect(seen.sort()).toEqual([join(ROOT, 'a.md'), join(ROOT, 'b.md')].sort());
  });

  it('마크다운이 아닌 파일의 변경도 방출한다 — REQ-WS-032', async () => {
    // 감시 계층은 확장자에 의존하면 안 된다. 폴링이 폴더 트리용 열거를
    // 재사용하면 그 열거가 마크다운만 반환하므로 .py/.csv 변경이 통째로
    // 보이지 않는다 — 감시 계층에 남은 확장자 특례다.
    const seen: string[] = [];
    mockTree([
      ['script.py', 100],
      ['data.csv', 100],
    ]);
    await watchRoot(ROOT, (p) => seen.push(p));

    mockTree([
      ['script.py', 200],
      ['data.csv', 100],
    ]);
    await vi.advanceTimersByTimeAsync(WATCH_POLL_MS);
    expect(seen).toEqual([join(ROOT, 'script.py')]);
  });

  it('변경이 없으면 아무것도 방출하지 않는다', async () => {
    const seen: string[] = [];
    mockTree([['a.md', 100]]);
    await watchRoot(ROOT, (p) => seen.push(p));
    await vi.advanceTimersByTimeAsync(WATCH_POLL_MS);
    expect(seen).toEqual([]);
  });
});
