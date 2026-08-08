import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('electron', () => ({}));

import {
  createExternalWatchService,
  decodeUtf8Strict,
  type ExternalWatchDeps,
} from '../../electron/externalWatch';
import { PathNotAllowedError } from '../../electron/pathGuard';
import type { ExternalFileChange } from '@shared/ipc-contract';
import type { FileFacts } from '../../electron/changeConfirmation';

/**
 * main→렌더러 채널의 **다리** 검증.
 *
 * M4의 `ConfirmedFileEvent`(탐지)와 M2의 조정 계층이 소비하는 형태는 서로
 * 다르다. 그 변환에 내용 읽기가 끼어들고, 그 읽기가 디코드에 실패할 수 있다 —
 * REQ-WS-031이 규정한 경로다. 여기서 그 변환만 격리해 검사한다.
 */

class FakeTimers {
  private seq = 0;
  private q = new Map<number, () => void>();
  set = (fn: () => void): number => {
    const id = ++this.seq;
    this.q.set(id, fn);
    return id;
  };
  clear = (h: unknown): void => {
    this.q.delete(h as number);
  };
  flush(): void {
    const due = [...this.q.values()];
    this.q.clear();
    for (const fn of due) fn();
  }
}

const A = '/w/a.md';
const facts = (size: number, mtimeMs: number): FileFacts => ({ size, mtimeMs });

let timers: FakeTimers;
let disk: Map<string, { facts: FileFacts; bytes: Uint8Array }>;
let emitted: ExternalFileChange[];
let watched: string[];
let asserted: string[];

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

function build(overrides: Partial<ExternalWatchDeps> = {}) {
  const deps: ExternalWatchDeps = {
    stat: async (p) => disk.get(p)?.facts ?? null,
    readBytes: async (p) => {
      const e = disk.get(p);
      if (!e) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return e.bytes;
    },
    assertAllowed: async (p) => {
      asserted.push(p);
    },
    watchPath: async (p) => {
      watched.push(p);
    },
    unwatchPath: async () => {},
    setTimer: timers.set,
    clearTimer: timers.clear,
    ...overrides,
  };
  return createExternalWatchService(deps, (e) => emitted.push(e));
}

async function flush(): Promise<void> {
  timers.flush();
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  timers = new FakeTimers();
  disk = new Map();
  emitted = [];
  watched = [];
  asserted = [];
});

describe('열린 파일의 외부 변경이 렌더러 형태로 전달된다', () => {
  it('내용을 실어 보낸다', async () => {
    disk.set(A, { facts: facts(5, 1000), bytes: enc('old\n') });
    const svc = build();
    await svc.watchFile(A, 'old\n');

    disk.set(A, { facts: facts(8, 2000), bytes: enc('newer\n') });
    svc.ingest({ type: 'change', path: A });
    await flush();

    expect(emitted).toEqual([
      { path: A, kind: 'changed', content: 'newer\n', decodeError: null, size: 8, mtimeMs: 2000 },
    ]);
  });

  it('내용이 같으면 아무것도 보내지 않는다 (2단계 확정)', async () => {
    disk.set(A, { facts: facts(5, 1000), bytes: enc('same\n') });
    const svc = build();
    await svc.watchFile(A, 'same\n');

    disk.set(A, { facts: facts(5, 2000), bytes: enc('same\n') });
    svc.ingest({ type: 'change', path: A });
    await flush();

    expect(emitted).toEqual([]);
  });

  it('삭제는 deleted로 전달된다', async () => {
    disk.set(A, { facts: facts(5, 1000), bytes: enc('x\n') });
    const svc = build();
    await svc.watchFile(A, 'x\n');

    disk.delete(A);
    svc.ingest({ type: 'rename', path: A });
    await flush();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.kind).toBe('deleted');
    expect(emitted[0]!.content).toBeNull();
  });

  it('자기 저장은 외부 변경으로 전달되지 않는다', async () => {
    disk.set(A, { facts: facts(5, 1000), bytes: enc('v1\n') });
    const svc = build();
    await svc.watchFile(A, 'v1\n');

    disk.set(A, { facts: facts(3, 3000), bytes: enc('v2\n') });
    svc.noteSelfWrite(A, facts(3, 3000));
    svc.ingest({ type: 'rename', path: A });
    await flush();

    expect(emitted).toEqual([]);
  });

  it('감시 해제 후에는 전달하지 않는다', async () => {
    disk.set(A, { facts: facts(5, 1000), bytes: enc('x\n') });
    const svc = build();
    await svc.watchFile(A, 'x\n');
    await svc.unwatchFile(A);

    disk.set(A, { facts: facts(9, 2000), bytes: enc('changed\n') });
    svc.ingest({ type: 'change', path: A });
    await flush();

    expect(emitted).toEqual([]);
  });
});

