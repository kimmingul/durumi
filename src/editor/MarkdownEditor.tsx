import 'katex/dist/katex.min.css';
import { useEffect, useRef, useState } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { attachReconciliationCompositionGate } from './compositionGate';
import { registerReconciliationExecutor } from './applyExternalChange';
import { useReconciliationStore } from '../store/reconciliationStore';
import type { Macro } from '@shared/ipc-contract';
import type { FileKind } from '@shared/fileKind';
import { EditMode, setEditMode } from './editMode';
import { setDocPath } from './docPath';
import { buildMacroKeymap } from './keymap/macros';
import { useAppStore } from '../store/appStore';
import {
  decorationsForMode,
  layeredExtensions,
  type ExtensionLayerDeps,
} from './extensionLayers';

export interface MarkdownEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onReady?: (view: EditorView) => void;
  filePath?: string | null;
  macros?: Macro[];
  editMode?: EditMode;
  /**
   * 이 패널이 보는 문서의 종류 (REQ-PANEL-040·042).
   *
   * **경로에서 파생하지 않는다.** `fileKindOf('')`는 확장자를 증명할 수 없는
   * 입력을 보조로 떨어뜨리므로(`shared/fileKind.ts`), 아직 저장된 적 없는
   * 문서(`filePath === null`)에 그것을 적용하면 새 원고가 전부 평문 패널로
   * 열린다. 종류의 출처는 **문서**이며(`workspaceStore`의 `DocumentState.kind`),
   * untitled 문서는 거기서 `markdown`으로 만들어진다. 여기 기본값이 `markdown`인
   * 것도 같은 이유다.
   */
  kind?: FileKind;
}

