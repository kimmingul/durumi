import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { useFileMenuCommands, type FileMenuCommands } from '../../src/hooks/useFileMenuCommands';
import { useWorkspaceStore } from '../../src/store/workspaceStore';
import { useToastStore } from '../../src/store/toastStore';
import { DECODE_FAILED_CODE } from '@shared/ipc-contract';

/**
 * SPEC-V03-WORKSPACE-002 M5 단계2 — 열기 실패의 **렌더러 축**.
 *
 * 대상 AC: AC-PANEL-046 `Then` — "편집 가능한 패널이 만들어지지 않고 **사용자에게
 * 사유가 보고된다**".
 *
 * ## 왜 main 쪽 테스트만으로 부족한가
 *
 * `tests/electron/filesStrictDecode.test.ts`는 핸들러가 **거부한다**까지만
 * 본다. AC가 요구하는 두 가지 — 패널이 만들어지지 않는 것과 사유가 사용자에게
 * 닿는 것 — 은 둘 다 렌더러에서만 관측된다. main이 거부해도 렌더러가 그것을
 * 조용히 삼키면 사용자는 아무 일도 일어나지 않은 화면을 본다.
 *
 * ## 왜 모달이 아닌가
 *
 * AC-PANEL-058이 패널 알림에 모달을 금지했고 M4가 배너를 패널 안으로 옮겼다.
 * 열기 실패는 그 규율을 따르는 패널 범위 사건이므로 이미 있는 비모달 표면
 * (`toastStore` → `Toast.tsx`, `role="status"` / `aria-live`)을 재사용한다.
 * 새 표면을 만들지 않았다.
 *
 * ## 왜 오류 *형태*를 보는가
 *
 * 렌더러가 아무 거부나 "디코드 실패"로 보고하면 경로 가드 거부
 * (`PathNotAllowedError`)까지 잘못된 사유로 보고된다. 그래서 디코드 실패만
 * 골라 잡고 나머지는 오늘처럼 전역 그물(`src/utils/errorSurface.ts`)로
 * 흘려보낸다 — 아래 두 번째 describe가 그 경계를 고정한다.
 */

const workspace = () => useWorkspaceStore.getState();
const toasts = () => useToastStore.getState().toasts;

let commands: FileMenuCommands | null = null;

function Probe(): null {
  commands = useFileMenuCommands();
  return null;
}

let host: HTMLDivElement;
let root: Root;

/** `ipcRenderer.invoke` 거부가 렌더러에 도달하는 형태 그대로 흉내낸다. */
function rejectingApi(message: string): void {
  (window as unknown as { api: unknown }).api = {
    fileOpenPath: async () => {
      throw new Error(message);
    },
    fileOpen: async () => {
      throw new Error(message);
    },
  };
}

function resolvingApi(path: string, content: string): void {
  (window as unknown as { api: unknown }).api = {
    fileOpenPath: async () => ({ path, content }),
    fileOpen: async () => ({ path, content }),
  };
}

/**
 * Electron이 main의 오류를 렌더러로 넘길 때 씌우는 껍데기. 사유 판정이 이
 * 래핑을 견디는지가 실제 배선의 조건이다.
 */
const wrapped = (code: string, path: string): string =>
  `Error invoking remote method 'file:openPath': Error: ${code}: ${path}`;

beforeEach(() => {
  commands = null;
  useToastStore.getState().clear();
  workspace().reset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(<Probe />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useToastStore.getState().clear();
  workspace().reset();
});

/**
 * **파일에 바인딩된** 문서의 수.
 *
 * `documents.size`를 세면 안 된다 — 워크스페이스는 언제나 빈 untitled 문서를
 * 하나 들고 있고(`workspaceStore.initialState`), 파일을 열면 그 자리를 갈아
 * 끼우므로 크기가 1로 **고정**이다. 즉 크기 단언은 열기 성공/실패 어느 쪽에서도
 * 1을 보고 통과한다. AC가 묻는 것은 "편집 가능한 패널이 만들어졌는가"이므로
 * 경로가 붙은 문서만 센다.
 */
function openedFileCount(): number {
  return [...workspace().documents.values()].filter((d) => d.path !== null).length;
}

// ---------------------------------------------------------------------------

describe('AC-PANEL-046 Then — 디코드 실패는 패널을 만들지 않고 사유를 보고한다', () => {
  it('doOpenPath: 패널에 문서가 바인딩되지 않는다', async () => {
    rejectingApi(wrapped(DECODE_FAILED_CODE, '/w/broken.csv'));

    await act(async () => {
      await commands!.doOpenPath('/w/broken.csv');
    });

    expect(openedFileCount(), '디코드 실패인데 문서가 열렸다').toBe(0);
  });

  it('doOpenPath: 사유가 비모달 토스트로 사용자에게 닿는다', async () => {
    rejectingApi(wrapped(DECODE_FAILED_CODE, '/w/broken.csv'));

    await act(async () => {
      await commands!.doOpenPath('/w/broken.csv');
    });

    expect(toasts()).toHaveLength(1);
    // 파일명이 실려야 사용자가 어느 파일인지 안다.
    expect(toasts()[0]!.message).toContain('broken.csv');
  });

  it('doOpen(다이얼로그)도 같은 자세다', async () => {
    rejectingApi(wrapped(DECODE_FAILED_CODE, '/w/broken.csv'));

    await act(async () => {
      await commands!.doOpen();
    });

    expect(openedFileCount()).toBe(0);
    expect(toasts()).toHaveLength(1);
  });

  it('버퍼에 U+FFFD가 담기지 않는다 — 어떤 문서도 만들어지지 않았으므로', async () => {
    rejectingApi(wrapped(DECODE_FAILED_CODE, '/w/broken.csv'));

    await act(async () => {
      await commands!.doOpenPath('/w/broken.csv');
    });

    const allContent = [...workspace().documents.values()].map((d) => d.content).join('');
    expect(allContent).not.toContain('�');
  });
});

describe('AC-PANEL-046 양성 대조 / 경계 — 다른 실패를 디코드 실패로 오인하지 않는다', () => {
  it('정상 보조 파일은 열리고 토스트가 뜨지 않는다', async () => {
    resolvingApi('/w/analysis.py', 'print(1)\n');

    await act(async () => {
      await commands!.doOpenPath('/w/analysis.py');
    });

    expect(openedFileCount()).toBe(1);
    expect(toasts()).toHaveLength(0);
  });

  it('경로 가드 거부는 디코드 사유로 보고되지 않고 그대로 전파된다', async () => {
    rejectingApi("Error invoking remote method 'file:openPath': Error: EPERM: path not allowed");

    const outcome = await act(async () =>
      commands!.doOpenPath('/etc/passwd').then(
        () => 'resolved',
        () => 'rejected',
      ),
    );

    expect(outcome, '디코드 실패가 아닌 오류를 삼켰다').toBe('rejected');
    expect(toasts(), '디코드 사유 토스트가 잘못 떴다').toHaveLength(0);
  });
});
