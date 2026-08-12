import type { Compartment, Extension } from '@codemirror/state';
import { EditorView, keymap, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages as lezerLangs } from '@codemirror/language-data';
import { GFM } from '@lezer/markdown';
import type { FileKind } from '@shared/fileKind';
import type { Macro } from '@shared/ipc-contract';
import { FrontMatterExtension } from './markdownExt/frontMatter';
import { FootnoteExtension } from './markdownExt/footnote';
import { TocExtension } from './markdownExt/toc';
import { InlineExtrasExtension } from './markdownExt/inlineExtras';
import { CitationExtension } from './markdownExt/citation';
import { CommentsExtension } from './markdownExt/comments';
import { CriticMarkupExtension } from './markdownExt/criticMarkup';
import { liveDecorations } from './decorations';
import { spellcheckExclusion } from './spellcheckExclusion';
import { markdownKeymap } from './keymap';
import { buildMacroKeymap } from './keymap/macros';
import { autoPair } from './keymap/autoPair';
import { enterListContinuation } from './keymap/listContinuation';
import { emojiAutocomplete } from './keymap/emojiAutocomplete';
import { viewModes } from './viewModes';
import { makeTheme } from './theme';
import { handlePaste, handleDrop } from './imagePaste';
import { atomicMediaExtension } from './atomicMedia';
import { atomicInlineMarksExtension } from './atomicInlineMarks';
import { citationAutocomplete } from './autocomplete/citationAutocomplete';
import { citationHoverTooltip } from './decorations/citationHover';
import { defaultGhostTextRefs, ghostTextExtension } from './ai/ghostText';
import { type EditMode, editModeStateExtension } from './editMode';
import { docPathStateExtension } from './docPath';
import { wysiwygEscapeFilter } from './wysiwygEscape';
import { headingHintPlugin } from './headingHint';

/**
 * 편집 표면 extension의 **3층 조립** (SPEC-V03-WORKSPACE-002 REQ-PANEL-042,
 * `design.md` §5.2).
 *
 * ## 왜 별도 모듈인가
 *
 * `AC-PANEL-042`의 판정은 "그 패널의 **extension 조립 결과**를 조회한다"이다.
 * 조립이 `MarkdownEditor`의 마운트 이펙트 안에 있으면 그 결과를 조회하려면
 * 컴포넌트를 띄우고 `EditorState`를 역추적해야 하는데, 그러면 판정이
 * **관측 가능한 facet만** 볼 수 있어 "최상위 항목 집합"이라는 AC의 입도를
 * 재현할 수 없다. 순수 함수로 떼면 조립 결과가 곧 반환값이다.
 *
 * 부수 효과로 이 모듈은 커버리지 게이트(85%, perFile)를 정면으로 받는다 —
 * `MarkdownEditor.tsx`는 `vitest.legacy-coverage.ts`의 부채 목록에 있어 게이트
 * 밖이므로, 조립을 그 안에 두면 이 SPEC의 핵심 로직이 게이트를 비껴간다.
 *
 * ## 판정은 allowlist다 (금지 목록이 아니다)
 *
 * 보조 패널의 최상위 항목 집합은 **공통층 ∪ 보조층**에 포함되어야 하고, 그
 * 합집합 밖의 항목이 하나라도 있으면 불충족이다. 금지 목록 열거를 버린 이유는
 * 실측이다: 초판이 열거한 9항목은 최상위 24항목의 일부만 덮었고, 목록 밖
 * 항목은 "부재를 단언받지 않는" 상태였다(`spec.md` REQ-PANEL-042).
 *
 * ## 항목 순서는 오늘 그대로다 (바꾸면 우선순위가 바뀐다)
 *
 * 아래 배열의 순서는 `040df4a:88-147`의 `extensions:` 배열과 **항목 단위로
 * 동일**하다. 층별로 묶어 재배열하고 싶은 유혹이 있지만 CodeMirror에서
 * 배열 순서는 **우선순위**다 — 예를 들어 `markdownKeymap()`은 오늘
 * `macroKeymapCompartment`보다 앞서므로 같은 키를 두 곳이 잡으면 마크다운
 * 쪽이 이긴다. 층별로 묶으면 그 승부가 조용히 뒤집힌다.
 */

