import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { useExternalChangeWiring } from '../../src/hooks/useExternalChangeWiring';
import { useReconciliationStore } from '../../src/store/reconciliationStore';
import { useWorkspaceStore, type PanelState } from '../../src/store/workspaceStore';
import type { ExternalFileChange } from '@shared/ipc-contract';

/**
 * SPEC-V03-WORKSPACE-002 M3 — 감시 등록의 **문서 축**.
 *
 * 대상 AC: AC-PANEL-050 / 050b ↔ REQ-PANEL-050.
 *
 * ## 이 파일이 뒤집은 단언 (plan.md §B.8)
 *
 * 판 이전의 이 파일은 **"파일이 바뀌면 이전 파일의 감시를 먼저 푼다"** 를 규칙으로
 * 단언했다. 그 규칙은 N개 문서 동시 감시와 양립 불가하다 — 보조 패널이 문서를
 * 열 때마다 첫 패널의 감시가 풀리면 그 문서의 외부 변경이 영영 올라오지 않고,
 * 사용자는 남이 고친 파일 위에 저장한다.
 *
 * REQ-PANEL-050이 그 규칙을 **참조 카운트**로 바꾼다: 등록은 경로당 1회이고
 * 해제는 **마지막 참조 패널이 닫힐 때** 1회다. 단일 패널이 문서를 갈아탈 때
 * 이전 경로가 풀리는 것은 이제 **규칙이 아니라 그 규칙의 한 사례**다 — 갈아타는
 * 순간 이전 경로를 참조하는 패널이 하나도 남지 않기 때문이다. 아래 세 번째
 * describe가 그 사례를 규칙의 귀결로 다시 세운다.
 *
 * ## 왜 훅이 인자를 받지 않는가
 *
 * 등록 대상이 "활성 문서 하나"에서 "열린 모든 패널의 문서"로 바뀌었다. 활성
 * 문서를 인자로 받으면 호출부가 나머지 패널을 알려 줄 방법이 없다. 훅은 이제
 * 워크스페이스 스토어를 직접 구독한다 — 그래서 이 테스트도 props가 아니라
 * 스토어를 움직여 판정한다.
 */

const workspace = () => useWorkspaceStore.getState();
const reconciliation = () => useReconciliationStore.getState();

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

function Probe() {
  useExternalChangeWiring();
  return null;
}

let host: HTMLDivElement;
let root: Root;

/** 훅을 마운트한다. 이미 열린 문서가 있으면 그 상태로 등록이 수립된다. */
const mount = (): void => {
  act(() => {
    root.render(<Probe />);
  });
};

/** 첫 항목은 활성 패널에, 나머지는 새 패널에 연다. */
const openDocs = (...entries: Array<[string, string]>): void => {
  act(() => {
    entries.forEach(([path, content], index) => {
      if (index === 0) workspace().openInActivePanel(path, content);
      else workspace().openInNewPanel(path, content);
    });
  });
};

/** 감시 등록된 경로만 (등록 시점 내용은 따로 본다). */
const watchedPaths = (): string[] => calls.watch.map(([p]) => p);

beforeEach(() => {
  calls.watch = [];
  calls.unwatch = [];
  calls.note = [];
  calls.subscribers = [];
  calls.unsubscribed = 0;
  installFakeApi();
  workspace().reset();
  reconciliation().reset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  workspace().reset();
  reconciliation().reset();
});

// ---------------------------------------------------------------------------

describe('AC-PANEL-050 — 열린 모든 패널의 문서가 감시 등록된다', () => {
  it('서로 다른 문서 셋을 연 패널 셋이 모두 등록되고, 어느 등록도 다른 등록을 풀지 않는다', () => {
    mount();
    openDocs(['/w/a.md', 'A\n'], ['/w/b.py', 'B\n'], ['/w/c.csv', 'C\n']);

    expect(watchedPaths().sort()).toEqual(['/w/a.md', '/w/b.py', '/w/c.csv']);
    expect(calls.unwatch, '한 경로의 등록이 다른 경로의 등록을 풀었다').toEqual([]);
  });

  it('등록은 그 문서의 현재 내용과 함께 이루어진다', () => {
    mount();
    openDocs(['/w/a.md', 'A 내용\n'], ['/w/b.py', 'B 내용\n']);

    expect(calls.watch.sort()).toEqual(
      [
        ['/w/a.md', 'A 내용\n'],
        ['/w/b.py', 'B 내용\n'],
      ].sort(),
    );
  });

  it('이미 열려 있는 상태에서 마운트해도 전부 등록된다', () => {
    // 배치 복원(M8)이 이 순서를 만든다 — 문서를 이미 가진 채 표면이 붙는다.
    openDocs(['/w/a.md', 'A\n'], ['/w/b.py', 'B\n']);
    mount();

    expect(watchedPaths().sort()).toEqual(['/w/a.md', '/w/b.py']);
    expect(calls.unwatch).toEqual([]);
  });

  it('열린 모든 문서가 조정 계층의 열린 문서로도 등록된다', () => {
    // 이 목록이 확정 이벤트 폐기 판정의 근거다(REQ-PANEL-070). 감시만 되고
    // 조정 계층이 모르면 그 문서의 확정 변경이 열리지 않은 경로로 폐기된다.
    mount();
    openDocs(['/w/a.md', 'A\n'], ['/w/b.py', 'B\n']);

    expect(reconciliation().statePaths().sort()).toEqual(['/w/a.md', '/w/b.py']);
  });

  it('경로 없는 문서는 등록하지 않는다', () => {
    mount();
    // 초기 상태가 이미 untitled 패널 하나다. 아무것도 열지 않은 채로도 등록이 없다.
    expect(calls.watch).toEqual([]);

    act(() => {
      workspace().openInNewPanel(null, '');
    });
    expect(calls.watch, 'untitled 문서가 등록되었다').toEqual([]);
  });
});

