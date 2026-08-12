import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Compartment, EditorState, Transaction, type Extension } from '@codemirror/state';
import { EditorView, keymap, showTooltip } from '@codemirror/view';
import { undo, undoDepth } from '@codemirror/commands';
import { language } from '@codemirror/language';
import type { FileKind } from '@shared/fileKind';
import {
  assembleLayers,
  decorationsForMode,
  layeredExtensions,
  type ExtensionLayerDeps,
  type ExtensionSlot,
} from '../../src/editor/extensionLayers';

/**
 * 편집 표면 extension의 3층 조립 (SPEC-V03-WORKSPACE-002 M5 단계3,
 * REQ-PANEL-042 · AC-PANEL-042).
 *
 * ## 판정의 정본은 allowlist다
 *
 * 이 파일의 중심 단언은 "보조 패널의 **최상위 항목 집합**이 `design.md` §5.2의
 * **공통층 ∪ 보조층**에 포함된다"이며, 그 합집합 **밖의 항목이 하나라도 있으면
 * 실패**한다. 금지 목록(9항목 열거)이 아니다 — 열거는 갱신되지 않으면 조용히
 * 낡고, 실측으로 그 결함이 확인됐다(`acceptance.md` AC-PANEL-042 메커니즘 범위:
 * 초판 9항목은 최상위 24항목의 일부만 덮어 `atomicInlineMarks`·
 * `spellcheckExclusion`이 부재 단언 밖에 있었다).
 *
 * ## allowlist 집합을 여기 **옮겨 적는** 이유
 *
 * 아래 `COMMON_LAYER_IDS`는 `design.md` §5.2에서 손으로 옮겨 적은 값이며
 * 프로덕션 모듈에서 **import하지 않는다**. 가져오면 "조립이 조립 자신의 목록에
 * 포함된다"는 항진명제가 되어 새로 끼어든 마크다운 확장을 영원히 못 잡는다 —
 * allowlist 형태를 채택한 이유가 정확히 그 실패를 잡기 위해서다.
 *
 * ## 이 판정이 못 보는 것 (정직한 한계)
 *
 * 판정 입도는 **최상위 슬롯**이다(AC-PANEL-042의 입도이자 `liveDecorations`
 * 43항목을 통째로 세는 것과 같은 규약, `plan.md` §A.5). 그래서 누군가
 * 마크다운 확장을 **기존 공통 슬롯 안쪽에 중첩**하면 식별자 집합은 변하지 않고
 * 이 단언은 통과한다. 그 구멍을 좁히려고 아래 §부재 검증은 식별자가 아니라
 * **실제 상태(facet·컴파트먼트·DOM·동작)** 를 측정한다 — 특히
 * `state.facet(language)`는 `markdown()`이 어디에 숨어 있든 잡는다.
 */

// ---------------------------------------------------------------------------
// design.md §5.2에서 옮겨 적은 allowlist. 프로덕션 모듈을 참조하지 않는다.
// ---------------------------------------------------------------------------

/** 공통층 11항목 (판 0.3.12 확정 — `macroKeymapCompartment` 포함). */
const COMMON_LAYER_IDS: readonly string[] = [
  'history',
  'baseKeymap',
  'autoPair',
  'editModeState',
  'docPathState',
  'viewModes',
  'macroKeymapCompartment',
  'theme',
  'highlightActiveLine',
  'lineWrapping',
  'changeListener',
];

/**
 * 보조층 — **단계4가 채웠다.** `design.md` §5.2가 이 층에 선언한 유일한 원소는
 * "언어 문법(`LanguageDescription` → `@codemirror/language-data`)"이다.
 *
 * 이 목록은 층의 **가능한 원소**를 적은 것이고, 실제 조립에서 그 슬롯은
 * **문법이 조달된 경우에만** 나타난다(REQ-PANEL-041은 `Where 문법이 사용 가능한
 * 경우`, REQ-PANEL-045는 `Where 없는 경우`이므로 0-or-1이 두 요구의 모양 그대로다).
 * 조달·폴백의 판정 자체는 `auxiliaryGrammar.test.ts`가 소유한다.
 */
const AUXILIARY_LAYER_IDS: readonly string[] = ['auxiliaryLanguage'];

const ALLOWLIST = new Set<string>([...COMMON_LAYER_IDS, ...AUXILIARY_LAYER_IDS]);

