import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { FileKind } from '@shared/fileKind';
import {
  assembleLayers,
  layeredExtensions,
  type ExtensionLayerDeps,
} from '../../src/editor/extensionLayers';

/**
 * 목록 이어쓰기는 마크다운 패널에만 실린다
 * (SPEC-V03-WORKSPACE-002 M5 단계3 보완, REQ-PANEL-042).
 *
 * ## 왜 이 파일이 생겼나 — 두 건의 실측
 *
 * 단계3은 `baseKeymap` 슬롯(공통층)이 `enterListContinuation()`을 품고 있어
 * 보조 패널에도 마크다운 목록 이어쓰기가 실린다는 **사실**을 적출하고 고치지
 * 않았다. 그 사실이 무해하지 않다는 것을 다음 두 관측이 보인다 — 보조 패널에
 * YAML 문서(`.yaml`/`.yml`은 REQ-PANEL-041의 조달 대상이다)를 올리고 Enter를
 * 눌렀을 때:
 *
 * ```
 * [관측 1] "items:\n  - alpha" 캐럿 끝 + Enter → "items:\n  - alpha\n  - "
 *          → 요청하지 않은 마커가 삽입된다
 * [관측 2] "items:\n  - "      캐럿 끝 + Enter → "items:\n"
 *          → 그 줄이 통째로 사라진다
 * ```
 *
 * `BULLET_RE = /^(\s*)([-*+])\s+(.*)$/`(`listContinuation.ts:4`)가 YAML 시퀀스
 * 항목과 정확히 일치하기 때문이다. 관측 2는 **요청하지 않은 파괴적 편집**이며
 * `design.md` §4.2가 받아들일 수 없다고 못박은 결함 계열("보이지 않는 문서를
 * 바꾼다")에 그대로 해당한다.
 *
 * ## 왜 이 판정이 allowlist가 아니라 **동작**인가
 *
 * 고친 형태는 슬롯을 쪼개는 것이 아니라 **한 공통 슬롯 안의 배열 내용을 종류에
 * 따라 다르게 만드는 것**이다(`extensionLayers.ts`의 `baseKeymap`). 그것은 단계3
 * 반증 (C)가 보인 바로 그 모양 — **기존 슬롯 안쪽의 중첩** — 이고, 반증 (C)는
 * 최상위 태그가 그것을 보지 못한다는 사실을 이미 증명했다. 그러므로 이 변경을
 * 지키는 것은 AC-PANEL-042의 allowlist가 아니라 **아래의 문서 변형 단언**이다.
 * 그래서 배열의 내용물이 아니라 조립된 상태에 실제로 Enter를 눌러 잰다.
 *
 * ## 마크다운 대조군이 없으면 이 파일은 증거가 아니다
 *
 * 이 저장소에는 "재현 테스트가 엉뚱한 이유로 통과한 전례"가 있다(API 형태 실패를
 * 수정 증거로 오독한 건). 키 입력이 keymap에 도달조차 하지 않으면 보조 쪽 단언은
 * **저절로** 통과한다. 그래서 같은 수단으로 마크다운 패널의 이어쓰기가 오늘과
 * 똑같이 동작하는 것을 함께 단언한다 — 그 대조군이 실패하면 보조 쪽 통과는
 * 증거가 아니다.
 *
 * ## 최상위 항목 수는 여기서 재지 않는다
 *
 * 마크다운 24 / 보조 11은 `extensionLayers.test.ts`(이 보완에서 **한 줄도 고치지
 * 않았다**)의 층 산술 절이 고정한다. 여기서는 그 산술을 지탱하는 **모양** —
 * `baseKeymap`이 두 종류 모두에서 공통층 슬롯 **하나**로 남는다 — 만 단언한다.
 * 슬롯을 쪼개는 순간 이 단언과 저쪽 산술이 함께 깨진다.
 */

function makeDeps(kind: FileKind): ExtensionLayerDeps {
  return {
    kind,
    editMode: 'wysiwyg',
    macros: [],
    macroCompartment: new Compartment(),
    editModeCompartment: new Compartment(),
    filePathRef: { current: null },
    onChange: undefined,
    onHeadingHint: () => {},
  };
}