describe('AC-PANEL-050b — 같은 문서의 등록·해제는 참조 카운트를 따른다', () => {
  /**
   * 같은 문서를 두 패널이 참조하는 상태를 세운다.
   *
   * `openInNewPanel`은 이미 열린 경로를 보면 새 패널을 만들지 않고 그 패널로
   * 이동한다 — v0.3이 dual-open을 금지하기 때문이다(REQ-PANEL-011). 그러나
   * **구조는 1:N을 표현할 수 있게 남아 있고**(REQ-PANEL-011a) AC의 Given은
   * 동작이 아니라 **상태**다. 그래서 상태를 직접 세운다. v0.4의 dual-open이
   * 이 분기를 재작성 없이 활성화한다는 것이 이 배치의 요점이다.
   */
  const addPanelSharing = (panelId: string, documentId: string): void => {
    act(() => {
      const extra: PanelState = { panelId, documentId, displayMode: 'wysiwyg' };
      useWorkspaceStore.setState({ panels: [...workspace().panels, extra] });
    });
  };

  it('두 패널이 같은 문서를 참조하면 등록은 정확히 1회다', () => {
    mount();
    openDocs(['/w/a.md', 'A\n']);
    const docId = workspace().panels[0]!.documentId;

    addPanelSharing('panel-shadow', docId);

    expect(calls.watch, 'a.md가 두 번 등록되었다').toEqual([['/w/a.md', 'A\n']]);
  });

  it('참조가 남아 있는 동안에는 해제하지 않는다', () => {
    mount();
    // 마지막 패널은 닫히지 않으므로(REQ-PANEL-004) 닫을 여지를 남길 패널을 하나 둔다.
    openDocs(['/w/a.md', 'A\n'], ['/w/keep.md', 'K\n']);
    const first = workspace().panels[0]!;
    addPanelSharing('panel-shadow', first.documentId);

    act(() => {
      workspace().closePanel(first.panelId);
    });

    expect(calls.unwatch, '아직 참조하는 패널이 있는데 감시를 풀었다').toEqual([]);
    expect(reconciliation().statePaths()).toContain('/w/a.md');
  });

  it('마지막 참조 패널이 닫힐 때 정확히 1회 해제한다', () => {
    mount();
    openDocs(['/w/a.md', 'A\n'], ['/w/keep.md', 'K\n']);
    const first = workspace().panels[0]!;
    addPanelSharing('panel-shadow', first.documentId);

    act(() => {
      workspace().closePanel(first.panelId);
    });
    expect(calls.unwatch).toEqual([]);

    act(() => {
      workspace().closePanel('panel-shadow');
    });

    expect(calls.unwatch, '마지막 참조가 사라졌는데 감시가 남았다').toEqual(['/w/a.md']);
    expect(reconciliation().statePaths(), '조정 상태가 남았다').not.toContain('/w/a.md');
    // 남은 문서의 감시는 그대로다.
    expect(calls.unwatch).not.toContain('/w/keep.md');
  });
});