export function MarkdownEditor({
  value,
  onChange,
  onReady,
  filePath = null,
  macros = [],
  editMode = 'wysiwyg',
  kind = 'markdown',
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // 뷰 준비 신호. 조정 라우팅 등록이 `filePath` 변화 **와** 뷰 준비 양쪽에
  // 결속되어야 하므로(REQ-PANEL-070a) deps에 넣을 수 있는 형태로 노출한다.
  const [readyView, setReadyView] = useState<EditorView | null>(null);
  const filePathRef = useRef<string | null>(filePath);
  const macroCompartmentRef = useRef<Compartment>(new Compartment());
  const editModeCompartmentRef = useRef<Compartment>(new Compartment());
  // 종류 축의 컴파트먼트. **층 전체**를 담는다 — 공통층만 밖에 두면 층별로
  // 묶인 순서가 오늘의 배열 순서와 달라지고, CodeMirror에서 순서는 우선순위다
  // (`extensionLayers.ts` 헤더). 통째로 담으면 24항목의 상대 순서가 그대로다.
  //
  // 재설정이 안전하다는 것은 실측했다: 모듈 스코프 StateField(실행 취소 이력,
  // `editModeField`, `docPathField`)의 값과 문서·선택이 재설정을 넘어 보존된다.
  const kindCompartmentRef = useRef<Compartment>(new Compartment());
  /** 컴파트먼트에 **실제로 실려 있는** 종류. 마운트 재설정을 건너뛰는 데 쓴다. */
  const appliedKindRef = useRef<FileKind>(kind);
  const initialEditModeRef = useRef<EditMode>(editMode);

  useEffect(() => {
    filePathRef.current = filePath;
    // Threads the doc path into the editor's StateField so widgets that
    // need to resolve workspace-relative paths (image src today, future
    // PDF embed) can read it at decoration-build time.
    const view = viewRef.current;
    if (view) view.dispatch({ effects: setDocPath.of(filePath) });
  }, [filePath]);

  // 조립 입력. 층 구성 자체는 `extensionLayers.ts`가 소유하고, 여기서는 이
  // 컴포넌트만 아는 값(컴파트먼트 · 경로 ref · 콜백)을 붙인다.
  const layerDeps = (forKind: FileKind, forMode: EditMode): ExtensionLayerDeps => ({
    kind: forKind,
    editMode: forMode,
    macros,
    macroCompartment: macroCompartmentRef.current,
    editModeCompartment: editModeCompartmentRef.current,
    filePathRef,
    onChange,
    onHeadingHint: (show) => useAppStore.getState().setHeadingHint(show),
  });

  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: value,
      // 3층 조립 (REQ-PANEL-042). 층 전체가 종류 컴파트먼트 안에 들어가므로
      // `EditorState`의 최상위 항목은 하나지만, **조립 결과**(AC-PANEL-042가
      // 조회하는 대상)는 컴파트먼트가 담고 있는 24 / 11항목이다.
      extensions: [
        kindCompartmentRef.current.of(
          layeredExtensions(layerDeps(kind, initialEditModeRef.current)),
        ),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    // Seed the docPath field with the prop value so widgets created on
    // the first paint (e.g. an image already in the initial document)
    // resolve correctly. Subsequent changes go through the filePath effect.
    if (filePath !== null) view.dispatch({ effects: setDocPath.of(filePath) });
    setReadyView(view);
    onReady?.(view);
    return () => {
      setReadyView(null);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SPEC-V03-WORKSPACE-002 M0 — 조정 라우팅 등록과 조합 게이트.
  //
  // **등록은 `filePath` 변화 *와* 뷰 준비 양쪽에 결속된다**(REQ-PANEL-070a·070b,
  // `design.md` §6.2a). 둘 중 하나만으로는 부족하다:
  //  - `[]`에 두면 경로가 첫 마운트에 캡처된다. 상위가 `key`를 주지 않으므로
  //    (`src/App.tsx`) 하나의 `EditorView`가 문서를 갈아타며 재사용되고, 옛
  //    경로의 변경이 이 패널로 들어온다.
  //  - `[filePath]`에만 두면 마운트 시 뷰가 아직 없어 몸통을 건너뛰는데,
  //    **경로를 이미 가진 채 마운트된 패널**은 이후 `filePath`가 변하지 않아
  //    재실행도 없다 — 그 문서는 외부 변경을 영영 받지 못한다.
  //
  // 경로가 없는 문서(untitled)는 등록하지 않는다 — null을 키로 쓰면 서로 다른
  // untitled 문서가 같은 라우팅 키를 공유한다(REQ-PANEL-070b).
  useEffect(() => {
    if (!readyView) return;
    const path = filePath;
    const detachExecutor =
      path === null
        ? null
        : registerReconciliationExecutor(readyView, (h) =>
            useReconciliationStore.getState().setEffectHandlerFor(path, h),
          );
    // SPEC-V03-WORKSPACE-001 REQ-WS-020: 조합이 열려 있는 동안 외부 변경
    // 조정이 문서를 건드리지 못하게 막는다. 게이트 자체의 계약은
    // `src/editor/compositionGate.ts`와 그 테스트가 고정한다.
    const compositionGate = attachReconciliationCompositionGate(
      readyView.contentDOM,
      () => filePathRef.current,
    );
    return () => {
      // REQ-PANEL-071a — 택한 규정: **조합 보류 해제가 실행자 분리보다 먼저**.
      // 순서를 뒤집으면 detach의 해제가 드레인한 `apply-to-buffer`가
      // `reconciliationStore`의 `handler?.(effect)`에서 옵셔널 체이닝에 조용히
      // 삼켜지고 상태만 `settled`로 정착한다 — 버퍼는 변경을 받지 못했는데
      // 상태가 완료를 주장하는 조합이며, AC-PANEL-081c가 그것을 금지한다.
      compositionGate.detach();
      detachExecutor?.();
    };
  }, [filePath, readyView]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  // SPEC-V03-WORKSPACE-002 M5 단계3 — 종류가 바뀌면 층을 갈아끼운다
  // (REQ-PANEL-042).
  //
  // **이 이펙트가 없으면 요구가 성립하지 않는다.** 편집 표면은 문서를 갈아타며
  // 재사용되므로(`MarkdownEditor`는 `key`를 받지 않는다 —
  // `PanelContainer.tsx`의 재바인딩 주석) `a.md`를 보던 패널에 `a.py`를 열면
  // 마운트 때 조립된 마크다운층이 그대로 남는다.
  //
  // 마운트 실행은 건너뛴다 — 마운트 이펙트가 이미 같은 종류로 조립했고, 여기서
  // 한 번 더 재설정하면 ViewPlugin이 즉시 파기·재생성되며 제목 힌트 콜백이
  // 두 번 불린다.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (appliedKindRef.current === kind) return;
    appliedKindRef.current = kind;
    view.dispatch({
      effects: kindCompartmentRef.current.reconfigure(layeredExtensions(layerDeps(kind, editMode))),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: macroCompartmentRef.current.reconfigure(buildMacroKeymap(macros)),
    });
  }, [macros]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // v0.2.11 — snapshot caret + scroll BEFORE the reconfigure so we can
    // restore them after widgets remount under the new mode. Block widgets
    // (image, math, mermaid, table) have different heights between modes,
    // and replacing the decoration set rebuilds the viewport from scratch,
    // which can otherwise jump the caret line off-screen or to line 1.
    const docLen = view.state.doc.length;
    const sel = view.state.selection.main;
    const snapshot = {
      anchor: Math.min(sel.anchor, docLen),
      head: Math.min(sel.head, docLen),
      scrollTop: view.scrollDOM.scrollTop,
    };
    view.dispatch({
      effects: [
        editModeCompartmentRef.current.reconfigure(decorationsForMode(editMode)),
        setEditMode.of(editMode),
      ],
    });
    const newDocLen = view.state.doc.length;
    const safeAnchor = Math.min(snapshot.anchor, newDocLen);
    const safeHead = Math.min(snapshot.head, newDocLen);
    if (safeAnchor !== view.state.selection.main.anchor || safeHead !== view.state.selection.main.head) {
      view.dispatch({ selection: { anchor: safeAnchor, head: safeHead } });
    }
    // Two-step scroll restore: set synchronously so the natural value sticks
    // when widget heights match, then re-apply inside `requestMeasure` once
    // the new mode's widgets have laid out (heights may differ slightly
    // between Document/Live/Source).
    view.scrollDOM.scrollTop = snapshot.scrollTop;
    view.requestMeasure({
      read: () => view.scrollDOM.scrollTop,
      write: (current) => {
        if (Math.abs(current - snapshot.scrollTop) > 1) {
          view.scrollDOM.scrollTop = snapshot.scrollTop;
        }
      },
    });
  }, [editMode]);

  return <div ref={hostRef} className="cm-host" style={{ height: '100%' }} />;
}
