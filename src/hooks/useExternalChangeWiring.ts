import { useEffect, useRef } from 'react';
import { pathKey } from '@shared/pathIdentity';
import { attachExternalChangeChannel } from '../store/externalChangeChannel';
import { useReconciliationStore } from '../store/reconciliationStore';
import { isDirty as isDocumentDirty, openDocuments, useWorkspaceStore } from '../store/workspaceStore';

/**
 * main의 외부 변경 채널을 조정 계층에 잇는다 (SPEC-V03-WORKSPACE-001 M8).
 *
 * 네 가지를 한다:
 *  1. **열린 모든 패널의 문서**를 main에 감시 등록하고 조정 계층의 열린 문서로
 *     등록한다. 등록·해제는 문서 단위이며 참조 카운트를 따른다 — 아래 참조.
 *  2. 올라온 확정 변경을 조정 상태 기계로 넘긴다 (구독 해제 클로저 준수, C-3).
 *  3. 각 문서의 미저장 편집 여부를 **그 문서의** 조정 상태에 전달한다.
 *  4. 저장·재로드로 버퍼 기준이 바뀌면 main에 알린다. 그러지 않으면 2단계 내용
 *     대조가 낡은 기준과 비교해 자기 저장을 외부 변경으로 오인한다.
 *
 * ## 왜 인자를 받지 않는가 (SPEC-V03-WORKSPACE-002 REQ-PANEL-050)
 *
 * 이전 판은 활성 문서의 경로 하나를 인자로 받아 그 하나만 등록했다. 패널이
 * 여럿이면 그 형태로는 나머지 패널의 문서를 알 방법이 없다 — 호출부가 활성
 * 문서만 알기 때문이다. 그래서 훅이 워크스페이스 스토어를 직접 구독하고 열린
 * 문서 집합을 스스로 판정한다.
 *
 * ## 참조 카운트 (REQ-PANEL-050)
 *
 * 등록은 **경로당 1회**, 해제는 **마지막 참조 패널이 닫힐 때 1회**다. 두 패널이
 * 같은 문서를 보면 `openDocuments`가 그 문서를 한 번만 돌려주므로 등록도 한
 * 번이고, 그중 한 패널이 닫혀도 목록에 남아 있으므로 해제가 일어나지 않는다.
 * 숫자 카운터를 따로 두지 않는 이유는 `workspaceStore.openDocuments`의 주석에 있다.
 *
 * 이전 판의 규칙("파일이 바뀌면 이전 파일의 감시를 먼저 푼다")은 **참조 카운트
 * 규칙의 한 사례로 흡수됐다** — 단일 패널이 문서를 갈아타면 이전 경로를 참조하는
 * 패널이 하나도 남지 않으므로 해제된다. 규칙 자체로 두면 보조 패널이 문서를 열
 * 때마다 첫 패널의 감시가 풀려 그 문서의 외부 변경이 영영 올라오지 않는다.
 *
 * ## 왜 차이만 반영하는가
 *
 * 이 effect는 **타건마다** 돈다(`documents` Map이 편집마다 교체되므로). 매번
 * 전부 재등록하면 등록 시점 내용 스냅샷이 무의미해지고 main의 감시가 계속
 * 끊겼다 이어진다. 그래서 들어온 경로만 등록하고 나간 경로만 해제한다.
 */
export function useExternalChangeWiring(): void {
  // 스토어의 두 슬라이스를 구독한다. 파생 배열을 selector에서 만들면 매 렌더마다
  // 새 참조가 나와 무한 렌더가 된다 — 파생은 effect 안에서 한다.
  const panels = useWorkspaceStore((s) => s.panels);
  const documents = useWorkspaceStore((s) => s.documents);

  /** 감시 등록된 문서 — 키는 경로 대조 키, 값은 main에 넘긴 **원본** 경로. */
  const watched = useRef(new Map<string, string>());
  /** 경로별 마지막으로 main에 알린 버퍼 기준. */
  const lastSynced = useRef(new Map<string, string>());
  /** 경로별 마지막으로 조정 계층에 전달한 미저장 여부. */
  const lastDirty = useRef(new Map<string, boolean>());

  useEffect(() => {
    // Map **참조**를 붙잡아 둔다. `.current`는 재대입되지 않고 내용만 바뀌므로
    // 정리 시점에도 최신 내용을 본다 — 지연 읽기 경고를 피하면서 의미는 같다.
    const registered = watched.current;
    const syncedMarks = lastSynced.current;
    const dirtyMarks = lastDirty.current;
    const detach = attachExternalChangeChannel(window.api);
    return () => {
      detach();
      // 표면이 사라지면 열려 있던 문서의 등록을 전부 거둔다. 남겨 두면 닫힌
      // 창의 문서 변경이 계속 올라온다.
      const store = useReconciliationStore.getState();
      for (const path of registered.values()) {
        store.dispatchFor(path, { type: 'document-synced' });
        store.closeDocument(path);
        void window.api.unwatchOpenFile(path).catch(() => {});
      }
      registered.clear();
      syncedMarks.clear();
      dirtyMarks.clear();
    };
  }, []);

  useEffect(() => {
    const open = openDocuments(useWorkspaceStore.getState());
    const store = useReconciliationStore.getState();
    const live = new Set(open.map((doc) => pathKey(doc.path!)));

    // 나간 문서 — 참조하는 패널이 하나도 남지 않은 경로만 해제한다.
    for (const [key, path] of [...watched.current]) {
      if (live.has(key)) continue;
      watched.current.delete(key);
      lastSynced.current.delete(key);
      lastDirty.current.delete(key);
      store.closeDocument(path);
      void window.api.unwatchOpenFile(path).catch(() => {});
    }

    for (const doc of open) {
      const path = doc.path!;
      const key = pathKey(path);

      // 들어온 문서 — 다른 경로의 등록은 건드리지 않는다.
      if (!watched.current.has(key)) {
        watched.current.set(key, path);
        lastSynced.current.set(key, doc.content);
        store.openDocument(path);
        void window.api.watchOpenFile(path, doc.content).catch(() => {
          // 신뢰 밖 경로 등으로 등록에 실패하면 조정 없이 편집만 계속된다.
        });
      }

      // 미저장 편집 여부를 **그 문서의** 조정 상태에 전달한다(REQ-PANEL-052).
      //
      // 이것이 없으면 정책이 언제나 "깨끗한 버퍼"로 판단해 자동 반영하고,
      // 사용자의 미저장 편집이 확인 없이 사라진다 — REQ-WS-028이 타협 불가라고
      // 못박은 결과다. 값이 바뀔 때만 보내는 이유는 리듀서가 `dirty-changed`마다
      // 새 상태 객체를 내므로 매번 보내면 타건마다 구독자가 깨어나기 때문이다.
      const dirty = isDocumentDirty(doc);
      if (lastDirty.current.get(key) !== dirty) {
        lastDirty.current.set(key, dirty);
        store.dispatchFor(path, { type: 'dirty-changed', isDirty: dirty });
      }

      if (lastSynced.current.get(key) !== doc.content) {
        lastSynced.current.set(key, doc.content);
        void window.api.noteOpenFileContent(path, doc.content).catch(() => {});
      }
    }
  }, [panels, documents]);
}