describe('참조 카운트의 한 사례 — 단일 패널이 문서를 갈아탄다', () => {
  it('갈아타면 이전 경로를 참조하는 패널이 없어지므로 해제된다', () => {
    // 판 이전에는 이것이 **규칙**이었다("파일이 바뀌면 이전 파일의 감시를 먼저
    // 푼다"). 이제는 참조 카운트 규칙의 한 사례다 — 해제의 근거가 "경로가
    // 바뀌었다"에서 "그 경로를 참조하는 패널이 하나도 없다"로 옮겨졌다.
    mount();
    openDocs(['/w/a.md', 'a\n']);
    act(() => {
      workspace().openInActivePanel('/w/b.md', 'b\n');
    });

    expect(calls.unwatch).toEqual(['/w/a.md']);
    expect(watchedPaths()).toEqual(['/w/a.md', '/w/b.md']);
  });

  it('그러나 다른 패널이 그 문서를 붙들고 있으면 갈아타도 풀리지 않는다', () => {
    // 규칙이 "경로가 바뀌면 푼다"였다면 이 경우에도 풀려서 보조 패널의 문서가
    // 감시를 잃는다. 두 규칙을 갈라놓는 것이 정확히 이 사례다.
    mount();
    openDocs(['/w/a.md', 'a\n']);
    const first = workspace().panels[0]!;
    act(() => {
      const extra: PanelState = {
        panelId: 'panel-shadow',
        documentId: first.documentId,
        displayMode: 'wysiwyg',
      };
      useWorkspaceStore.setState({ panels: [...workspace().panels, extra] });
    });

    act(() => {
      workspace().setActivePanel(first.panelId);
      workspace().openInActivePanel('/w/b.md', 'b\n');
    });

    expect(calls.unwatch, '다른 패널이 참조 중인 문서의 감시가 풀렸다').toEqual([]);
    expect(watchedPaths().sort()).toEqual(['/w/a.md', '/w/b.md']);
  });

  it('내용만 바뀌면 재등록하지 않는다', () => {
    mount();
    openDocs(['/w/a.md', 'a\n']);
    const docId = workspace().panels[0]!.documentId;

    act(() => {
      workspace().editDocument(docId, 'a edited\n');
    });

    expect(calls.watch).toHaveLength(1);
  });
});

describe('버퍼 기준 동기화 — 문서별', () => {
  it('내용이 바뀌면 그 문서의 경로로 main에 알린다', () => {
    mount();
    openDocs(['/w/a.md', 'v1\n'], ['/w/b.md', 'B\n']);
    const aDoc = workspace().panels[0]!.documentId;

    act(() => {
      workspace().editDocument(aDoc, 'v2\n');
    });

    expect(calls.note, '다른 문서까지 통지했거나 통지가 없다').toEqual([['/w/a.md', 'v2\n']]);
  });

  it('등록 시점 내용은 중복 통지하지 않는다', () => {
    mount();
    openDocs(['/w/a.md', 'v1\n']);
    expect(calls.note).toEqual([]);
  });
});

describe('미저장 편집 전달 — REQ-WS-028 / REQ-PANEL-052', () => {
  it('dirty 상태가 그 문서의 조정 상태에 전달된다', () => {
    mount();
    openDocs(['/w/a.md', 'a\n'], ['/w/b.md', 'b\n']);
    const aDoc = workspace().panels[0]!.documentId;

    act(() => {
      workspace().editDocument(aDoc, 'a 편집\n');
    });

    expect(reconciliation().stateFor('/w/a.md')?.isDirty).toBe(true);
    expect(reconciliation().stateFor('/w/b.md')?.isDirty, '남의 dirty가 옮았다').toBe(false);
  });

  it('dirty일 때 외부 변경이 버퍼를 교체하지 않는다', () => {
    // 이 배선이 없으면 정책이 언제나 깨끗한 버퍼로 판단해 자동 반영하고
    // 사용자의 미저장 편집이 확인 없이 사라진다.
    const applied: string[] = [];
    mount();
    openDocs(['/w/a.md', 'a\n']);
    const aDoc = workspace().panels[0]!.documentId;
    act(() => {
      workspace().editDocument(aDoc, 'a 편집\n');
    });
    reconciliation().setEffectHandlerFor('/w/a.md', (e) => {
      if (e.kind === 'apply-to-buffer') applied.push(e.content);
    });

    act(() => {
      for (const s of calls.subscribers) {
        s({ path: '/w/a.md', kind: 'changed', content: 'disk\n', decodeError: null, size: 5, mtimeMs: 1 });
      }
    });

    expect(applied, '미저장 편집이 있는데 버퍼가 교체됐다').toEqual([]);
    expect(reconciliation().stateFor('/w/a.md')?.status).toBe('held-notify');
  });
});

describe('채널 구독 — C-3', () => {
  it('마운트 시 구독하고 언마운트 시 해제한다', () => {
    mount();
    openDocs(['/w/a.md', 'a\n']);
    expect(calls.subscribers).toHaveLength(1);

    act(() => root.unmount());

    expect(calls.unsubscribed).toBe(1);
    // afterEach의 재-unmount가 던지지 않도록 새 루트를 세운다.
    root = createRoot(host);
  });

  it('언마운트하면 열려 있던 모든 문서의 감시를 푼다', () => {
    mount();
    openDocs(['/w/a.md', 'a\n'], ['/w/b.md', 'b\n']);

    act(() => root.unmount());

    expect(calls.unwatch.sort()).toEqual(['/w/a.md', '/w/b.md']);
    root = createRoot(host);
  });

  it('올라온 변경이 그 문서의 조정 계층에 도달한다', () => {
    mount();
    openDocs(['/w/a.md', 'a\n']);
    const applied: string[] = [];
    reconciliation().setEffectHandlerFor('/w/a.md', (e) => {
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
