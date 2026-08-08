import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { useExternalChangeWiring } from '../../src/hooks/useExternalChangeWiring';
import { useReconciliationStore } from '../../src/store/reconciliationStore';
import type { ExternalFileChange } from '@shared/ipc-contract';

/** main 채널을 흉내낸다 — 실제 IPC 없이 배선만 본다. */
const calls = {
  watch: [] as Array<[string, string]>,
  unwatch: [] as string[],
  note: [] as Array<[string, string]>,
  subscribers: [] as Array<(c: ExternalFileChange) => void>,
  unsubscribed: 0,
};

function installFakeApi(): void {
  (window as unknown as { api: unknown }).api = {
    watchOpenFile: async (p: string, c: string) => {
      calls.watch.push([p, c]);
    },
    unwatchOpenFile: async (p: string) => {
      calls.unwatch.push(p);
    },
    noteOpenFileContent: async (p: string, c: string) => {
      calls.note.push([p, c]);
    },
    onExternalFileChange: (cb: (c: ExternalFileChange) => void) => {
      calls.subscribers.push(cb);
      return () => {
        calls.unsubscribed += 1;
        calls.subscribers = calls.subscribers.filter((s) => s !== cb);
      };
    },
  };
}

function Probe({ filePath, content }: { filePath: string | null; content: string }) {
  useExternalChangeWiring(filePath, content);
  return null;
}

let host: HTMLDivElement;
let root: Root;

const render = (filePath: string | null, content: string): void => {
  act(() => {
    root.render(<Probe filePath={filePath} content={content} />);
  });
};

beforeEach(() => {
  calls.watch = [];
  calls.unwatch = [];
  calls.note = [];
  calls.subscribers = [];
  calls.unsubscribed = 0;
  installFakeApi();
  useReconciliationStore.getState().reset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useReconciliationStore.getState().reset();
});

describe('열린 파일 감시 등록', () => {
  it('파일이 열리면 현재 내용과 함께 감시를 등록한다', () => {
    render('/w/a.md', 'hello\n');
    expect(calls.watch).toEqual([['/w/a.md', 'hello\n']]);
  });

  it('파일이 없으면 등록하지 않는다', () => {
    render(null, '');
    expect(calls.watch).toEqual([]);
  });

  it('파일이 바뀌면 이전 파일의 감시를 먼저 푼다', () => {
    // 남겨 두면 닫힌 파일의 변경이 계속 올라와 엉뚱한 버퍼를 덮어쓴다.
    render('/w/a.md', 'a\n');
    render('/w/b.md', 'b\n');
    expect(calls.unwatch).toEqual(['/w/a.md']);
    expect(calls.watch.map(([p]) => p)).toEqual(['/w/a.md', '/w/b.md']);
  });

  it('내용만 바뀌면 재등록하지 않는다', () => {
    render('/w/a.md', 'a\n');
    render('/w/a.md', 'a edited\n');
    expect(calls.watch).toHaveLength(1);
  });
});

describe('버퍼 기준 동기화', () => {
  it('내용이 바뀌면 main에 알린다', () => {
    render('/w/a.md', 'v1\n');
    render('/w/a.md', 'v2\n');
    expect(calls.note).toEqual([['/w/a.md', 'v2\n']]);
  });

  it('등록 시점 내용은 중복 통지하지 않는다', () => {
    render('/w/a.md', 'v1\n');
    expect(calls.note).toEqual([]);
  });
});

describe('채널 구독 — C-3', () => {
  it('마운트 시 구독하고 언마운트 시 해제한다', () => {
    render('/w/a.md', 'a\n');
    expect(calls.subscribers).toHaveLength(1);
    act(() => root.unmount());
    expect(calls.unsubscribed).toBe(1);
    // afterEach의 재-unmount가 던지지 않도록 새 루트를 세운다.
    root = createRoot(host);
  });

  it('올라온 변경이 조정 계층에 도달한다', () => {
    render('/w/a.md', 'a\n');
    const applied: string[] = [];
    useReconciliationStore.getState().setEffectHandler((e) => {
      if (e.kind === 'apply-to-buffer') applied.push(e.content);
    });
    act(() => {
      for (const s of calls.subscribers) {
        s({ path: '/w/a.md', kind: 'changed', content: 'disk\n', decodeError: null, size: 5, mtimeMs: 1 });
      }
    });
    expect(applied).toEqual(['disk\n']);
  });
});