describe('디코드 실패 — REQ-WS-031', () => {
  it('유효한 텍스트로 디코드되지 않으면 내용 없이 오류를 보고한다', async () => {
    disk.set(A, { facts: facts(4, 1000), bytes: enc('ok\n') });
    const svc = build();
    await svc.watchFile(A, 'ok\n');

    // 고립된 continuation 바이트 — UTF-8로 디코드되지 않는다.
    disk.set(A, { facts: facts(3, 2000), bytes: new Uint8Array([0x61, 0xff, 0x0a]) });
    svc.ingest({ type: 'change', path: A });
    await flush();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.content).toBeNull();
    expect(emitted[0]!.decodeError).toBeTruthy();
    expect(emitted[0]!.kind).toBe('changed');
  });

  it('디코드 실패를 손상된 내용으로 대체하지 않는다', async () => {
    // 대체 문자(U+FFFD)로 때우면 조정 계층이 그것을 정상 내용으로 받아
    // 버퍼를 손상된 텍스트로 덮어쓴다 — REQ-WS-031이 금지하는 바로 그 결과다.
    disk.set(A, { facts: facts(4, 1000), bytes: enc('ok\n') });
    const svc = build();
    await svc.watchFile(A, 'ok\n');
    disk.set(A, { facts: facts(3, 2000), bytes: new Uint8Array([0xc3, 0x28]) });
    svc.ingest({ type: 'change', path: A });
    await flush();

    expect(emitted[0]!.content).toBeNull();
    expect(typeof emitted[0]!.content).not.toBe('string');
  });

  it('엄격 디코더가 유효한 UTF-8은 통과시킨다', () => {
    expect(decodeUtf8Strict(enc('한글 🙂\n'))).toBe('한글 🙂\n');
  });

  it('엄격 디코더가 잘못된 바이트에 null을 돌려준다', () => {
    expect(decodeUtf8Strict(new Uint8Array([0xff, 0xfe, 0x41]))).toBeNull();
  });
});

describe('pathGuard를 우회하지 않는다 — REQ-WS-019', () => {
  it('신뢰되지 않은 경로는 감시 등록이 거부된다', async () => {
    const svc = build({
      assertAllowed: async (p) => {
        throw new PathNotAllowedError(p);
      },
    });
    await expect(svc.watchFile('/untrusted/x.md', '')).rejects.toBeInstanceOf(PathNotAllowedError);
    expect(watched).toEqual([]);
  });

  it('등록 전에 반드시 검증한다', async () => {
    disk.set(A, { facts: facts(1, 1), bytes: enc('x') });
    const svc = build();
    await svc.watchFile(A, 'x');
    expect(asserted).toEqual([A]);
    expect(watched).toEqual([A]);
  });

  it('검증 실패 시 추적도 시작되지 않는다', async () => {
    const svc = build({
      assertAllowed: async (p) => {
        throw new PathNotAllowedError(p);
      },
    });
    await svc.watchFile('/untrusted/x.md', '').catch(() => {});

    disk.set('/untrusted/x.md', { facts: facts(9, 9), bytes: enc('changed') });
    svc.ingest({ type: 'change', path: '/untrusted/x.md' });
    await flush();
    expect(emitted).toEqual([]);
  });
});

describe('버퍼 동기화', () => {
  it('저장·재로드 후의 기준 내용이 갱신된다', async () => {
    disk.set(A, { facts: facts(3, 1000), bytes: enc('v1\n') });
    const svc = build();
    await svc.watchFile(A, 'v1\n');

    svc.setOpenContent(A, 'v2\n');
    disk.set(A, { facts: facts(3, 2000), bytes: enc('v2\n') });
    svc.ingest({ type: 'change', path: A });
    await flush();
    expect(emitted).toEqual([]);
  });
});