const views: EditorView[] = [];

/** 캐럿을 문서 끝에 둔 편집 표면. 이어쓰기 판정은 "줄 끝에서의 Enter"다. */
function viewOf(kind: FileKind, doc: string): EditorView {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: layeredExtensions(makeDeps(kind)),
    }),
  });
  document.body.appendChild(view.dom);
  views.push(view);
  return view;
}

/**
 * 조립된 상태에 **실제 Enter를 누른다.** 바인딩을 직접 호출하지 않는 이유는,
 * 이 보완이 바꾸는 것이 바인딩의 내용이 아니라 **그 바인딩이 어느 패널의 keymap
 * facet에 실리는가**이기 때문이다. 직접 호출하면 그 축을 비껴간다.
 */
function pressEnter(view: EditorView): void {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function afterEnter(kind: FileKind, doc: string): string {
  const view = viewOf(kind, doc);
  pressEnter(view);
  return view.state.doc.toString();
}

beforeEach(() => {
  views.length = 0;
});

afterEach(() => {
  for (const v of views) v.destroy();
  views.length = 0;
});

// ---------------------------------------------------------------------------
// 보조 패널 — 두 관측의 회귀 고정
// ---------------------------------------------------------------------------

describe('보조 패널에는 목록 이어쓰기가 실리지 않는다', () => {
  it('[관측 1] 글머리 항목 끝에서 Enter를 눌러도 마커가 삽입되지 않는다', () => {
    // 공통 keymap(`defaultKeymap`)의 Enter는 줄바꿈 + 그 줄의 들여쓰기 복제까지다.
    // 기존 본문은 한 글자도 건드리지 않는다.
    expect(afterEnter('auxiliary', 'items:\n  - alpha')).toBe('items:\n  - alpha\n  ');
  });

  it('[관측 2] 빈 글머리 항목 끝에서 Enter를 눌러도 그 줄이 지워지지 않는다', () => {
    // 이것이 이 보완의 핵심이다. 이어쓰기가 실리면 `  - ` 줄이 통째로 사라진다 —
    // 사용자가 요청하지 않은 파괴적 편집이다.
    expect(afterEnter('auxiliary', 'items:\n  - ')).toBe('items:\n  - \n  ');
  });

  it('번호 목록 모양에도 마커가 삽입되지 않는다', () => {
    // `ORDERED_RE`도 공통층에 함께 실려 있었다. 한 정규식만 빼는 문제가 아니다.
    expect(afterEnter('auxiliary', 'items:\n  1. alpha')).toBe('items:\n  1. alpha\n  ');
  });

  it('빈 번호 항목의 줄도 지워지지 않는다', () => {
    expect(afterEnter('auxiliary', 'items:\n  1. ')).toBe('items:\n  1. \n  ');
  });

  it('작업 목록 모양에도 체크박스가 삽입되지 않는다', () => {
    // `TASK_RE`는 `BULLET_RE`보다 먼저 판정되므로 별도 축이다.
    expect(afterEnter('auxiliary', 'items:\n  - [ ] alpha')).toBe('items:\n  - [ ] alpha\n  ');
  });

  it('빈 작업 항목의 줄도 지워지지 않는다', () => {
    expect(afterEnter('auxiliary', 'items:\n  - [ ] ')).toBe('items:\n  - [ ] \n  ');
  });

  it('목록이 아닌 줄의 Enter는 원래도 공통 동작이었고 그대로다', () => {
    expect(afterEnter('auxiliary', 'plain')).toBe('plain\n');
  });
});

// ---------------------------------------------------------------------------
// 대조군 — 마크다운 패널의 이어쓰기는 오늘 그대로다
//
// 위 단언들은 이 절이 통과할 때만 증거다. 같은 수단(실제 Enter)으로 재고,
// 기대값은 `listContinuation.test.ts`가 고정한 동작과 같다.
//
// ## 이 대조군의 검증력은 균일하지 않다 (반증으로 실측)
//
// 마크다운 패널에는 Enter 이어쓰기 **수단이 둘** 있다. `enterListContinuation()`
// 외에 `markdown()`이 스스로 싣는 `Prec.high(keymap.of(markdownKeymap))`가 있고
// (`@codemirror/lang-markdown/dist/index.js:396-397, 422`), 그 `Enter`는
// `insertNewlineContinueMarkup`이다. 반증 B(마크다운에서도 이어쓰기를 빼는
// **과잉 수정**)를 주입해 실측한 결과 아래 일곱 중 **둘만** FAIL했다:
//
//   - 빈 글머리 항목 → 기대 "items:\n" / 과잉수정 시 "items:\n  - \n  "   ← 잡는다
//   - 빈 번호 항목   → 기대 "items:\n" / 과잉수정 시 "items:\n  1. \n  "   ← 잡는다
//   - 나머지 다섯    → 두 수단의 출력이 같아 구분되지 않는다
//
// 빈 항목에서 갈리는 이유는 CommonMark다: 빈 목록 항목은 문단을 끊지 못하므로
// `items:\n  - `는 목록으로 파싱되지 않고, 그래서 `insertNewlineContinueMarkup`이
// false를 돌려주며 정규식 기반인 `enterListContinuation()`만 반응한다.
//
// 따라서 **과잉 수정을 실제로 막는 것은 아래 두 개**이고 나머지 다섯은
// "사용자가 보는 동작이 그대로다"라는 더 약한 단언이다. 둘 다 남긴다 — 약한
// 쪽도 사용자 관점의 회귀는 잡는다 — 되 무엇이 무엇인지 여기 적어 둔다.
// ---------------------------------------------------------------------------

describe('마크다운 패널의 목록 이어쓰기는 그대로 동작한다 (대조군)', () => {
  it('[구분력 있음] 빈 글머리 항목에서 목록을 빠져나간다 (그 줄을 비운다)', () => {
    expect(afterEnter('markdown', 'items:\n  - ')).toBe('items:\n');
  });

  it('[구분력 있음] 빈 번호 항목에서 목록을 빠져나간다', () => {
    expect(afterEnter('markdown', 'items:\n  1. ')).toBe('items:\n');
  });

  it('글머리 항목을 같은 마커로 이어쓴다', () => {
    expect(afterEnter('markdown', 'items:\n  - alpha')).toBe('items:\n  - alpha\n  - ');
  });

  it('번호 목록의 번호를 올린다', () => {
    expect(afterEnter('markdown', 'items:\n  1. alpha')).toBe('items:\n  1. alpha\n  2. ');
  });

  it('작업 목록을 빈 체크박스로 이어쓴다', () => {
    expect(afterEnter('markdown', 'items:\n  - [ ] alpha')).toBe('items:\n  - [ ] alpha\n  - [ ] ');
  });

  it('빈 작업 항목에서 목록을 빠져나간다', () => {
    expect(afterEnter('markdown', 'items:\n  - [ ] ')).toBe('items:\n');
  });

  it('목록이 아닌 줄의 Enter는 보조 패널과 같다', () => {
    expect(afterEnter('markdown', 'plain')).toBe('plain\n');
  });
});

// ---------------------------------------------------------------------------
// 모양 — 고친 방식이 슬롯을 쪼개지 않았다
// ---------------------------------------------------------------------------

describe('`baseKeymap`은 두 종류 모두에서 공통층 슬롯 하나로 남는다', () => {
  it('종류와 무관하게 baseKeymap 슬롯은 정확히 하나이고 공통층이다', () => {
    for (const kind of ['markdown', 'auxiliary'] as const) {
      const base = assembleLayers(makeDeps(kind)).filter((s) => s.id === 'baseKeymap');
      expect(base.length, `${kind}: baseKeymap 슬롯 수`).toBe(1);
      expect(base[0]?.layer, `${kind}: baseKeymap 층`).toBe('common');
    }
  });
});