/** 마크다운층 13항목 — allowlist가 아니라 **층 산술**을 확인하는 데만 쓴다. */
const MARKDOWN_LAYER_IDS: readonly string[] = [
  'emojiAutocomplete',
  'markdownLanguage',
  'editModeDecorationCompartment',
  'atomicMedia',
  'atomicInlineMarks',
  'wysiwygEscapeFilter',
  'citationAutocomplete',
  'citationHoverTooltip',
  'ghostText',
  'spellcheckExclusion',
  'headingHint',
  'markdownKeymap',
  'imagePasteDropHandlers',
];

// ---------------------------------------------------------------------------
// 조립 입력
// ---------------------------------------------------------------------------

function makeDeps(kind: FileKind, over: Partial<ExtensionLayerDeps> = {}): ExtensionLayerDeps {
  return {
    kind,
    editMode: 'wysiwyg',
    macros: [],
    macroCompartment: new Compartment(),
    editModeCompartment: new Compartment(),
    filePathRef: { current: null },
    onChange: undefined,
    onHeadingHint: () => {},
    grammar: null,
    ...over,
  };
}

/**
 * 보조층 슬롯의 **구조**만 보는 절을 위한 무해한 대역.
 *
 * 이 파일이 재는 것은 슬롯의 개수·층·순서다. 실제 문법이 상태에 도달하는지는
 * `auxiliaryGrammar.test.ts`가 진짜 `LanguageSupport`로 잰다 — 여기서 그것을
 * 하려면 이 파일 전체가 비동기가 되고, 얻는 것은 없다.
 */
const GRAMMAR_STANDIN: Extension = keymap.of([]);

function stateOf(deps: ExtensionLayerDeps, doc = ''): EditorState {
  return EditorState.create({ doc, extensions: layeredExtensions(deps) });
}

const views: EditorView[] = [];

function viewOf(deps: ExtensionLayerDeps, doc = ''): EditorView {
  const view = new EditorView({ state: stateOf(deps, doc) });
  document.body.appendChild(view.dom);
  views.push(view);
  return view;
}

function flatKeys(state: EditorState): string[] {
  return state
    .facet(keymap)
    .flat()
    .map((b) => (b as { key?: string }).key ?? '')
    .filter(Boolean);
}

function idsOf(slots: readonly ExtensionSlot[]): string[] {
  return slots.map((s) => s.id);
}

beforeEach(() => {
  views.length = 0;
});

afterEach(() => {
  for (const v of views) v.destroy();
  views.length = 0;
});

// ---------------------------------------------------------------------------
// AC-PANEL-042 `Then` — allowlist 판정 (정본)
// ---------------------------------------------------------------------------

