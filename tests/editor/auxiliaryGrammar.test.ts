import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { language, LanguageDescription } from '@codemirror/language';
import { languages as lezerLangs } from '@codemirror/language-data';
import { fileKindOf, type FileKind } from '@shared/fileKind';
import {
  assembleLayers,
  grammarDescriptionFor,
  layeredExtensions,
  type ExtensionLayerDeps,
} from '../../src/editor/extensionLayers';

/**
 * 보조 패널의 **언어 문법 조달**과 **평문 폴백**
 * (SPEC-V03-WORKSPACE-002 M5 단계4 — REQ-PANEL-041 · REQ-PANEL-045 · C-11).
 *
 * ## 두 요구는 한 함수의 두 갈래다
 *
 * REQ-PANEL-041은 `Where 문법 정의가 사용 가능한 경우`, REQ-PANEL-045는
 * `Where 문법 정의가 없는 경우`다. 둘은 같은 조회(`grammarDescriptionFor`)의
 * 참·거짓 갈래이므로 한 파일에서 함께 잰다 — 나누면 "조회가 null을 돌려주는
 * 경우"의 처리가 어느 쪽에도 속하지 않는 사각이 생긴다.
 *
 * ## 판정 범위 (과잉주장 금지 규약 — `acceptance.md` 표기 규약)
 *
 * AC-PANEL-041이 판정하는 것은 **확장자 조회가 문법을 공급하는가**이고,
 * AC-PANEL-045가 판정하는 것은 **열기 성공과 편집 가능성**이다. 이 파일은
 * 하이라이팅 **결과의 품질**(토큰 분류, 색, 시각 출력)을 단언하지 않는다 —
 * 그런 단언은 요구가 요구하지 않은 것을 주장하는 것이다.
 *
 * ## 배열 모양이 아니라 상태로 잰다
 *
 * 단계3 보완이 실측으로 보인 것: **최상위 항목 배열만 보는 단언은 실제 회귀를
 * 보지 못한다**(공통 슬롯 *안쪽*에 실린 마크다운 동작을 놓쳤다). 그래서 조달의
 * 판정은 슬롯 개수가 아니라 조립된 `EditorState`의 `state.facet(language)`다 —
 * 문법이 어느 슬롯에 어떻게 중첩되어 있든 그 facet은 잡는다.
 */

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

/** 그 경로의 문법을 실제로 적재한다. 조립에 넣을 수 있는 형태로 돌려준다. */
async function loadGrammar(path: string) {
  const desc = grammarDescriptionFor(path);
  if (!desc) throw new Error(`${path}: 문법 정의가 조달되지 않았다`);
  return desc.load();
}

beforeEach(() => {
  views.length = 0;
});

afterEach(() => {
  for (const v of views) v.destroy();
  views.length = 0;
});

// ---------------------------------------------------------------------------
// AC-PANEL-041 `Then` — 각 파일에 대응하는 문법 정의가 조달된다
// ---------------------------------------------------------------------------

