import { useEffect, useRef } from 'react';
import { attachExternalChangeChannel } from '../store/externalChangeChannel';
import { useReconciliationStore } from '../store/reconciliationStore';

/**
 * main의 외부 변경 채널을 조정 계층에 잇는다 (SPEC-V03-WORKSPACE-001 M8).
 *
 * 두 가지를 한다:
 *  1. 열린 파일의 감시를 main에 등록·해제한다. 파일이 바뀌면 이전 파일의
 *     감시를 먼저 푼다 — 남겨 두면 닫힌 파일의 변경이 계속 올라온다.
 *  2. 올라온 확정 변경을 조정 상태 기계로 넘긴다 (구독 해제 클로저 준수, C-3).
 *
 * 저장·재로드로 버퍼 기준이 바뀌면 main에 알린다. 그러지 않으면 2단계 내용
 * 대조가 낡은 기준과 비교해 자기 저장을 외부 변경으로 오인한다.
 */
export function useExternalChangeWiring(filePath: string | null, content: string): void {
  const lastSynced = useRef<string | null>(null);

  useEffect(() => {
    const detach = attachExternalChangeChannel(window.api);
    return () => {
      detach();
      useReconciliationStore.getState().dispatch({ type: 'document-synced' });
    };
  }, []);

  useEffect(() => {
    if (!filePath) return;
    lastSynced.current = content;
    void window.api.watchOpenFile(filePath, content).catch(() => {
      // 신뢰 밖 경로 등으로 등록에 실패하면 조정 없이 편집만 계속된다.
    });
    return () => {
      void window.api.unwatchOpenFile(filePath).catch(() => {});
    };
    // content는 등록 시점 스냅샷으로만 쓴다 — 변경마다 재등록하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  useEffect(() => {
    if (!filePath) return;
    if (lastSynced.current === content) return;
    lastSynced.current = content;
    void window.api.noteOpenFileContent(filePath, content).catch(() => {});
  }, [filePath, content]);
}