/** 항목이 속한 층. `design.md` §5.2가 정의한다. */
export type ExtensionLayer = 'common' | 'markdown' | 'auxiliary';

/**
 * 조립의 **최상위 항목 하나**. `id`가 AC-PANEL-042의 판정 단위다.
 *
 * `liveDecorations`(43항목)를 통째로 한 항목으로 세는 것과 같은 입도이며
 * (`plan.md` §A.5), 그 입도의 한계는 정직하게 남는다 — 마크다운 확장을 기존
 * 슬롯 **안쪽**에 중첩하면 `id` 집합은 변하지 않는다. 그래서 테스트는 `id`
 * 집합뿐 아니라 실제 상태(facet·컴파트먼트·DOM·동작)도 함께 측정한다.
 */
export interface ExtensionSlot {
  readonly id: string;
  readonly layer: ExtensionLayer;
  readonly extension: Extension;
}

/**
 * 조립에 필요한 바깥 값들. 전부 호출부가 넘긴다 — 이 모듈이 스토어를 직접
 * 읽으면 조립 결과가 전역 상태에 따라 달라져 판정이 재현되지 않는다.
 */
export interface ExtensionLayerDeps {
  /** 마크다운 원고인가 보조 파일인가 (REQ-PANEL-040). */
  readonly kind: FileKind;
  /** 데코레이션 컴파트먼트의 **초기값**을 정한다. 이후 전환은 재설정으로 간다. */
  readonly editMode: EditMode;
  readonly macros: Macro[];
  readonly macroCompartment: Compartment;
  readonly editModeCompartment: Compartment;
  /** 붙여넣기·드롭이 **호출 시점의** 문서 경로를 읽어야 한다. */
  readonly filePathRef: { readonly current: string | null };
  readonly onChange?: (value: string) => void;
  /** 제목 힌트 표시 여부. 보조 패널에서는 플러그인 자체가 없어 호출되지 않는다. */
  readonly onHeadingHint: (show: boolean) => void;
}

/**
 * 표시 모드에 대응하는 라이브 데코레이션 집합.
 *
 * `markdown` 모드는 데코레이션을 통째로 비워 사용자가 마크다운 원본을 본다.
 * `typora`와 `wysiwyg`은 같은 묶음을 공유한다 — WYSIWYG 전용 활성 줄 마커
 * 숨김은 항상 실려 있고 자신이 현재 모드를 보고 스스로 게이트한다.
 *
 * 보조 패널의 실효 모드는 `markdown`이므로(REQ-PANEL-022,
 * `workspaceStore.displayModeOf`) 이 함수만으로도 데코레이션은 비지만,
 * 그것은 **모드 축**의 결과일 뿐이다. REQ-PANEL-042가 요구하는 것은
 * 마크다운층 **전체**의 부재이고 그것은 층 축이 담당한다.
 */
export function decorationsForMode(mode: EditMode): Extension {
  return mode === 'markdown' ? [] : liveDecorations;
}

// @MX:ANCHOR: [AUTO] REQ-PANEL-042의 allowlist 판정이 이 함수의 반환값을 직접 센다.
// @MX:REASON: 반환 항목의 `id`·`layer`·순서가 곧 AC-PANEL-042의 판정 대상이다.
// 슬롯을 추가·삭제·재정렬하면 (a) allowlist 판정, (b) 층 산술 11/13/24,
// (c) CodeMirror 우선순위가 함께 움직인다. 셋 중 하나만 고칠 수 없다.
// @MX:SPEC: SPEC-V03-WORKSPACE-002 REQ-PANEL-042
/**
 * 그 패널의 extension을 층으로 조립한다.
 *
 * 마크다운 패널은 **공통층 11 + 마크다운층 13 = 24항목**, 보조 패널은
 * **공통층 11 + 보조층(단계3에서는 빈 집합)** 을 받는다. 보조층의 언어 문법
 * 조달은 REQ-PANEL-041 소관이며 M5 단계4가 채운다 — 빈 보조층은 allowlist의
 * 포함 판정을 자명하게 만족시키므로 그때까지 판정이 성립한다.
 */