describe('AC-PANEL-041 Then — 확장자 조회가 문법 정의를 공급한다', () => {
  it.each([
    ['/w/analysis.py', 'Python'],
    ['/w/data.json', 'JSON'],
    ['/w/conf.yaml', 'YAML'],
  ])('%s → %s', (path, name) => {
    expect(grammarDescriptionFor(path)?.name).toBe(name);
  });

  it('`.yml`도 같은 YAML 정의로 간다 — 같은 카탈로그 항목이다', () => {
    // 같은 객체여야 한다. 다르면 `.yaml`↔`.yml` 재바인딩이 불필요한 재설정을 낳는다.
    expect(grammarDescriptionFor('/w/conf.yml')).toBe(grammarDescriptionFor('/w/conf.yaml'));
  });

  it('경로 구분자와 상위 디렉터리가 조회를 방해하지 않는다', () => {
    expect(grammarDescriptionFor('C:\\proj\\data.json')?.name).toBe('JSON');
    expect(grammarDescriptionFor('/w/sub.dir/conf.yaml')?.name).toBe('YAML');
  });

  it('디렉터리 이름의 확장자를 파일의 것으로 오인하지 않는다', () => {
    // `/w/a.py/README`는 확장자가 없는 파일이다. 여기서 Python을 돌려주면
    // 조회가 basename이 아니라 경로 전체를 보고 있다는 뜻이다.
    expect(grammarDescriptionFor('/w/a.py/README')).toBeNull();
  });

  it('경로가 없으면(untitled) 조회하지 않는다', () => {
    expect(grammarDescriptionFor(null)).toBeNull();
    expect(grammarDescriptionFor('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC-PANEL-041 첫 번째 `And` — 출처가 `@codemirror/language-data`다
// ---------------------------------------------------------------------------

describe('AC-PANEL-041 And① — 문법 정의의 출처가 @codemirror/language-data다', () => {
  /**
   * **이 단언은 개별 패키지 조달과 실제로 구분된다.**
   *
   * 누군가 `@codemirror/lang-python`을 새로 넣고 `LanguageDescription.of({...})`로
   * 손수 만들어 돌려주면 `name`은 그대로 `'Python'`이라 이름 단언은 통과한다.
   * 그러나 그 객체는 카탈로그 배열의 원소가 **아니므로** 아래 동일성 단언이
   * 실패한다. C-11(개별 패키지 금지)을 지키는 것은 이 줄이다.
   */
  it.each(['/w/analysis.py', '/w/data.json', '/w/conf.yaml'])(
    '%s의 정의가 카탈로그 배열의 원소 그 자체다',
    (path) => {
      const desc = grammarDescriptionFor(path);
      expect(desc).not.toBeNull();
      expect(lezerLangs).toContain(desc as LanguageDescription);
    },
  );

  it('조회 수단이 카탈로그 전체를 훑는다 — 세 확장자만 특별 취급하지 않는다', () => {
    // 요구가 열거한 것은 **최소한**이다(REQ-PANEL-041 "최소한 … 다뤄진다").
    // 하드코딩된 3항목 매핑이면 아래가 null이 되어 실패한다.
    expect(grammarDescriptionFor('/w/main.rs')?.name).toBe('Rust');
    expect(grammarDescriptionFor('/w/index.html')?.name).toBe('HTML');
  });
});

// ---------------------------------------------------------------------------
// AC-PANEL-041 두 번째 `And` — 언어별 개별 패키지가 추가되지 않았다
//
// AC 문언은 `git diff` 기반 단언이다. 그 대조는 이 마일스톤의 **증거**로
// 보고에 싣고(§E7), 여기서는 git 체크아웃에 의존하지 않고 **항상 도는**
// 회귀 가드를 둔다 — 미래의 추가를 막는 것은 이쪽이다.
// ---------------------------------------------------------------------------

describe('AC-PANEL-041 And② — @codemirror/lang-* 개별 패키지가 늘지 않았다 (C-11)', () => {
  it('의존성의 lang-* 집합이 마크다운 하나뿐이다', async () => {
    const pkg = (await import('../../package.json')).default as {
      dependencies: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const langKeys = (o: Record<string, string> | undefined) =>
      Object.keys(o ?? {})
        .filter((k) => k.startsWith('@codemirror/lang-'))
        .sort();

    // `040df4a`(이 SPEC 시작 커밋) 기준 값을 옮겨 적었다. 이 SPEC은 여기에
    // 아무것도 더하지 않는다 — `lang-markdown`은 원고 편집용으로 원래 있었다.
    expect(langKeys(pkg.dependencies)).toEqual(['@codemirror/lang-markdown']);
    expect(langKeys(pkg.devDependencies)).toEqual([]);
  });

  it('language-data는 원래부터 의존성이다 — 이 SPEC이 넣은 것이 아니다', async () => {
    const pkg = (await import('../../package.json')).default as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@codemirror/language-data']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// AC-PANEL-041 — 조달된 문법이 실제로 편집 표면에 실린다
//
// 조회가 정의를 돌려주는 것과 그 정의가 패널에 도달하는 것은 별개의 질문이다.
// 여기서는 **조립된 상태의 facet**으로 후자를 잰다.
// ---------------------------------------------------------------------------

describe('AC-PANEL-041 — 조달된 문법이 조립을 통과해 상태에 도달한다', () => {
  it.each([
    ['/w/analysis.py', 'python'],
    ['/w/data.json', 'json'],
    ['/w/conf.yaml', 'yaml'],
  ])('%s의 문법이 state.facet(language)에 실린다', async (path, facetName) => {
    const grammar = await loadGrammar(path);
    const state = stateOf(makeDeps('auxiliary', { grammar }));
    expect(state.facet(language)?.name).toBe(facetName);
  });

  it('보조층 슬롯이 정확히 하나 생긴다', async () => {
    const grammar = await loadGrammar('/w/analysis.py');
    const slots = assembleLayers(makeDeps('auxiliary', { grammar }));
    const aux = slots.filter((s) => s.layer === 'auxiliary');
    expect(aux.map((s) => s.id)).toEqual(['auxiliaryLanguage']);
  });

  it('마크다운 패널에는 보조층이 생기지 않는다 — 문법을 넘겨도 무시된다', async () => {
    const grammar = await loadGrammar('/w/analysis.py');
    const slots = assembleLayers(makeDeps('markdown', { grammar }));
    expect(slots.filter((s) => s.layer === 'auxiliary')).toEqual([]);
    // 마크다운 패널의 언어층은 여전히 마크다운이다.
    expect(stateOf(makeDeps('markdown', { grammar })).facet(language)?.name).toBe('markdown');
  });

  it('조달된 문법이 마크다운 전용 항목을 데려오지 않는다', async () => {
    const grammar = await loadGrammar('/w/analysis.py');
    const layers = assembleLayers(makeDeps('auxiliary', { grammar })).map((s) => s.layer);
    expect(layers.filter((l) => l === 'markdown')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC-PANEL-045 — 문법 정의가 없으면 평문으로 연다
// ---------------------------------------------------------------------------

describe('AC-PANEL-045 Given — 카탈로그에 없는 확장자는 조회가 null이다', () => {
  it.each(['/w/data.csv', '/w/refs.bib', '/w/notes.xyz', '/w/refs.bibtex'])(
    '%s → 문법 정의 없음',
    (path) => {
      expect(grammarDescriptionFor(path)).toBeNull();
    },
  );
});

describe('AC-PANEL-045 Then — 열기가 성공하고 내용이 편집 가능하다', () => {
  it.each([
    ['/w/data.csv', 'a,b,c\n1,2,3'],
    ['/w/refs.bib', '@article{key, title = {T}}'],
    ['/w/notes.xyz', 'anything'],
  ])('%s가 예외 없이 조립되고 평문으로 열린다', (path, doc) => {
    expect(grammarDescriptionFor(path)).toBeNull();
    const deps = makeDeps('auxiliary', { grammar: null });
    expect(() => stateOf(deps, doc)).not.toThrow();
    const state = stateOf(deps, doc);
    // 평문 = 언어층 부재. 폴백을 위해 가짜 언어를 얹지 않는다.
    expect(state.facet(language)).toBeNull();
    expect(state.doc.toString()).toBe(doc);
  });

  it.each([
    ['/w/data.csv', 'a,b'],
    ['/w/refs.bib', '@article{k}'],
    ['/w/notes.xyz', 'x'],
  ])('%s의 내용이 실제로 편집된다', (_path, doc) => {
    const view = viewOf(makeDeps('auxiliary', { grammar: null }), doc);
    view.dispatch({ changes: { from: doc.length, insert: '!' } });
    expect(view.state.doc.toString()).toBe(`${doc}!`);
  });

  /**
   * `refs.bib`는 **규정된 정상 동작**이다 (감사 지적 R7, REQ-PANEL-045).
   *
   * 참고문헌 파일은 이 앱의 핵심 사용자 자산이지만 `@codemirror/language-data`에
   * `.bib`·`.bibtex`가 없고(카탈로그 143개 순회, "bib" 0건), 개별 패키지 도입은
   * C-11에 걸린다. 하이라이팅 없이 열리는 것은 **결함이 아니라 표시 품질의
   * 한계**이며 이 단언이 그것을 문서로 고정한다.
   */
  it('`.bib`가 `.csv`·`.xyz`와 정확히 같은 폴백 경로를 탄다', () => {
    const shape = (path: string) => ({
      grammar: grammarDescriptionFor(path),
      slots: assembleLayers(makeDeps('auxiliary', { grammar: null })).map((s) => s.id),
      auxLayer: assembleLayers(makeDeps('auxiliary', { grammar: null })).filter(
        (s) => s.layer === 'auxiliary',
      ).length,
    });
    expect(shape('/w/refs.bib')).toEqual(shape('/w/data.csv'));
    expect(shape('/w/refs.bib')).toEqual(shape('/w/notes.xyz'));
    expect(shape('/w/refs.bib').grammar).toBeNull();
    expect(shape('/w/refs.bib').auxLayer).toBe(0);
  });

  it('폴백 패널에도 공통층은 온전하다 — 편집기이지 뷰어가 아니다', () => {
    const ids = new Set(assembleLayers(makeDeps('auxiliary', { grammar: null })).map((s) => s.id));
    for (const id of ['history', 'baseKeymap', 'theme', 'lineWrapping', 'changeListener']) {
      expect(ids.has(id), `폴백 패널에 공통 슬롯 ${id}가 없다`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// `.txt`는 보조 경로에 오지 않는다 (REQ-PANEL-040의 `shall not`)
//
// 카탈로그에 `.txt` 문법이 **없으므로**(판 0.3.12 실측) 폴백 사례처럼 보이지만,
// `.txt`는 마크다운 확장자 집합에 있어 애초에 보조로 판정되지 않는다. 그래서
// `.txt` 전용 분기를 두지 않았다 — 아래가 그 판단의 근거다.
// ---------------------------------------------------------------------------

describe('`.txt`는 마크다운이므로 폴백 분기가 필요 없다', () => {
  it('`.txt`의 종류 판정이 마크다운이다', () => {
    expect(fileKindOf('/w/notes.txt')).toBe('markdown');
  });

  it('설령 조회하더라도 카탈로그에 `.txt` 문법은 없다 — 폴백이 이미 덮는다', () => {
    expect(grammarDescriptionFor('/w/notes.txt')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 조회 수단의 부수 효과 — 확장자 없는 잘 알려진 파일명
//
// **요구가 아니다.** 어떤 AC도 이것을 요구하지 않으며 이 동작을 위해 만든
// 코드도 없다. `LanguageDescription.matchFilename`에 basename을 넘긴 결과로
// 딸려온 것이므로, 조용히 좁히지 않기 위해 관측한 그대로 적어 둔다.
// (`Makefile`은 이 카탈로그에 없다 — 실측 결과 `null`이다.)
// ---------------------------------------------------------------------------

describe('[요구 아님 · 관측 기록] 확장자 없는 파일명', () => {
  it('`Dockerfile`은 딸려온다', () => {
    expect(grammarDescriptionFor('/w/Dockerfile')?.name).toBe('Dockerfile');
  });

  it('`Makefile`은 카탈로그에 없어 폴백으로 간다', () => {
    expect(grammarDescriptionFor('/w/Makefile')).toBeNull();
  });
});
