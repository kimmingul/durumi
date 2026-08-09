import { Fragment, useCallback, useEffect, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { EditorToolbar } from './EditorToolbar';
import { MarkdownEditor } from '../editor/MarkdownEditor';
import { useAppStore } from '../store/appStore';
import {
  useWorkspaceStore,
  type DocumentState,
  type PanelId,
  type PanelState,
} from '../store/workspaceStore';
import type { Macro } from '@shared/ipc-contract';

/**
 * 중앙 영역의 패널 컨테이너 (SPEC-V03-WORKSPACE-002 M2).
 *
 * ## 축퇴(AC-PANEL-003b)와 분할 보존(AC-PANEL-005)은 서로를 당긴다
 *
 * 초판은 패널이 하나면 래퍼 없이 패널만 렌더해 DOM을 오늘과 **바이트 동일**하게
 * 만들었다. 그러면 패널이 1→2→1로 오갈 때 살아남는 패널의 서브트리가 **재부모화
 * (re-parent)** 되고, React가 그것을 언마운트·재마운트한다 — `EditorView`가 새로
 * 만들어져 **캐럿·스크롤·실행 취소 이력이 사라진다.** 실측했다: 분할했다 닫은 뒤
 * 패널 A의 캐럿이 3에서 0으로 돌아갔다.
 *
 * 두 성질은 **동시에 성립할 수 없다.** 살아남는 패널의 서브트리는 (a) 단일 패널일
 * 때 래퍼를 한 겹 얻거나, (b) 전환 때 재부모화되거나 둘 중 하나다.
 *
 * **(a)를 택했다.** 근거: `AC-PANEL-005`는 사용자가 실제로 잃는 것(캐럿·스크롤)을
 * 막는 **동작** 기준이고, `AC-PANEL-003b`의 문언은 "좌·중앙·우 **가로 배치**"와
 * "패널 다중화를 시사하는 **시각 요소**"를 말한다 — 스타일 없는 통과용 노드 한 겹은
 * 배치도 시각 요소도 바꾸지 않는다. 분할할 때마다 캐럿이 문서 맨 앞으로 튀는 것은
 * 사용자가 확실히 알아채는 회귀이고, 보이지 않는 `<div>` 한 겹은 그렇지 않다.
 *
 * 그 한 겹은 기준선 픽스처에 **명시적으로 기록**되어 있다(`panelContainerWrapper`).
 *
 * ## 탭은 없다
 *
 * `OQ-7`의 잠정 권고에 따라 v0.3은 탭 축을 도입하지 않는다. 탭은 `design.md`
 * §6.4가 기각한 "보이지 않는 배너" 문제를 되살린다 — 외부 변경 배너가 숨은 탭에
 * 붙으면 사용자가 모른 채 그 위에 저장한다.
 */

export interface PanelContainerProps {
  panels: readonly PanelState[];
  documentOfPanel: (panel: PanelState) => DocumentState | null;
  macros: Macro[];
  /** 그 패널의 편집 표면이 준비되었다. 활성 패널 판정과 사이드바 귀속에 쓰인다. */
  onPanelViewReady: (panelId: PanelId, view: EditorView | null) => void;
  onOpenCitePalette: () => void;
  onPickImage: () => void;
}

export function PanelContainer({
  panels,
  documentOfPanel,
  macros,
  onPanelViewReady,
  onOpenCitePalette,
  onPickImage,
}: PanelContainerProps) {
  const rendered = panels.map((panel, index) => (
    <Fragment key={panel.panelId}>
      {index > 0 ? <PanelResizer /> : null}
      <Panel
        panel={panel}
        document={documentOfPanel(panel)}
        macros={macros}
        onViewReady={onPanelViewReady}
        onOpenCitePalette={onOpenCitePalette}
        onPickImage={onPickImage}
      />
    </Fragment>
  ));

  // 컨테이너는 패널 수와 무관하게 **언제나 같은 노드**다. 그래야 1↔2 전환에서
  // 살아남는 패널이 재부모화되지 않고 캐럿·스크롤·실행 취소가 보존된다.
  return (
    <div
      data-panel-container
      style={{ flex: 1, display: 'flex', flexDirection: 'row', minWidth: 0 }}
    >
      {rendered}
    </div>
  );
}

/**
 * 패널 사이의 리사이저.
 *
 * `flex-shrink: 0`으로 고정 폭을 차지하므로, 사용 가능한 가로 공간의 등식은
 * **패널 폭의 합 + 리사이저 폭의 합 = 컨테이너 폭**이다(AC-PANEL-005). 패널 폭만의
 * 등식은 도달 불가하다.
 */
function PanelResizer() {
  return (
    <div
      data-panel-resizer
      role="separator"
      aria-orientation="vertical"
      style={{ flexGrow: 0, flexShrink: 0, flexBasis: PANEL_RESIZER_WIDTH_PX, width: PANEL_RESIZER_WIDTH_PX, cursor: 'col-resize' }}
    />
  );
}

/** 리사이저 하나가 차지하는 고정 폭. AC-PANEL-005의 등식이 이 값을 쓴다. */
export const PANEL_RESIZER_WIDTH_PX = '4px';

interface PanelProps {
  panel: PanelState;
  document: DocumentState | null;
  macros: Macro[];
  onViewReady: (panelId: PanelId, view: EditorView | null) => void;
  onOpenCitePalette: () => void;
  onPickImage: () => void;
}

/**
 * 패널 하나 — 자기 툴바와 자기 편집 표면을 갖는다.
 *
 * 내용·미저장 여부는 **문서**가 소유하므로(REQ-PANEL-010) 편집은 문서 식별자로
 * 보낸다. 캐럿·선택·스크롤·실행 취소는 CodeMirror의 `EditorState`에 붙어 뷰마다
 * 자연히 갈라진다(REQ-PANEL-001, `design.md` §2.1a).
 */
function Panel({
  panel,
  document: doc,
  macros,
  onViewReady,
  onOpenCitePalette,
  onPickImage,
}: PanelProps) {
  const editMode = useAppStore((s) => s.editMode);
  // 툴바는 **자기 패널의** 뷰에 작용한다. 전역 뷰 하나를 겨냥하면 활성 패널이
  // 아닌 패널의 툴바가 남의 문서를 고친다.
  const [view, setView] = useState<EditorView | null>(null);

  const handleReady = useCallback(
    (ready: EditorView) => {
      setView(ready);
      onViewReady(panel.panelId, ready);
    },
    [onViewReady, panel.panelId],
  );

  useEffect(() => () => onViewReady(panel.panelId, null), [onViewReady, panel.panelId]);

  const handleChange = useCallback(
    (next: string) => {
      if (doc) useWorkspaceStore.getState().editDocument(doc.id, next);
    },
    [doc],
  );

  return (
    <div
      style={{ flex: 1, overflow: 'auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}
    >
      <EditorToolbar
        view={view}
        visible={editMode === 'wysiwyg'}
        onOpenCitePalette={onOpenCitePalette}
        onPickImage={onPickImage}
      />
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <MarkdownEditor
          value={doc?.content ?? ''}
          onChange={handleChange}
          onReady={handleReady}
          filePath={doc?.path ?? null}
          macros={macros}
          editMode={editMode}
        />
      </div>
    </div>
  );
}
