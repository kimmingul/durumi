import { Fragment, useCallback, useEffect, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { EditorToolbar } from './EditorToolbar';
import { ReconciliationSurface } from './ReconciliationSurface';
import { MarkdownEditor } from '../editor/MarkdownEditor';
import {
  displayModeOf,
  documentOf,
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
        index={index}
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
  /** 렌더 순서에서의 위치 (0-based). 지목 수단의 위치 축이다. */
  index: number;
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
  index,
  document: doc,
  macros,
  onViewReady,
  onOpenCitePalette,
  onPickImage,
}: PanelProps) {
  // 활성 여부는 **스토어가 진실**이다. prop으로 내리면 `PanelContainer`가
  // `activePanelId`를 구독해야 하고, 그러면 활성 패널이 바뀔 때마다 모든 패널이
  // 다시 렌더된다.
  const isActive = useWorkspaceStore((s) => s.activePanelId === panel.panelId);
  // 표시 모드는 **이 패널의 것**이다(REQ-PANEL-021). 창 전역 값 하나를 읽으면 한
  // 패널의 모드 변경이 모든 패널을 규정한다.
  //
  // 보조 패널의 실효 모드는 `markdown`이 되고(REQ-PANEL-022) 그 한 줄이
  // `decorationsForMode('markdown') === []`를 통해 라이브 데코레이션 집합을
  // 비운다 — 데코레이션을 끄는 축을 따로 만들지 않았다.
  const editMode = useWorkspaceStore((s) => displayModeOf(s, panel.panelId));
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

  // 편집은 **호출 시점에** 그 패널의 현재 문서로 간다 — 렌더 시점의 `doc`을
  // 가두면 안 된다.
  //
  // 편집 표면은 문서를 갈아타며 **재사용된다**: `MarkdownEditor`는 `key`를 받지
  // 않고, 그 안의 CodeMirror `updateListener`는 마운트 시점의 `onChange`를
  // 영구히 붙든다(`MarkdownEditor.tsx`의 마운트 이펙트는 deps가 `[]`다). 그래서
  // 이 콜백이 렌더 스코프의 `doc`을 닫아 버리면, 패널이 다른 문서로 재바인딩된
  // 뒤에도 **처음 마운트 때의 문서 식별자**로 편집을 계속 보낸다.
  //
  // 그 식별자는 이미 사라지고 없다 — `openInActivePanel`의 `bind`가 새 문서를
  // 만들고 아무도 참조하지 않게 된 옛 문서를 거둔다. `editDocument`는 없는
  // 문서를 **조용히 무시하므로**(`withDocument`의 이른 반환) 오류도 나지 않고,
  // 문서는 영원히 clean으로 남는다. 그러면 조정 정책이 미저장 편집을 보지 못해
  // 외부 변경을 자동 반영하고 사용자의 편집이 확인 없이 사라진다 —
  // REQ-WS-028이 타협 불가라고 못박은 결과다.
  const handleChange = useCallback(
    (next: string) => {
      const current = documentOf(useWorkspaceStore.getState(), panel.panelId);
      if (current) useWorkspaceStore.getState().editDocument(current.id, next);
    },
    [panel.panelId],
  );

  return (
    <div
      /*
        패널 지목 수단 (REQ-PANEL-053·054의 계약 산출물, `plan.md` §B.8).

        `panelId`는 런타임 생성 문자열이라 e2e가 예측할 수 없다. 그래서 지목 축은
        **위치**(`data-panel-index`)와 **활성 여부**(`data-panel-active`) 둘이다.
        표식은 패널의 **최외곽**에 붙는다 — 그래야 배너·툴바·편집 표면이 전부 그
        하위에 들어와 "패널 A 영역 안"이라는 AC 문언이 판정 가능해진다.

        세 속성 모두 스타일을 갖지 않는다. 이 노드는 M2가 이미 렌더하던 중앙 열
        그대로이며 표식만 얹었다 — 노드를 새로 끼우면 1↔2 전환에서 재부모화가
        일어나 캐럿·스크롤·실행 취소가 사라진다(AC-PANEL-005).
      */
      data-panel=""
      data-panel-index={String(index)}
      data-panel-active={isActive ? '' : undefined}
      style={{ flex: 1, overflow: 'auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}
    >
      <EditorToolbar
        view={view}
        visible={editMode === 'wysiwyg'}
        onOpenCitePalette={onOpenCitePalette}
        onPickImage={onPickImage}
      />
      {/*
        조정 배너는 **이 패널의 문서**의 것이다(REQ-PANEL-053). 창 전역 배너
        하나로 두면 활성 문서에만 결속되어, 비활성 패널의 문서가 외부에서 바뀌어도
        사용자가 알 수 없고 그 위에 저장하면 편집이 사라진다.

        배너는 편집 표면을 감싸는 상자 **밖**에 둔다 — 그 상자의
        `onFocusCapture`가 활성 패널을 바꾸므로, 안에 두면 배너 버튼을 누르는
        것만으로 활성 패널이 옮겨간다(AC-PANEL-053c).

        idle이면 `ReconciliationSurface`가 `null`을 돌려주므로 노드가 생기지
        않는다 — 알림이 없는 평상시 DOM은 오늘과 같다.
      */}
      <ReconciliationSurface path={doc?.path ?? null} />
      {/*
        활성 패널은 **가장 최근에 편집 포커스를 받은 패널**이다(REQ-PANEL-030).
        그래서 이 핸들러는 편집 표면을 감싸는 상자에만 붙는다 — 툴바·사이드바·
        상태바로 포커스가 옮겨가는 것은 활성 패널을 바꾸지 않는다(AC-PANEL-030b).
        툴바 버튼을 누르려고 포커스가 떠나는 것이 활성 패널을 잃는 것이어서는
        안 된다.

        핸들러는 렌더 스코프를 닫지 않고 **호출 시점에** 스토어를 읽는다.
      */}
      <div
        style={{ flex: 1, overflow: 'auto', minHeight: 0 }}
        onFocusCapture={() => useWorkspaceStore.getState().setActivePanel(panel.panelId)}
      >
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