describe('AC-PANEL-042 Then — allowlist 판정', () => {
  it('보조 패널의 최상위 항목 집합이 공통층 ∪ 보조층 밖으로 하나도 나가지 않는다', () => {
    const slots = assembleLayers(makeDeps('auxiliary'));
    const outside = slots.filter((s) => !ALLOWLIST.has(s.id)).map((s) => s.id);
    expect(outside).toEqual([]);
  });

  it('식별자가 중복되지 않는다 — 중복은 포함 판정을 무력화한다', () => {
    const ids = idsOf(assembleLayers(makeDeps('markdown')));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('모든 슬롯이 세 층 중 하나에 귀속된다 — 미분류 슬롯이 있으면 allowlist가 정의되지 않는다', () => {
    const slots = assembleLayers(makeDeps('markdown'));
    const unclassified = slots.filter(
      (s) => s.layer !== 'common' && s.layer !== 'markdown' && s.layer !== 'auxiliary',
    );
    expect(unclassified).toEqual([]);
  });

  it('보조 조립에는 마크다운층 슬롯이 하나도 없다', () => {
    const layers = assembleLayers(makeDeps('auxiliary')).map((s) => s.layer);
    expect(layers.filter((l) => l === 'markdown')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC-PANEL-042 첫 번째 `And` — 공통 항목의 존재
// ---------------------------------------------------------------------------

describe('AC-PANEL-042 And① — 보조 패널에도 공통 항목은 존재한다', () => {
  it('여섯 공통 항목의 슬롯이 조립된다', () => {
    const ids = new Set(idsOf(assembleLayers(makeDeps('auxiliary'))));
    for (const id of [
      'history', // 실행 취소 이력
      'baseKeymap', // 기본 keymap
      'theme', // 테마
      'highlightActiveLine', // 활성 줄 강조
      'lineWrapping', // 줄바꿈
      'changeListener', // 변경 리스너
    ]) {
      expect(ids.has(id), `공통 슬롯 ${id}가 없다`).toBe(true);
    }
  });

  it('실행 취소 이력이 실제로 동작한다', () => {
    const view = viewOf(makeDeps('auxiliary'), 'x = 1');
    view.dispatch({ changes: { from: 5, insert: '\ny = 2' } });
    expect(undoDepth(view.state)).toBe(1);
    undo(view);
    expect(view.state.doc.toString()).toBe('x = 1');
  });

  it('기본 keymap이 실제로 등록된다 (실행 취소·검색 바인딩 관측)', () => {
    const keys = flatKeys(stateOf(makeDeps('auxiliary')));
    expect(keys).toContain('Mod-z');
    expect(keys).toContain('Mod-f');
  });

  it('줄바꿈과 활성 줄 강조가 DOM에 나타난다', () => {
    const view = viewOf(makeDeps('auxiliary'), 'a\nb');
    expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(true);
    expect(view.dom.querySelector('.cm-activeLine')).not.toBeNull();
  });

  it('테마가 스타일 모듈을 등록한다', () => {
    expect(stateOf(makeDeps('auxiliary')).facet(EditorView.styleModule).length).toBeGreaterThan(0);
  });

  it('변경 리스너가 편집을 호출부로 흘려보낸다', () => {
    const onChange = vi.fn();
    const view = viewOf(makeDeps('auxiliary', { onChange }), '');
    view.dispatch({ changes: { from: 0, insert: 'hi' } });
    expect(onChange).toHaveBeenCalledWith('hi');
  });
});

// ---------------------------------------------------------------------------
// AC-PANEL-042 두 번째 `And` — 9항목 부재 (비망라 예시)
//
// 식별자(태그)가 아니라 **실제 상태**로 측정한다. 태그만 보면 마크다운 확장을
// 공통 슬롯 안쪽에 중첩했을 때 통과하기 때문이다.
// ---------------------------------------------------------------------------

describe('AC-PANEL-042 And② — 마크다운 전용 항목 9종의 부재 (비망라)', () => {
  it('①② 라이브 데코레이션과 3-모드 컴파트먼트가 설정에 없다', () => {
    const deps = makeDeps('auxiliary');
    const aux = stateOf(deps);
    expect(deps.editModeCompartment.get(aux)).toBeUndefined();

    const mdDeps = makeDeps('markdown');
    const md = stateOf(mdDeps);
    expect(mdDeps.editModeCompartment.get(md)).toBeDefined();
  });

  it('③ 이미지/링크 원자 경계가 없다', () => {
    expect(stateOf(makeDeps('auxiliary')).facet(EditorView.atomicRanges).length).toBe(0);
    expect(stateOf(makeDeps('markdown')).facet(EditorView.atomicRanges).length).toBeGreaterThan(0);
  });

  it('④ WYSIWYG 이스케이프 필터가 타건을 고치지 않는다', () => {
    const type = (view: EditorView) => {
      view.dispatch({
        changes: { from: view.state.doc.length, insert: '*' },
        annotations: Transaction.userEvent.of('input.type'),
      });
      return view.state.doc.toString();
    };
    expect(type(viewOf(makeDeps('auxiliary'), 'a'))).toBe('a*');
    expect(type(viewOf(makeDeps('markdown'), 'a'))).toBe('a\\*');
  });

  it('⑤ 인용 자동완성이 없다 (자동완성 키 바인딩 부재로 관측)', () => {
    expect(flatKeys(stateOf(makeDeps('auxiliary')))).not.toContain('Ctrl-Space');
    expect(flatKeys(stateOf(makeDeps('markdown')))).toContain('Ctrl-Space');
  });

  it('⑥ 인용 호버 툴팁이 없다', () => {
    expect(stateOf(makeDeps('auxiliary')).facet(showTooltip).length).toBe(0);
    expect(stateOf(makeDeps('markdown')).facet(showTooltip).length).toBeGreaterThan(0);
  });

  it('⑦ 제목 힌트 플러그인이 없다 (콜백 미호출로 관측)', () => {
    const auxHint = vi.fn();
    viewOf(makeDeps('auxiliary', { onHeadingHint: auxHint }), '#foo');
    expect(auxHint).not.toHaveBeenCalled();

    const mdHint = vi.fn();
    viewOf(makeDeps('markdown', { onHeadingHint: mdHint }), '#foo');
    expect(mdHint).toHaveBeenCalled();
  });

  it('⑧ 마크다운 keymap이 없다', () => {
    expect(flatKeys(stateOf(makeDeps('auxiliary')))).not.toContain('Mod-b');
    expect(flatKeys(stateOf(makeDeps('markdown')))).toContain('Mod-b');
  });

  it('⑨ 이미지 붙여넣기·드롭 핸들러가 없다 (dragover 기본 동작 관측)', () => {
    const dragover = (view: EditorView) => {
      const ev = new Event('dragover', { bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(dragover(viewOf(makeDeps('auxiliary')))).toBe(false);
    expect(dragover(viewOf(makeDeps('markdown')))).toBe(true);
  });

  it('마크다운 언어층 자체가 없다 — 중첩으로 숨겨도 이 단언은 뚫리지 않는다', () => {
    expect(stateOf(makeDeps('auxiliary')).facet(language)).toBeNull();
    expect(stateOf(makeDeps('markdown')).facet(language)?.name).toBe('markdown');
  });
});

// ---------------------------------------------------------------------------
// 층 산술 — 설계 문서가 아니라 조립 자신에게서 잰다
// ---------------------------------------------------------------------------

/**
 * **단계4에서 보조 쪽 산술이 바뀌었다 — 계약의 변경이며 완화가 아니다.**
 *
 * 단계3까지 보조는 항상 11이었다(보조층이 비어 있었으므로). 단계4가 언어 문법을
 * 채우면서 보조는 **11 또는 12**가 된다. 그 둘은 임의의 흔들림이 아니라 요구의
 * 두 갈래를 그대로 옮긴 것이다:
 *
 *   REQ-PANEL-041 `Where 문법 정의가 사용 가능한 경우` → 공통 11 + 보조 1 = 12
 *   REQ-PANEL-045 `Where 문법 정의가 없는 경우`        → 공통 11 + 보조 0 = 11
 *
 * 그래서 단언을 "11 이상"이나 "11 또는 12" 같은 느슨한 형태로 바꾸지 않았다 —
 * **입력이 정하는 값을 정확히** 단언한다. 마크다운 24는 불변이다.
 */
describe('층 산술 (design.md §5.2 = 공통 11 + 마크다운 13 = 24, 보조층 0-or-1)', () => {
  it('마크다운 패널은 문법 입력과 무관하게 최상위 24항목이다', () => {
    expect(assembleLayers(makeDeps('markdown')).length).toBe(24);
    expect(assembleLayers(makeDeps('markdown', { grammar: GRAMMAR_STANDIN })).length).toBe(24);
  });

  it('보조 패널은 문법이 없으면 11항목, 있으면 12항목이다', () => {
    expect(assembleLayers(makeDeps('auxiliary')).length).toBe(11);
    expect(assembleLayers(makeDeps('auxiliary', { grammar: GRAMMAR_STANDIN })).length).toBe(12);
  });

  it('층별 개수가 마크다운 조립에서 11 / 13 / 0이다', () => {
    const slots = assembleLayers(makeDeps('markdown', { grammar: GRAMMAR_STANDIN }));
    const count = (l: string) => slots.filter((s) => s.layer === l).length;
    expect(count('common')).toBe(11);
    expect(count('markdown')).toBe(13);
    // 마크다운 패널에는 보조층이 없다 — 문법을 넘겨도 마찬가지다.
    expect(count('auxiliary')).toBe(0);
  });

  it('층별 개수가 보조 조립에서 11 / 0 / 0-or-1이다', () => {
    const count = (deps: ExtensionLayerDeps, l: string) =>
      assembleLayers(deps).filter((s) => s.layer === l).length;
    const plain = makeDeps('auxiliary');
    const withGrammar = makeDeps('auxiliary', { grammar: GRAMMAR_STANDIN });
    for (const deps of [plain, withGrammar]) {
      expect(count(deps, 'common')).toBe(11);
      expect(count(deps, 'markdown')).toBe(0);
    }
    expect(count(plain, 'auxiliary')).toBe(0);
    expect(count(withGrammar, 'auxiliary')).toBe(1);
  });

  it('층 구성이 design.md §5.2의 명세와 항목 단위로 일치한다', () => {
    const slots = assembleLayers(makeDeps('markdown'));
    const byLayer = (l: string) => slots.filter((s) => s.layer === l).map((s) => s.id).sort();
    expect(byLayer('common')).toEqual([...COMMON_LAYER_IDS].sort());
    expect(byLayer('markdown')).toEqual([...MARKDOWN_LAYER_IDS].sort());

    const aux = assembleLayers(makeDeps('auxiliary', { grammar: GRAMMAR_STANDIN }));
    expect(aux.filter((s) => s.layer === 'auxiliary').map((s) => s.id)).toEqual([
      ...AUXILIARY_LAYER_IDS,
    ]);
  });

  /**
   * **`040df4a:88-147` 바이트 동일 불변식을 대신하는 계약이다** (M5 단계3).
   *
   * M0~M4는 `extensions:` 배열 블록을 `040df4a`와 바이트 동일하게 유지하고
   * 그것을 `diff`로 검증했다. 단계3이 그 블록을 3층으로 재구성했으므로 그
   * 검증은 더 이상 성립하지 않는다. 대신 **항목의 순서**를 여기서 고정한다 —
   * 지키려던 것이 바이트가 아니라 **우선순위**였기 때문이다. CodeMirror에서
   * 배열 순서는 우선순위이고, 층별로 묶어 재배열하면 예컨대 `markdownKeymap`과
   * `macroKeymapCompartment`의 키 승부가 조용히 뒤집힌다.
   *
   * 아래 목록은 `040df4a:88-147`의 배열을 항목 단위로 옮겨 적은 것이다.
   * 단계4가 보조층(언어 문법)을 추가해도 이 마크다운 순서는 변하지 않는다.
   */
  it('마크다운 조립의 항목 순서가 040df4a 배열의 항목 순서와 같다', () => {
    expect(idsOf(assembleLayers(makeDeps('markdown')))).toEqual([
      'history', //                       040df4a:89
      'baseKeymap', //                    :90  keymap.of([enterListContinuation, …])
      'autoPair', //                      :91
      'emojiAutocomplete', //             :92
      'markdownLanguage', //              :93-106  markdown({base, codeLanguages, extensions})
      'editModeState', //                 :107
      'docPathState', //                  :108
      'editModeDecorationCompartment', // :109
      'atomicMedia', //                   :115
      'atomicInlineMarks', //             :120
      'wysiwygEscapeFilter', //           :121
      'citationAutocomplete', //          :122
      'citationHoverTooltip', //          :123
      'ghostText', //                     :124
      'spellcheckExclusion', //           :125
      'headingHint', //                   :129
      'viewModes', //                     :130
      'markdownKeymap', //                :131
      'macroKeymapCompartment', //        :132
      'theme', //                         :133
      'highlightActiveLine', //           :134
      'lineWrapping', //                  :135
      'imagePasteDropHandlers', //        :136-143  EditorView.domEventHandlers
      'changeListener', //                :144  EditorView.updateListener
    ]);
  });

  /**
   * **이 단언도 단계4에서 형태가 바뀌었다.**
   *
   * 단계3까지는 `보조 전체 == 마크다운의 공통 슬롯`이었다(보조층이 비었으므로).
   * 보조층에 원소가 생긴 지금 그 등식은 성립할 수 없으므로, 지키려던 것 —
   * **공통 슬롯끼리의 상대 순서 = 우선순위** — 를 정확히 그 형태로 단언한다.
   * 보조 조립에서 공통 슬롯만 뽑은 부분열이 마크다운의 그것과 같아야 한다.
   */
  it('보조 조립의 공통 슬롯 순서가 마크다운 조립의 그것과 같다 — 우선순위 보존', () => {
    const commonOf = (deps: ExtensionLayerDeps) =>
      assembleLayers(deps)
        .filter((s) => s.layer === 'common')
        .map((s) => s.id);
    const md = commonOf(makeDeps('markdown'));
    expect(commonOf(makeDeps('auxiliary'))).toEqual(md);
    expect(commonOf(makeDeps('auxiliary', { grammar: GRAMMAR_STANDIN }))).toEqual(md);
  });

  /**
   * 문법 슬롯이 **어디에 끼는가**도 우선순위다. 마크다운 조립에서 언어층
   * (`markdownLanguage`)이 앉은 자리와 같은 자리에 둔다 — 언어층이 두 조립에서
   * 같은 우선순위를 갖게 하는 유일한 배치이며, 끝에 붙이면 `viewModes` ·
   * `macroKeymapCompartment` · `theme` 뒤로 밀려 두 종류의 우선순위가 갈린다.
   */
  it('보조층 문법 슬롯이 마크다운 언어층과 같은 자리에 앉는다', () => {
    const aux = idsOf(assembleLayers(makeDeps('auxiliary', { grammar: GRAMMAR_STANDIN })));
    expect(aux).toEqual([
      'history',
      'baseKeymap',
      'autoPair',
      'auxiliaryLanguage', // 마크다운 조립의 `markdownLanguage` 자리
      'editModeState',
      'docPathState',
      'viewModes',
      'macroKeymapCompartment',
      'theme',
      'highlightActiveLine',
      'lineWrapping',
      'changeListener',
    ]);

    // 폴백 조립은 그 자리가 비어 있을 뿐 나머지 순서가 같다.
    expect(idsOf(assembleLayers(makeDeps('auxiliary')))).toEqual(
      aux.filter((id) => id !== 'auxiliaryLanguage'),
    );
  });
});

// ---------------------------------------------------------------------------
// 위험 (1) — 재사용되는 뷰에서 종류를 갈아탈 수 있는가
// ---------------------------------------------------------------------------

describe('종류 전환 — 하나의 EditorView가 문서를 갈아타도 층이 따라간다', () => {
  function swapView(): { view: EditorView; kindCompartment: Compartment; md: ExtensionLayerDeps } {
    const kindCompartment = new Compartment();
    const md = makeDeps('markdown');
    const view = new EditorView({
      state: EditorState.create({
        doc: '# 제목',
        extensions: [kindCompartment.of(layeredExtensions(md))],
      }),
    });
    document.body.appendChild(view.dom);
    views.push(view);
    return { view, kindCompartment, md };
  }

  it('마크다운 → 보조 재설정으로 마크다운 언어층이 사라진다', () => {
    const { view, kindCompartment, md } = swapView();
    expect(view.state.facet(language)?.name).toBe('markdown');
    const aux = makeDeps('auxiliary', {
      macroCompartment: md.macroCompartment,
      editModeCompartment: md.editModeCompartment,
    });
    view.dispatch({ effects: kindCompartment.reconfigure(layeredExtensions(aux)) });
    expect(view.state.facet(language)).toBeNull();
    expect(flatKeys(view.state)).not.toContain('Mod-b');
  });

  it('종류를 갈아타도 실행 취소 이력과 문서가 살아남는다', () => {
    const { view, kindCompartment, md } = swapView();
    view.dispatch({ changes: { from: view.state.doc.length, insert: '들' } });
    expect(undoDepth(view.state)).toBe(1);
    const aux = makeDeps('auxiliary', {
      macroCompartment: md.macroCompartment,
      editModeCompartment: md.editModeCompartment,
    });
    view.dispatch({ effects: kindCompartment.reconfigure(layeredExtensions(aux)) });
    expect(view.state.doc.toString()).toBe('# 제목들');
    expect(undoDepth(view.state)).toBe(1);
    undo(view);
    expect(view.state.doc.toString()).toBe('# 제목');
  });

  it('보조 → 마크다운으로 되돌리면 마크다운층이 복원된다', () => {
    const { view, kindCompartment, md } = swapView();
    const shared = {
      macroCompartment: md.macroCompartment,
      editModeCompartment: md.editModeCompartment,
    };
    view.dispatch({
      effects: kindCompartment.reconfigure(layeredExtensions(makeDeps('auxiliary', shared))),
    });
    view.dispatch({
      effects: kindCompartment.reconfigure(layeredExtensions(makeDeps('markdown', shared))),
    });
    expect(view.state.facet(language)?.name).toBe('markdown');
    expect(md.editModeCompartment.get(view.state)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 위험 (4) — 마크다운층이 없는 패널에 모드 전환이 들어오면
// ---------------------------------------------------------------------------

describe('보조 패널의 모드 전환 (REQ-PANEL-022)', () => {
  it('없는 컴파트먼트에 대한 재설정은 예외 없이 무시된다', () => {
    const deps = makeDeps('auxiliary');
    const view = viewOf(deps, 'x = 1');
    expect(() =>
      view.dispatch({
        effects: deps.editModeCompartment.reconfigure(decorationsForMode('wysiwyg')),
      }),
    ).not.toThrow();
    expect(deps.editModeCompartment.get(view.state)).toBeUndefined();
    expect(view.state.doc.toString()).toBe('x = 1');
  });

  it('마크다운 패널의 모드 전환은 그대로 동작한다', () => {
    const deps = makeDeps('markdown', { editMode: 'wysiwyg' });
    const view = viewOf(deps, '# a');
    const wysiwyg = deps.editModeCompartment.get(view.state) as Extension[];
    expect(wysiwyg.length).toBeGreaterThan(0);
    view.dispatch({ effects: deps.editModeCompartment.reconfigure(decorationsForMode('markdown')) });
    expect(deps.editModeCompartment.get(view.state)).toEqual([]);
  });
});
