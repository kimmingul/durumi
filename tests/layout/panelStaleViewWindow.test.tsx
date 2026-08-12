import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import type { MenuCommand } from '@shared/ipc-contract';
import { installFakeApi, mountApp, type MountedApp } from '../_helpers/appHarness';
import { useWorkspaceStore } from '../../src/store/workspaceStore';
import { useBibliographyStore } from '../../src/store/bibliographyStore';
import { getPanelView } from '../../src/store/panelViews';

/**
 * **낡은 뷰 창이 실제로 닫혔는가** (OQ-4 확정 = 후보 1의 근거).
 *
 * ## 무엇이 위험했나
 *
 * 예전 `useMenuCommandRouter`는 `const view = editorViewRef.current`를 `async`
 * 핸들러의 **첫 줄**에서 실행했고, 그 아래로 `await` 분기가 여럿이었다. 비동기
 * 커맨드를 처리하는 동안 사용자가 다른 패널로 옮겨가면 그 지역 변수는 이미
 * 활성이 아닌 패널의 뷰를 가리킨다.
 *
 * 뷰가 하나뿐일 때는 두 값이 늘 같아서 무해했다 — 그래서 유닛 2300여 건이
 * 전부 green인 채로 이 위험이 남아 있었다. 패널이 둘이 되는 순간 드러난다.
 *
 * ## 이 검사가 하는 일
 *
 * `aiCitationSuggest`는 키 조회를 `await`한 뒤 뷰를 읽는다. 그 대기 중에 활성
 * 패널을 바꾸고, 제안이 **새 활성 패널의 문단**에 대한 것인지 본다. 접근자
 * 형태가 아니면 여기서 옛 패널의 문단이 나온다.
 *
 * 접근자를 만들어 놓고도 훅이 진입 시점에 한 번 뽑아 지역 변수에 담으면 이득이
 * 사라지므로, **형태가 아니라 동작**으로 판정한다.
 */

const store = () => useWorkspaceStore.getState();

let app: MountedApp | null = null;
let emit: ((cmd: MenuCommand) => void | Promise<void>) | null = null;

/** 해소 시점을 시험이 쥐는 약속. `await` 창을 정확히 그 자리에 연다. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

beforeEach(() => {
  store().reset();
  useBibliographyStore.setState({ entries: [] });
});

afterEach(() => {
  app?.unmount();
  app = null;
  emit = null;
  store().reset();
  useBibliographyStore.setState({ entries: [] });
});

describe('비동기 커맨드 처리 중 활성 패널이 바뀌면 작용은 새 활성 패널로 간다', () => {
  it('`aiCitationSuggest`의 제안 문단이 대기 중 전환된 패널의 것이다', async () => {
    const keyGate = deferred<boolean>();
    installFakeApi({
      memoSidecarRead: async () => null,
      filesIndex: async () => [],
      // 이 약속이 열려 있는 동안이 곧 낡은 뷰 창이다.
      aiHasKey: () => keyGate.promise,
      onMenuCommand: (cb: (cmd: MenuCommand) => void | Promise<void>) => {
        emit = cb;
        return () => { emit = null; };
      },
    });

    app = mountApp();
    const panelA = store().activePanelId!;
    act(() => {
      store().openInActivePanel('/w/a.md', 'A 문단입니다\n');
      store().openInNewPanel('/w/b.md', 'B 문단입니다\n');
    });
    const panelB = store().activePanelId!;
    await flush();

    // 두 패널 모두 캐럿을 자기 문단 안에 둔다.
    act(() => {
      getPanelView(panelA)!.dispatch({ selection: { anchor: 2 } });
      getPanelView(panelB)!.dispatch({ selection: { anchor: 2 } });
      store().setActivePanel(panelA);
    });
    expect(store().activePanelId).toBe(panelA);

    // 커맨드를 **띄운 채** 둔다 — 여기서 핸들러는 `await`에 걸려 있다.
    const inFlight = emit!('aiCitationSuggest');

    // 그 사이에 사용자가 패널 B로 옮겨간다.
    act(() => {
      store().setActivePanel(panelB);
    });

    // 이제 키 조회가 끝난다.
    await act(async () => {
      keyGate.resolve(true);
      await inFlight;
    });

    // 제안 패널은 `React.lazy`다(`App.tsx:38`). 상태가 열려도 **청크가 도착할
    // 때까지** `<Suspense fallback={null}>`이 아무것도 렌더하지 않는다. 정해진
    // 횟수의 tick으로 그 도착을 대신하면 느린 러너에서 단언이 도착보다 먼저
    // 실행된다 — 라운드 수는 시간이 아니라 이벤트 루프 회전 수이기 때문이다.
    //
    // ubuntu CI가 정확히 그렇게 깨졌다: `제안 패널이 열리지 않았다`가 뜨고
    // **6ms 뒤** React가 "A suspended resource finished loading … not wrapped
    // in act"를 경고했다 — 청크가 테스트 종료 뒤에 도착했다는 뜻이다. 같은
    // 경고가 windows 실행에는 0건이고 거기서는 통과했다. 반대로 이 경고는
    // 핸들러가 조기 반환하지 **않았음**도 증명한다: 패널이 렌더되지 않았다면
    // React가 서스펜드할 일도 없다.
    //
    // 같은 모듈을 여기서 직접 기다리면 도착이 보장된다. React가 먼저 등록한
    // 해소 콜백이 우리보다 앞서 실행되므로 순서도 보장된다.
    await act(async () => {
      await import('../../src/components/CitationSuggestPanel');
    });
    await flush();

    // 서지 목록은 **맨 마지막에** 채운다. 활성 문서가 바뀔 때마다
    // `bindToDocument`가 목록을 다시 읽어 비우므로, 앞에서 채우면 전환 과정에서
    // 지워진다. 비어 있으면 제안 패널이 "참고문헌 없음" 가지로 렌더되어 문단이
    // 나오지 않는다 — 문단은 이미 커맨드 처리 시점에 붙잡혔으므로 이 순서가
    // 판정을 바꾸지 않는다.
    act(() => {
      useBibliographyStore.setState({
        entries: [{ key: 'ref1', type: 'article', fields: { title: '참고문헌' } } as never],
      });
    });
    await flush();

    const shown = document.querySelector('[data-testid="cite-suggest-paragraph"]');
    expect(shown, '제안 패널이 열리지 않았다').toBeTruthy();
    expect(
      shown!.textContent,
      '대기 중 전환하기 전의 패널 문단이 쓰였다 — 낡은 뷰 창이 열려 있다',
    ).toContain('B 문단입니다');
  });
});
