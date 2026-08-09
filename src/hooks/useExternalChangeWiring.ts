import { useEffect, useRef } from 'react';
import { attachExternalChangeChannel } from '../store/externalChangeChannel';
import { useReconciliationStore } from '../store/reconciliationStore';

/**
 * main의 외부 변경 채널을 조정 계층에 잇는다 (SPEC-V03-WORKSPACE-001 M8).
 *
 * 세 가지를 한다:
 *  1. 열린 파일의 감시를 main에 등록·해제하고, 같은 경로를 조정 계층의
 *     **열린 문서**로 등록한다. 파일이 바뀌면 이전 파일의 감시와 등록을 먼저
 *     푼다 — 남겨 두면 닫힌 파일의 변경이 계속 올라온다.
 *  2. 올라온 확정 변경을 조정 상태 기계로 넘긴다 (구독 해제 클로저 준수, C-3).
 *  3. 미저장 편집 여부를 그 문서의 조정 상태에 전달한다.
 *
 * 저장·재로드로 버퍼 기준이 바뀌면 main에 알린다. 그러지 않으면 2단계 내용
 * 대조가 낡은 기준과 비교해 자기 저장을 외부 변경으로 오인한다.
 *
 * 열린 문서 등록이 여기 있는 이유(SPEC-V03-WORKSPACE-002 REQ-PANEL-070):
 * main의 브로드캐스트는 모든 창에 가므로 조정 계층이 "이 창이 실제로 열고 있는
 * 경로"를 알아야 나머지를 폐기할 수 있다. 그 목록의 출처는 감시 등록과 같다.
 */
export function useExternalChangeWiring(
  filePath: string | null,
  content: string,
  isDirty: boolean,
): void {
  const lastSynced = useRef<string | null>(null);
  const filePathRef = useRef<string | null>(filePath);
  filePathRef.current = filePath;

  useEffect(() => {
    const detach = attachExternalChangeChannel(window.api);
    return () => {
      detach();
      useReconciliationStore
        .getState()
        .dispatchFor(filePathRef.current, { type: 'document-synced' });
    };
  }, []);

  useEffect(() => {
    if (!filePath) return;
    lastSynced.current = content;
    useReconciliationStore.getState().openDocument(filePath);
    void window.api.watchOpenFile(filePath, content).catch(() => {
      // 신뢰 밖 경로 등으로 등록에 실패하면 조정 없이 편집만 계속된다.
    });
    return () => {
      useReconciliationStore.getState().closeDocument(filePath);
      void window.api.unwatchOpenFile(filePath).catch(() => {});
    };
    // content는 등록 시점 스냅샷으로만 쓴다 — 변경마다 재등록하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  // 미저장 편집 여부를 조정 계층에 전달한다.
  //
  // 이것이 없으면 정책이 언제나 "깨끗한 버퍼"로 판단해 자동 반영하고,
  // 사용자의 미저장 편집이 확인 없이 사라진다 — REQ-WS-028이 타협 불가라고
  // 못박은 바로 그 결과다. CI의 AC-WS-019/022 실패가 이 누락을 드러냈다.
  //
  // `filePath`도 deps에 있는 이유: 조정 상태가 문서별이 된 뒤로는 문서가 바뀌면
  // **새 문서의** 상태에 현재 dirty 여부를 다시 실어야 한다. `isDirty`만 보면
  // 값이 우연히 같을 때 새 문서가 기본값으로 남는다.
  useEffect(() => {
    useReconciliationStore.getState().dispatchFor(filePath, { type: 'dirty-changed', isDirty });
  }, [filePath, isDirty]);

  useEffect(() => {
    if (!filePath) return;
    if (lastSynced.current === content) return;
    lastSynced.current = content;
    void window.api.noteOpenFileContent(filePath, content).catch(() => {});
  }, [filePath, content]);
}
