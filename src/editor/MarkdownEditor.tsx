import 'katex/dist/katex.min.css';
import { useEffect, useRef, useState } from 'react';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
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
  grammarDescriptionFor,
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
  /**
   * 컴파트먼트에 **실제로 실려 있는** 조합 — 종류와 언어 문법.
   * 마운트 재설정과 무의미한 재설정을 건너뛰는 데 쓴다.
   *
   * 둘을 **한 정체성으로 묶는** 것이 핵심이다. 각각을 독립 조건으로 삼으면
   * 하나의 전환(보조+Python → 원고)이 두 번의 재설정을 낸다 — 종류가 먼저 바뀌고
   * 이어서 문법이 `null`로 떨어지기 때문이다. 재설정은 층을 통째로 갈아끼우므로
   * ViewPlugin이 즉시 파기·재생성되며, 아래 마운트 스킵 주석이 배제한 낭비가
   * 그대로 재현된다.
   */
  const appliedRef = useRef<{ kind: FileKind; grammar: Extension | null }>({
    kind,
    grammar: null,
  });
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
  const layerDeps = (
    forKind: FileKind,
    forMode: EditMode,
    forGrammar: Extension | null,
  ): ExtensionLayerDeps => ({
    kind: forKind,
    editMode: forMode,
    macros,
    macroCompartment: macroCompartmentRef.current,
    editModeCompartment: editModeCompartmentRef.current,
    filePathRef,
    onChange,
    onHeadingHint: (show) => useAppStore.getState().setHeadingHint(show),
    grammar: forGrammar,
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
          // 마운트 시점의 문법은 **항상 `null`**이다 — 적재가 비동기라 첫
          // 조립을 기다려 줄 수 없다. 문법이 있는 파일도 그 한 순간은 평문으로
          // 열리고(REQ-PANEL-045의 상태), 해소되면 아래 이펙트가 갈아끼운다.
          layeredExtensions(layerDeps(kind, initialEditModeRef.current, null)),
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
  // (REQ-PANEL-042). 단계4에서 **언어 문법 축이 합류**했다 (REQ-PANEL-041·045).
  //
  // **이 갈아끼우기가 없으면 요구가 성립하지 않는다.** 편집 표면은 문서를 갈아타며
  // 재사용되므로(`MarkdownEditor`는 `key`를 받지 않는다 —
  // `PanelContainer.tsx`의 재바인딩 주석) `a.md`를 보던 패널에 `a.py`를 열면
  // 마운트 때 조립된 마크다운층이 그대로 남는다. 같은 이유로 `a.py`를 보던
  // 패널에 `b.json`을 열면 종류는 그대로여도 **문법**이 갈아 끼워져야 한다 —
  // 종류만 조건으로 삼으면 JSON 문서가 Python 문법을 쓴다.
  //
  // 마운트 실행은 건너뛴다 — 마운트 이펙트가 이미 같은 조합(종류 + 문법 `null`)
  // 으로 조립했고, 한 번 더 재설정하면 ViewPlugin이 즉시 파기·재생성되며 제목
  // 힌트 콜백이 두 번 불린다. 정체성 비교가 그 스킵을 담당한다.
  const applyLayers = (nextKind: FileKind, nextGrammar: Extension | null) => {
    const view = viewRef.current;
    if (!view) return;
    const applied = appliedRef.current;
    if (applied.kind === nextKind && applied.grammar === nextGrammar) return;
    appliedRef.current = { kind: nextKind, grammar: nextGrammar };
    view.dispatch({
      effects: kindCompartmentRef.current.reconfigure(
        layeredExtensions(layerDeps(nextKind, editMode, nextGrammar)),
      ),
    });
  };

  // SPEC-V03-WORKSPACE-002 M5 단계4 — 보조 패널의 언어 문법을 해소한다
  // (REQ-PANEL-041 조달 / REQ-PANEL-045 평문 폴백).
  //
  // 조회는 동기이지만 문법 **본체**는 지연 적재라(`extensionLayers.ts`
  // §언어 문법 조달) 해소 전에는 조립에 넣을 것이 없다. 그래서 두 걸음으로 간다:
  //
  //   ① 지금 **확실히 아는 것**을 즉시 적용한다 — 이미 적재된 문법이면 그것을,
  //      아니면 `null`(평문)을. 여기서 옛 문법을 그대로 두면 새 문서가 잠시
  //      **다른 언어의 문법**으로 칠해진다. 평문은 규정된 폴백 상태이지만
  //      "JSON 텍스트에 Python 토큰"은 내용에 대한 거짓 주장이다.
  //   ② 적재가 끝나면 그때 갈아끼운다.
  //
  // 같은 언어의 다른 파일로 갈아타는 경우(`.yaml` → `.yml`)는 카탈로그 항목이
  // 같아 `desc.support`가 동일 인스턴스이므로 ①에서 정체성 비교에 걸려
  // **재설정이 아예 일어나지 않는다**. 언어가 실제로 바뀔 때만 값을 치른다.
  //
  // **경합을 막는 것이 이 이펙트의 나머지 절반이다.** `.py`의 적재가 진행 중일 때
  // 패널이 `.csv`로 재바인딩되면, 뒤늦게 도착한 Python이 그대로 실려 **CSV 문서에
  // Python 문법이 붙는다**. 정리 함수가 세우는 `cancelled` 깃발이 그 늦은 도착을
  // 버린다 — 재바인딩은 동기이고 적재 완료는 반드시 그 뒤의 마이크로태스크이므로
  // 순서는 보장된다.
  useEffect(() => {
    // 마크다운 패널은 자기 언어층(`markdownLanguage`)을 가지므로 조회하지 않는다.
    // 경로가 없는 문서(untitled)도 마찬가지다 — 조회할 파일명이 없다.
    const desc = kind === 'auxiliary' ? grammarDescriptionFor(filePath) : null;
    // 카탈로그에 없는 확장자(`.csv`·`.bib`·미지 확장자)는 `desc`가 `null`이다.
    // 오류가 아니라 규정된 정상 경로이며(REQ-PANEL-045) 평문으로 열린다.
    applyLayers(kind, desc?.support ?? null);
    if (!desc || desc.support) return;
    let cancelled = false;
    void desc.load().then((support) => {
      // 늦게 도착했고 그 사이 패널이 갈아탔다면 버린다.
      if (!cancelled) applyLayers(kind, support);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, filePath]);

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