export function assembleLayers(deps: ExtensionLayerDeps): readonly ExtensionSlot[] {
  const isMarkdown = deps.kind === 'markdown';

  const common = (id: string, extension: Extension): ExtensionSlot => ({
    id,
    layer: 'common',
    extension,
  });
  const md = (id: string, build: () => Extension): ExtensionSlot | null =>
    isMarkdown ? { id, layer: 'markdown', extension: build() } : null;

  const slots: (ExtensionSlot | null)[] = [
    common('history', history()),
    // @MX:NOTE: [AUTO] 공통층 슬롯 하나지만 **내용물은 종류에 따라 다르다** —
    // `enterListContinuation()`은 마크다운 패널에만 실린다. 단계3이 적출한
    // 누수(보조 패널에도 목록 이어쓰기가 실림)를 단계3 보완이 여기서 끝냈다.
    // 남는 한계는 입도다: 아래 주석이 말하듯 최상위 태그는 이 분기를 보지
    // 못하므로, 이 결정을 지키는 것은 allowlist가 아니라
    // `tests/editor/listContinuationLayering.test.ts`의 동작 단언이다.
    //
    // **공통층인데 내용이 갈리는 이유** (`design.md` §5.2).
    // §5.2가 공통층에 둔 것은 "기본 keymap"이고, `enterListContinuation()`은
    // `defaultKeymap`·`historyKeymap`·`searchKeymap` 어디에도 속하지 않는다 —
    // 원래 코드가 같은 `keymap.of([...])` 호출에 끼워 넣었을 뿐이다. 따라서
    // 이 항목을 공통층으로 세는 것은 설계의 공백이 아니라 **오독**이었고,
    // 여기서 빼는 것은 설계 개정이 아니라 정정이다. 슬롯 자체는 하나로 남으므로
    // 최상위 항목 수(마크다운 24 / 보조 11)와 순서는 그대로다.
    //
    // **왜 무해하지 않았나** (보조 패널 실측, `.yaml`은 REQ-PANEL-041 조달 대상):
    //   "items:\n  - alpha" 끝에서 Enter → "items:\n  - alpha\n  - "  (마커 삽입)
    //   "items:\n  - "      끝에서 Enter → "items:\n"                  (줄 소멸)
    // `BULLET_RE`(`keymap/listContinuation.ts:4`)가 YAML 시퀀스 항목과 정확히
    // 일치한다. 두 번째는 요청하지 않은 파괴적 편집이며 `design.md` §4.2가
    // 배제한 "보이지 않는 문서를 바꾼다" 계열이다.
    common(
      'baseKeymap',
      keymap.of([
        // 마크다운층 동작이지만 마크다운층 **슬롯**으로 분리하지 않는다.
        // 분리하면 최상위 항목이 25 / 11이 되어 `design.md` §5.2의 산술과
        // AC-PANEL-042의 개수 판정이 함께 움직인다 — 그것은 정정이 아니라 개정이다.
        ...(isMarkdown ? [enterListContinuation()] : []),
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
      ]),
    ),
    common('autoPair', autoPair()),
    md('emojiAutocomplete', () => emojiAutocomplete()),
    md('markdownLanguage', () =>
      markdown({
        base: markdownLanguage,
        codeLanguages: lezerLangs,
        extensions: [
          GFM,
          FrontMatterExtension,
          FootnoteExtension,
          TocExtension,
          InlineExtrasExtension,
          CitationExtension,
          CommentsExtension,
          CriticMarkupExtension,
        ],
      }),
    ),
    // field는 **항상** 등록한다. `currentEditMode`가 field 부재 시 `typora`로
    // 폴백하므로(`editMode.ts:40-48`, 레거시 테스트 호환용) 보조 패널에서 빼면
    // 예측 불가한 값이 흘러든다. 빼는 것은 아래 **데코레이션 컴파트먼트**뿐이고,
    // REQ-PANEL-022가 요구하는 "3-모드 미적용"은 그것으로 달성된다.
    common('editModeState', editModeStateExtension()),
    common('docPathState', docPathStateExtension()),
    md('editModeDecorationCompartment', () =>
      deps.editModeCompartment.of(decorationsForMode(deps.editMode)),
    ),
    // v0.2.23 — 이미지/링크 위젯은 원자적으로 움직여야 한다: 화살표는 건너뛰고,
    // 클릭은 경계에 붙고, 경계에서의 Backspace/Delete는 `![](…)` 전체를 지운다.
    md('atomicMedia', () => atomicMediaExtension()),
    // v0.2.24 — 인라인 마크의 원자 경계. 위와 같은 계약을 open/label/close
    // 모양에 적용한다.
    md('atomicInlineMarks', () => atomicInlineMarksExtension()),
    md('wysiwygEscapeFilter', () => wysiwygEscapeFilter()),
    md('citationAutocomplete', () => citationAutocomplete()),
    md('citationHoverTooltip', () => citationHoverTooltip()),
    // 판 0.3.12 확정 — 마크다운층. 트리거 로직 자체는 언어 무관이지만 세션
    // 호출 상한 카운터가 **모듈 스코프**(창 전역 단일 예산)이라, 공통층에 두면
    // `.py` 패널의 타이핑이 원고 작업의 예산을 잠식한다. 동작 불가가 아니라
    // 비용이 근거다 (`design.md` §5.2).
    md('ghostText', () => ghostTextExtension({ refs: defaultGhostTextRefs })),
    // 판 0.3.12 확정 — 마크다운층. `syntaxTree`의 FencedCode·InlineCode·
    // FrontMatter lezer 노드에 의존하므로 마크다운 언어층이 없으면 데코레이션이
    // 비고 `$…$` 정규식 스캔만 `.py` 소스를 훑는 낭비로 남는다.
    md('spellcheckExclusion', () => spellcheckExclusion()),
    // `#foo` 처럼 공백이 빠져 제목이 되지 않는 줄에 캐럿이 있으면 상태바에
    // 안내를 띄운다. 판정만 하고 문서·데코레이션은 건드리지 않는다.
    md('headingHint', () => headingHintPlugin(deps.onHeadingHint)),
    common('viewModes', viewModes()),
    md('markdownKeymap', () => markdownKeymap()),
    // 판 0.3.12 확정 — 공통층. 순수 텍스트 삽입 keymap이라 마크다운 의존이
    // 0건이고, 사용자 정의 매크로는 `.py`/`.bib` 패널에서도 동일하게 유용하다.
    common('macroKeymapCompartment', deps.macroCompartment.of(buildMacroKeymap(deps.macros))),
    common('theme', makeTheme()),
    common('highlightActiveLine', highlightActiveLine()),
    common('lineWrapping', EditorView.lineWrapping),
    md('imagePasteDropHandlers', () =>
      EditorView.domEventHandlers({
        paste: (event, view) => handlePaste(event, view, deps.filePathRef),
        drop: (event, view) => handleDrop(event, view, deps.filePathRef),
        dragover: (event) => {
          event.preventDefault();
          return false;
        },
      }),
    ),
    common(
      'changeListener',
      EditorView.updateListener.of((u) => {
        if (u.docChanged && deps.onChange) deps.onChange(u.state.doc.toString());
      }),
    ),
  ];

  return slots.filter((s): s is ExtensionSlot => s !== null);
}

/**
 * `assembleLayers`의 결과를 CodeMirror가 받는 형태로 편다. 순서는 그대로다 —
 * 이 배열의 순서가 우선순위이므로 여기서 정렬하거나 묶으면 안 된다.
 */
export function layeredExtensions(deps: ExtensionLayerDeps): Extension[] {
  return assembleLayers(deps).map((s) => s.extension);
}
