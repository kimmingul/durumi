import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { attachExternalChangeChannel } from '../../src/store/externalChangeChannel';
import { useReconciliationStore } from '../../src/store/reconciliationStore';
import type { ExternalFileChange } from '@shared/ipc-contract';

/**
 * main에서 올라온 확정 변경을 조정 상태 기계로 넘기는 배선.
 *
 * 세 갈래가 서로 다른 상태로 가야 한다 — 하나로 뭉뚱그리면 삭제나 디코드
 * 실패가 정상 변경으로 처리되어 버퍼를 덮어쓴다.
 */

let subscribers: Array<(c: ExternalFileChange) => void>;
let unsubscribed: number;

const fakeApi = {
  onExternalFileChange(cb: (c: ExternalFileChange) => void) {
    subscribers.push(cb);
    return () => {
      unsubscribed += 1;
      subscribers = subscribers.filter((s) => s !== cb);
    };
  },
};

const emit = (c: Partial<ExternalFileChange>): void => {
  const full: ExternalFileChange = {
    path: '/w/a.md',
    kind: 'changed',
    content: 'disk\n',
    decodeError: null,
    size: 5,
    mtimeMs: 1,
    ...c,
  };
  for (const s of subscribers) s(full);
};

beforeEach(() => {
  subscribers = [];
  unsubscribed = 0;
  useReconciliationStore.getState().reset();
});
afterEach(() => useReconciliationStore.getState().reset());

describe('세 갈래 라우팅', () => {
  it('일반 변경은 조정으로 간다', () => {
    const applied: string[] = [];
    useReconciliationStore.getState().setEffectHandler((e) => {
      if (e.kind === 'apply-to-buffer') applied.push(e.content);
    });
    const detach = attachExternalChangeChannel(fakeApi);
    emit({ content: 'disk\n' });
    expect(applied).toEqual(['disk\n']);
    detach();
  });

  it('삭제는 사라짐 상태로 간다 (REQ-WS-030)', () => {
    const detach = attachExternalChangeChannel(fakeApi);
    emit({ kind: 'deleted', content: null });
    expect(useReconciliationStore.getState().state.status).toBe('missing');
    detach();
  });

  it('디코드 실패는 조정을 중단시킨다 (REQ-WS-031)', () => {
    const applied: string[] = [];
    useReconciliationStore.getState().setEffectHandler((e) => {
      if (e.kind === 'apply-to-buffer') applied.push(e.content);
    });
    const detach = attachExternalChangeChannel(fakeApi);
    emit({ content: null, decodeError: 'not utf-8' });

    const s = useReconciliationStore.getState().state;
    expect(s.status).toBe('decode-error');
    expect(s.errorMessage).toBe('not utf-8');
    expect(applied, '손상된 내용으로 버퍼를 덮어쓰지 않는다').toEqual([]);
    detach();
  });

  it('내용이 없는데 오류도 없으면 조정하지 않는다', () => {
    // 있을 수 없는 조합이지만, 통과시키면 null을 정상 내용으로 넘기게 된다.
    const applied: string[] = [];
    useReconciliationStore.getState().setEffectHandler((e) => {
      if (e.kind === 'apply-to-buffer') applied.push(e.content);
    });
    const detach = attachExternalChangeChannel(fakeApi);
    emit({ content: null, decodeError: null });
    expect(applied).toEqual([]);
    detach();
  });
});

describe('구독 해제 계약 — C-3', () => {
  it('detach가 구독을 해제한다', () => {
    const detach = attachExternalChangeChannel(fakeApi);
    expect(subscribers).toHaveLength(1);
    detach();
    expect(unsubscribed).toBe(1);
    expect(subscribers).toHaveLength(0);
  });

  it('해제 후에는 이벤트가 상태를 바꾸지 않는다', () => {
    const detach = attachExternalChangeChannel(fakeApi);
    detach();
    emit({ kind: 'deleted', content: null });
    expect(useReconciliationStore.getState().state.status).toBe('idle');
  });
});
