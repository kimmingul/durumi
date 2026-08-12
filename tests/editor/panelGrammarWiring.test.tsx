import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { Transaction, type TransactionSpec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { language } from '@codemirror/language';
import type { Macro } from '@shared/ipc-contract';
import { MarkdownEditor } from '../../src/editor/MarkdownEditor';
import { grammarDescriptionFor } from '../../src/editor/extensionLayers';

/**
 * 언어 문법의 **비동기 조달 배선** — 컴포넌트 경계에서의 판정
 * (SPEC-V03-WORKSPACE-002 M5 단계4, REQ-PANEL-041 · REQ-PANEL-045).
 *
 * ## 왜 별도 파일인가 — 조립은 동기이고 조달은 비동기다
 *
 * `assembleLayers`는 순수 동기 함수이고 `EditorState.create`는 extension을
 * 미리 요구하는데, `LanguageDescription.load()`는 Promise를 돌려준다. 그래서
 * 문법은 **조립의 입력**으로 두고(순수성 유지), 해소는 `MarkdownEditor`의
 * 이펙트 하나가 맡아 종류 컴파트먼트를 재설정한다. 그 배선 —
 * "해소된 문법이 실제로 이 패널의 상태에 도달하는가", "해소가 늦게 도착했을 때
 * 이미 다른 문서로 갈아탄 패널을 오염시키지 않는가" — 는 컴포넌트를 띄워야만
 * 관측된다. `auxiliaryGrammar.test.ts`는 조립 쪽(동기)을 맡는다.
 *
 * ## 경합이 이 파일의 핵심이다
 *
 * 편집 표면은 `key` 없이 재사용되며 문서를 갈아탄다(`PanelContainer.tsx`).
 * 그래서 `.py`의 문법 적재가 진행 중인 동안 패널이 `.csv`로 재바인딩될 수 있고,
 * 늦게 도착한 Python이 그대로 실리면 **CSV 문서에 Python 문법이 붙는다**.
 * 아래 경합 절이 그것을 결정적으로 재현한다 — 재바인딩은 같은 tick에서
 * 동기로 일어나고 적재 완료는 반드시 그 뒤의 마이크로태스크이므로, 타이밍에
 * 기대지 않는다.
 */

interface Mounted {
  root: Root;
  host: HTMLElement;
  view: EditorView;
  readyCount: number;
  rerender: (props: Partial<Parameters<typeof MarkdownEditor>[0]>) => void;
  unmount: () => void;
}

function mountEditor(initial: Parameters<typeof MarkdownEditor>[0]): Mounted {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let view: EditorView | null = null;
  let readyCount = 0;
  let props = { ...initial };
  const onReady = (v: EditorView) => {
    view = v;
    readyCount += 1;
  };
  const render = () => {
    act(() => {
      root.render(<MarkdownEditor {...props} onReady={onReady} />);
    });
  };
  render();
  if (!view) throw new Error('onReady가 호출되지 않았다');
  return {
    root,
    host,
    get view() {
      return view as EditorView;
    },
    get readyCount() {
      return readyCount;
    },
    rerender: (next) => {
      props = { ...props, ...next };
      render();
    },
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

const mounts: Mounted[] = [];

/**
 * **동일 인스턴스**를 넘긴다. `MarkdownEditor`의 `macros = []` 기본값은 렌더마다
 * 새 배열이라 `[macros]` 이펙트가 매 렌더 매크로 컴파트먼트를 재설정한다 —
 * 아래 재설정 카운터가 그 잡음을 세지 않도록 여기서 고정한다. (그 매 렌더
 * 재설정 자체는 이 단계의 범위 밖인 기존 동작이다.)
 */
const STABLE_MACROS: Macro[] = [];

function editor(props: Parameters<typeof MarkdownEditor>[0]): Mounted {
  const m = mountEditor({ macros: STABLE_MACROS, ...props });
  mounts.push(m);
  return m;
}

/**
 * 이 뷰에 오는 **설정 재구성**(컴파트먼트 재설정)의 횟수를 센다.
 *
 * 재설정은 층을 통째로 갈아끼우므로 ViewPlugin이 파기·재생성된다. 종류와 문법이
 * 같은 렌더 사이클에서 함께 움직일 때 이것이 두 번 일어나는 것은 낭비이며,
 * `MarkdownEditor`의 마운트 스킵 주석이 이미 배제한 형태다. 문서 경로 갱신
 * (`setDocPath`)이나 선택 갱신 같은 다른 dispatch는 세지 않는다.
 *
 * 판정은 `Transaction.reconfigured` — `headingHint.ts:80`이 쓰는 것과 같은
 * 공개 신호다. `dispatch(...specs)`가 내부에서 하는 것과 동일하게
 * `state.update(...specs)`로 트랜잭션을 만들어 물어보고, 그 트랜잭션을 그대로
 * 원래 `dispatch`에 넘긴다 — 동작을 바꾸지 않는다.
 */
function countReconfigures(view: EditorView): () => number {
  const original = view.dispatch.bind(view);
  let count = 0;
  vi.spyOn(view, 'dispatch').mockImplementation(((...args: (Transaction | TransactionSpec)[]) => {
    const tr =
      args.length === 1 && args[0] instanceof Transaction
        ? args[0]
        : view.state.update(...(args as TransactionSpec[]));
    if (tr.reconfigured) count += 1;
    return original(tr);
  }) as EditorView['dispatch']);
  return () => count;
}

/**
 * 문법 적재(동적 import)와 그에 따른 재렌더·재설정이 모두 끝날 때까지 흘린다.
 *
 * 마이크로태스크 하나로는 부족하다 — `load()`는 동적 import 체인이고 그 뒤에
 * React의 상태 갱신과 이펙트가 한 번 더 붙는다. 매크로태스크 몇 번을 도는 것이
 * 특정 tick 수에 기대는 것보다 안전하다.
 */
async function settle(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function langName(m: Mounted): string | null {
  return m.view.state.facet(language)?.name ?? null;
}

afterEach(() => {
  for (const m of mounts) m.unmount();
  mounts.length = 0;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// AC-PANEL-041 — 각 파일을 보조 패널로 열면 그 문법이 실린다
// ---------------------------------------------------------------------------

describe('AC-PANEL-041 — 보조 패널이 언어 문법을 받는다', () => {
  it.each([
    ['/w/analysis.py', 'x = 1', 'python'],
    ['/w/data.json', '{"a":1}', 'json'],
    ['/w/conf.yaml', 'a: 1', 'yaml'],
  ])('%s (내용 %s) 패널의 언어층이 %s가 된다', async (filePath, value, expected) => {
    const m = editor({ value, filePath, kind: 'auxiliary' });
    await settle();
    expect(langName(m)).toBe(expected);
  });

  it('`.yml`도 YAML로 열린다', async () => {
    const m = editor({ value: 'a: 1', filePath: '/w/conf.yml', kind: 'auxiliary' });
    await settle();
    expect(langName(m)).toBe('yaml');
  });

  it('문법이 실려도 편집과 변경 통보는 그대로 동작한다', async () => {
    const onChange = vi.fn();
    const m = editor({ value: 'x = 1', filePath: '/w/analysis.py', kind: 'auxiliary', onChange });
    await settle();
    expect(langName(m)).toBe('python');
    act(() => {
      m.view.dispatch({ changes: { from: 5, insert: '\ny = 2' } });
    });
    expect(onChange).toHaveBeenCalledWith('x = 1\ny = 2');
  });

  it('문법 조달이 편집 표면을 다시 만들지 않는다 — M0의 라우팅 등록이 흔들리지 않는다', async () => {
    const m = editor({ value: 'x = 1', filePath: '/w/analysis.py', kind: 'auxiliary' });
    const before = m.view;
    await settle();
    expect(langName(m)).toBe('python');
    // `onReady`가 다시 불리지 않았다 = `readyView`가 그대로다 = M0의
    // `[filePath, readyView]` 이펙트(조합 게이트 → 실행자 분리 순서를 담은 그것)가
    // 문법 조달 때문에 재실행되지 않았다.
    expect(m.readyCount).toBe(1);
    expect(m.view).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// AC-PANEL-045 — 문법이 없으면 평문으로 열리고 편집된다
// ---------------------------------------------------------------------------

describe('AC-PANEL-045 — 문법 없는 확장자는 평문으로 열린다', () => {
  it.each([
    ['/w/data.csv', 'a,b,c\n1,2,3'],
    ['/w/refs.bib', '@article{key, title = {T}}'],
    ['/w/notes.xyz', 'anything'],
  ])('%s 패널이 열리고 언어층 없이 내용을 보인다', async (filePath, value) => {
    const m = editor({ value, filePath, kind: 'auxiliary' });
    await settle();
    expect(langName(m)).toBeNull();
    expect(m.view.state.doc.toString()).toBe(value);
  });

  it.each([
    ['/w/data.csv', 'a,b'],
    ['/w/refs.bib', '@article{k}'],
    ['/w/notes.xyz', 'x'],
  ])('%s의 내용이 편집 가능하다', async (filePath, value) => {
    const onChange = vi.fn();
    const m = editor({ value, filePath, kind: 'auxiliary', onChange });
    await settle();
    act(() => {
      m.view.dispatch({ changes: { from: value.length, insert: '!' } });
    });
    expect(m.view.state.doc.toString()).toBe(`${value}!`);
    expect(onChange).toHaveBeenCalledWith(`${value}!`);
  });

  it('폴백 경로가 오류·경고를 내지 않는다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const [filePath, value] of [
      ['/w/data.csv', 'a,b'],
      ['/w/refs.bib', '@article{k}'],
      ['/w/notes.xyz', 'x'],
    ] as const) {
      const m = editor({ value, filePath, kind: 'auxiliary' });
      // eslint-disable-next-line no-await-in-loop
      await settle();
      act(() => {
        m.view.dispatch({ changes: { from: value.length, insert: '!' } });
      });
    }
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  /**
   * `refs.bib`는 **규정된 정상 동작**이다 (REQ-PANEL-045, 감사 지적 R7).
   * 결함 보고 대상이 아니라는 사실을 이 단언이 문서로 고정한다.
   */
  it('`refs.bib`가 `data.csv`와 같은 폴백 경로를 탄다', async () => {
    expect(grammarDescriptionFor('/w/refs.bib')).toBeNull();
    const bib = editor({ value: '@article{k}', filePath: '/w/refs.bib', kind: 'auxiliary' });
    const csv = editor({ value: 'a,b', filePath: '/w/data.csv', kind: 'auxiliary' });
    await settle();
    expect(langName(bib)).toBeNull();
    expect(langName(csv)).toBeNull();
    expect(langName(bib)).toBe(langName(csv));
  });
});

// ---------------------------------------------------------------------------
// 경합 — 늦게 도착한 해소가 이미 갈아탄 패널을 오염시키지 않는다
// ---------------------------------------------------------------------------

/**
 * **경합을 재려면 적재가 실제로 진행 중이어야 한다 — 실측으로 배운 것.**
 *
 * 이 절의 초판은 `.py`로 경합을 만들려 했고 통과했지만, **아무것도 재고 있지
 * 않았다.** 반증(경합 방어 제거)을 주입해도 통과했기 때문에 그것이 드러났다.
 * 원인: 같은 파일의 앞선 테스트들이 이미 Python을 적재해 두었고,
 * `MarkdownEditor`의 해소 이펙트는 `desc.support`가 이미 있으면 **동기로 적용하고
 * `load()`를 아예 부르지 않는다**. 진행 중인 적재가 없으니 늦게 도착할 것도 없다.
 *
 * 그래서 이 절은 **이 파일의 다른 어떤 테스트도 적재하지 않는 언어**만 쓰고,
 * 각 테스트가 시작할 때 `support === undefined`(차갑다)를 먼저 단언한다. 그
 * 전제가 깨지면 카운트가 조용히 달라지는 대신 여기서 실패한다.
 *
 * 따라서 이 절이 지키는 것은 **차가운 첫 적재 중의 재바인딩**이다. 따뜻한
 * 경로에는 애초에 경합이 없다(동기로 끝난다).
 */
describe('문법 해소의 경합 (차가운 적재 중 재바인딩)', () => {
  /** 이 파일의 다른 테스트가 이 언어를 적재하지 않았음을 확인한다. */
  function assertCold(path: string): void {
    const desc = grammarDescriptionFor(path);
    expect(desc, `${path}: 카탈로그에 정의가 없다`).not.toBeNull();
    expect(desc?.support, `${path}: 이미 적재되어 있어 경합을 잴 수 없다`).toBeUndefined();
  }

  it('Go 적재 중에 `.csv`로 갈아타면 늦게 온 Go가 실리지 않는다', async () => {
    assertCold('/w/a.go');
    // 마운트 직후 — 적재는 시작됐지만 **아직 해소되지 않았다**(동적 import는
    // 반드시 마이크로태스크 뒤에 끝난다). 그 사이에 동기로 재바인딩한다.
    const m = editor({ value: 'package main', filePath: '/w/a.go', kind: 'auxiliary' });
    expect(langName(m)).toBeNull();
    m.rerender({ value: 'a,b', filePath: '/w/data.csv' });
    await settle();
    expect(langName(m)).toBeNull();
    expect(m.view.state.doc.toString()).toBe('a,b');
  });

  it('Ruby 적재 중에 이미 적재된 `.json`으로 갈아타면 늦게 온 Ruby가 이기지 못한다', async () => {
    assertCold('/w/a.rb');
    // JSON은 앞선 절이 이미 적재했다(따뜻하다). 그래서 재바인딩이 **동기로**
    // JSON을 적용하고 Ruby가 **그 뒤에** 도착한다 — "늦게 온 쪽이 이긴다"는
    // 결함이 있다면 최종 언어가 Ruby가 된다.
    await grammarDescriptionFor('/w/data.json')?.load();
    const m = editor({ value: 'puts 1', filePath: '/w/a.rb', kind: 'auxiliary' });
    m.rerender({ value: '{"a":1}', filePath: '/w/data.json' });
    expect(langName(m)).toBe('json');
    await settle();
    expect(langName(m)).toBe('json');
  });

  it('PHP 적재 중에 마크다운 원고로 갈아타면 마크다운층이 남는다', async () => {
    assertCold('/w/a.php');
    const m = editor({ value: '<?php', filePath: '/w/a.php', kind: 'auxiliary' });
    m.rerender({ value: '# 원고', filePath: '/w/paper.md', kind: 'markdown' });
    expect(langName(m)).toBe('markdown');
    await settle();
    // 늦게 온 PHP가 실리면 이 패널은 다시 보조 조립이 되어 마크다운층을 잃는다.
    expect(langName(m)).toBe('markdown');
  });

  it('Lua 적재 중에 마운트가 해제되어도 예외가 나지 않는다', async () => {
    assertCold('/w/a.lua');
    const m = mountEditor({ value: 'x = 1', filePath: '/w/a.lua', kind: 'auxiliary' });
    m.unmount();
    await expect(settle()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 재설정 횟수 — 문법 축이 중복 재설정을 만들지 않는다
// ---------------------------------------------------------------------------

describe('문법 축이 중복 재설정을 만들지 않는다', () => {
  it('대조군 — 내용만 바뀌면 재설정이 0이다 (카운터가 잡음을 세지 않는다)', async () => {
    const m = editor({ value: 'x = 1', filePath: '/w/analysis.py', kind: 'auxiliary' });
    await settle();
    const count = countReconfigures(m.view);
    m.rerender({ value: 'x = 2' });
    await settle();
    expect(count()).toBe(0);
  });

  /**
   * 종류와 문법은 **같은 전환에서 함께** 움직인다 — 보조(Python 실림) → 원고이면
   * 종류는 `markdown`이 되고 문법은 `null`이 된다. 둘을 각각 재설정 조건으로
   * 삼으면 한 번의 전환에 두 번의 재설정이 나간다. 적용된 조합을 **하나의
   * 정체성**으로 비교해야 한 번으로 끝난다.
   */
  it('문법이 실린 보조 패널에서 원고로 돌아갈 때 재설정이 정확히 한 번이다', async () => {
    const m = editor({ value: 'x = 1', filePath: '/w/analysis.py', kind: 'auxiliary' });
    await settle();
    expect(langName(m)).toBe('python');
    const count = countReconfigures(m.view);

    m.rerender({ value: '#foo', filePath: '/w/paper.md', kind: 'markdown' });
    await settle();
    expect(langName(m)).toBe('markdown');
    expect(count()).toBe(1);
  });

  it('같은 문법의 다른 파일로 갈아타면 재설정하지 않는다 (`.yaml` → `.yml`)', async () => {
    const m = editor({ value: 'a: 1', filePath: '/w/conf.yaml', kind: 'auxiliary' });
    await settle();
    expect(langName(m)).toBe('yaml');
    const count = countReconfigures(m.view);
    m.rerender({ value: 'b: 2', filePath: '/w/other.yml' });
    await settle();
    // 같은 카탈로그 항목이므로 해소 결과가 **동일 인스턴스**이고, 적용 정체성이
    // 변하지 않아 재설정을 건너뛴다.
    expect(langName(m)).toBe('yaml');
    expect(count()).toBe(0);
  });

  it('이미 적재된 다른 문법으로 갈아타면 재설정이 한 번이다 (`.py` → `.json`)', async () => {
    // 두 문법을 미리 적재해 **따뜻한 경로**를 고정한다. 그래야 카운트가
    // 적재 이력에 흔들리지 않는다 — 차가운 경로는 아래 테스트가 따로 잰다.
    await grammarDescriptionFor('/w/data.json')?.load();
    const m = editor({ value: 'x = 1', filePath: '/w/analysis.py', kind: 'auxiliary' });
    await settle();
    expect(langName(m)).toBe('python');
    const count = countReconfigures(m.view);
    m.rerender({ value: '{"a":1}', filePath: '/w/data.json' });
    await settle();
    expect(langName(m)).toBe('json');
    // 적재가 끝나 있으므로 중간 평문 단계 없이 곧바로 JSON으로 간다.
    expect(count()).toBe(1);
  });

  /**
   * **차가운 경로는 두 걸음이고, 그것이 의도다.**
   *
   * 적재가 끝나지 않은 언어로 갈아탈 때 옛 문법을 그대로 두면 새 문서가 잠시
   * **다른 언어의 문법**으로 칠해진다. 평문(`null`)으로 먼저 내리는 것은
   * REQ-PANEL-045가 규정한 상태로 잠깐 머무는 것이고, 그대로 두는 것은 내용에
   * 대한 거짓 주장이다. 그래서 재설정 한 번을 더 쓴다.
   */
  it('아직 적재되지 않은 문법으로 갈아타면 평문을 거쳐 두 번 재설정한다', async () => {
    // 이 파일에서 Rust를 적재하는 다른 테스트가 없어야 이 측정이 성립한다.
    // 조건이 깨지면 카운트가 조용히 달라지는 대신 여기서 실패한다.
    expect(grammarDescriptionFor('/w/main.rs')?.support).toBeUndefined();

    const m = editor({ value: 'x = 1', filePath: '/w/analysis.py', kind: 'auxiliary' });
    await settle();
    expect(langName(m)).toBe('python');
    const count = countReconfigures(m.view);

    m.rerender({ value: 'fn main() {}', filePath: '/w/main.rs' });
    // 첫 걸음 — 아직 적재 전이므로 Python을 즉시 내린다.
    expect(langName(m)).toBeNull();
    await settle();
    // 두 번째 걸음 — 적재가 끝나 Rust가 실린다.
    expect(langName(m)).toBe('rust');
    expect(count()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 회귀 — 마크다운 패널은 이 축의 영향을 받지 않는다
// ---------------------------------------------------------------------------

describe('마크다운 패널 회귀', () => {
  it('원고 패널의 언어층은 마크다운 그대로다', async () => {
    const m = editor({ value: '# 원고', filePath: '/w/paper.md', kind: 'markdown' });
    await settle();
    expect(langName(m)).toBe('markdown');
  });

  it('`.txt` 원고도 마크다운으로 열린다 — 보조 문법 조달이 끼어들지 않는다', async () => {
    // `kind`의 출처는 문서다(`PanelContainer`). `.txt`는 `MARKDOWN_EXTENSIONS`에
    // 있으므로 스토어가 마크다운으로 만든다.
    const m = editor({ value: 'plain', filePath: '/w/notes.txt', kind: 'markdown' });
    await settle();
    expect(langName(m)).toBe('markdown');
  });

  it('untitled 원고에는 조회 자체가 일어나지 않는다', async () => {
    const m = editor({ value: '# 새 원고', filePath: null, kind: 'markdown' });
    await settle();
    expect(langName(m)).toBe('markdown');
  });

  it('경로 없는 보조 패널은 평문으로 남는다', async () => {
    const m = editor({ value: 'x', filePath: null, kind: 'auxiliary' });
    await settle();
    expect(langName(m)).toBeNull();
  });
});
