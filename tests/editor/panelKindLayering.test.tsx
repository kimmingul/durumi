import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { EditorView } from '@codemirror/view';
import { language } from '@codemirror/language';
import { MarkdownEditor } from '../../src/editor/MarkdownEditor';
import { currentEditMode } from '../../src/editor/editMode';
import { installFakeApi, mountApp, type MountedApp } from '../_helpers/appHarness';
import { activeDocument, documentOf, useWorkspaceStore } from '../../src/store/workspaceStore';

/**
 * 패널 종류에 따른 층 적용 — 컴포넌트 경계에서의 판정
 * (SPEC-V03-WORKSPACE-002 M5 단계3, REQ-PANEL-042).
 *
 * 층 조립 자체의 계약은 `extensionLayers.test.ts`가 고정한다. 여기서 보는 것은
 * **그 조립이 실제 편집 표면에 도달하는가**와, 편집 표면이 문서를 갈아탈 때
 * 층이 따라가는가다.
 *
 * ## 왜 별도 파일인가
 *
 * 순수 조립은 `EditorView` 없이 판정된다. 반면 아래 두 가지는 컴포넌트를 띄워야
 * 관측된다:
 *  - `filePath === null`(untitled)이 **마크다운으로 열리는가** — 경로에서
 *    종류를 파생시키는 구현이면 `fileKindOf('')`가 보조를 돌려주어 새 원고가
 *    전부 평문 패널이 된다. 이 회귀는 즉시 눈에 보이고 심각하다.
 *  - 하나의 `EditorView`가 문서를 갈아탈 때 층이 갈리는가 — 편집 표면은
 *    `key` 없이 재사용되므로 마운트 시점의 층이 그대로 남는 것이 기본 동작이다.
 *
 * ## 보조 패널의 언어층 단언은 M5 단계4에서 형태가 바뀌었다
 *
 * 단계3까지 이 파일은 보조 패널에 대해 `facet(language)`가 **null**임을 단언했다.
 * 보조층이 비어 있어 어떤 언어도 실리지 않았기 때문이다. 단계4가 언어 문법을
 * 조달하면서(REQ-PANEL-041) `.py` 패널의 그 facet은 **Python이 정상**이 되었다.
 *
 * 그래서 단언을 "언어층이 없다" → **"마크다운 언어층이 아니다"** 로 바꿨다.
 * 이 파일이 원래 재던 것이 그것이고(테스트 이름들이 이미 "마크다운 언어층이
 * 사라진다"라고 말한다), 어떤 언어가 실제로 실리는가는
 * `panelGrammarWiring.test.tsx`가 소유한다. **완화가 아니라 정정이다** — 옛
 * 단언은 이제 참이 아니고, 참이었던 동안에도 적재 타이밍에 기대고 있었다
 * (문법 적재는 비동기라, 같은 단언이 차가운 첫 마운트에서는 통과하고 따뜻한
 * 재바인딩에서는 실패했다 — 단계4가 그것을 실측으로 드러냈다).
 */

/** 이 패널에 실린 언어의 이름. 언어층이 없으면 `null`. */
function langName(view: EditorView): string | null {
  return view.state.facet(language)?.name ?? null;
}

const store = () => useWorkspaceStore.getState();

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
  const mounted: Mounted = {
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
  return mounted;
}

const mounts: Mounted[] = [];

function editor(props: Parameters<typeof MarkdownEditor>[0]): Mounted {
  const m = mountEditor(props);
  mounts.push(m);
  return m;
}

let app: MountedApp | null = null;

beforeEach(() => {
  store().reset();
  installFakeApi();
});

afterEach(() => {
  for (const m of mounts) m.unmount();
  mounts.length = 0;
  app?.unmount();
  app = null;
});

// ---------------------------------------------------------------------------
// 위험 (2) — untitled 문서가 보조로 떨어지지 않는다
// ---------------------------------------------------------------------------

describe('untitled 문서는 마크다운으로 열린다', () => {
  it('filePath가 null이어도 마크다운층이 실린다', () => {
    const m = editor({ value: '# 새 원고', filePath: null });
    expect(m.view.state.facet(language)?.name).toBe('markdown');
  });

  it('종류를 넘기지 않으면 기본이 마크다운이다', () => {
    const m = editor({ value: '' });
    expect(m.view.state.facet(language)?.name).toBe('markdown');
  });

  it('스토어의 시작 문서(untitled)가 마크다운 종류다', () => {
    expect(activeDocument(store())?.path).toBeNull();
    expect(activeDocument(store())?.kind).toBe('markdown');
  });
});

// ---------------------------------------------------------------------------
// 보조 패널
// ---------------------------------------------------------------------------

describe('보조 패널', () => {
  it('kind가 auxiliary면 마크다운 언어층이 없다', () => {
    const m = editor({ value: 'x = 1', filePath: '/w/a.py', kind: 'auxiliary' });
    expect(langName(m.view)).not.toBe('markdown');
  });

  it('보조 패널에도 편집과 변경 통보는 그대로 동작한다', () => {
    const onChange = vi.fn();
    const m = editor({ value: 'x = 1', filePath: '/w/a.py', kind: 'auxiliary', onChange });
    act(() => {
      m.view.dispatch({ changes: { from: 5, insert: '\ny = 2' } });
    });
    expect(onChange).toHaveBeenCalledWith('x = 1\ny = 2');
  });
});

// ---------------------------------------------------------------------------
// 위험 (1) — 재사용되는 편집 표면에서 종류를 갈아탄다
// ---------------------------------------------------------------------------

describe('문서를 갈아탈 때 층이 따라간다', () => {
  it('마크다운 → 보조로 재바인딩하면 마크다운 언어층이 사라진다', () => {
    const m = editor({ value: '# 원고', filePath: '/w/a.md', kind: 'markdown' });
    expect(langName(m.view)).toBe('markdown');
    m.rerender({ value: 'x = 1', filePath: '/w/a.py', kind: 'auxiliary' });
    expect(langName(m.view)).not.toBe('markdown');
  });

  it('보조 → 마크다운으로 되돌리면 마크다운층이 복원된다', () => {
    const m = editor({ value: 'x = 1', filePath: '/w/a.py', kind: 'auxiliary' });
    m.rerender({ value: '# 원고', filePath: '/w/a.md', kind: 'markdown' });
    expect(m.view.state.facet(language)?.name).toBe('markdown');
  });

  it('종류 전환이 편집 표면을 다시 만들지 않는다 — M0의 라우팅 등록이 흔들리지 않는다', () => {
    const m = editor({ value: '# 원고', filePath: '/w/a.md', kind: 'markdown' });
    const before = m.view;
    m.rerender({ value: 'x = 1', filePath: '/w/a.py', kind: 'auxiliary' });
    // `onReady`가 다시 불리지 않았다 = `readyView`가 그대로다 = M0의
    // `[filePath, readyView]` 이펙트가 종류 때문에 재실행되지 않았다.
    expect(m.readyCount).toBe(1);
    expect(m.view).toBe(before);
  });

  it('종류가 그대로면 재설정하지 않는다 — 마운트 직후 중복 재설정이 없다', () => {
    const m = editor({ value: '# 원고', filePath: '/w/a.md', kind: 'markdown' });
    const decorationsBefore = m.view.state.facet(EditorView.decorations).length;
    m.rerender({ value: '# 원고 2', filePath: '/w/b.md', kind: 'markdown' });
    expect(m.view.state.facet(EditorView.decorations).length).toBe(decorationsBefore);
    expect(m.readyCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 회귀 — 마크다운 패널의 관측 가능한 동작은 그대로다
// ---------------------------------------------------------------------------

describe('마크다운 패널 회귀', () => {
  it('3-모드 전환이 데코레이션 집합을 갈아끼운다', () => {
    const m = editor({ value: '**굵게**', filePath: '/w/a.md', editMode: 'wysiwyg' });
    const wysiwyg = m.view.state.facet(EditorView.decorations).length;
    expect(wysiwyg).toBeGreaterThan(0);
    m.rerender({ editMode: 'markdown' });
    expect(currentEditMode(m.view.state)).toBe('markdown');
    expect(m.view.state.facet(EditorView.decorations).length).toBeLessThan(wysiwyg);
    m.rerender({ editMode: 'wysiwyg' });
    expect(m.view.state.facet(EditorView.decorations).length).toBe(wysiwyg);
  });

  it('종류를 갈아탄 뒤에도 모드 전환이 마크다운 패널에서 동작한다', () => {
    const m = editor({ value: '**굵게**', filePath: '/w/a.py', kind: 'auxiliary' });
    m.rerender({ value: '**굵게**', filePath: '/w/a.md', kind: 'markdown', editMode: 'wysiwyg' });
    const wysiwyg = m.view.state.facet(EditorView.decorations).length;
    m.rerender({ editMode: 'markdown' });
    expect(m.view.state.facet(EditorView.decorations).length).toBeLessThan(wysiwyg);
  });

  it('보조 패널에서의 모드 전환은 예외 없이 무시된다 (REQ-PANEL-022)', () => {
    const m = editor({ value: 'x = 1', filePath: '/w/a.py', kind: 'auxiliary' });
    const before = m.view.state.facet(EditorView.decorations).length;
    expect(() => m.rerender({ editMode: 'wysiwyg' })).not.toThrow();
    expect(m.view.state.facet(EditorView.decorations).length).toBe(before);
    expect(m.view.state.doc.toString()).toBe('x = 1');
  });
});

// ---------------------------------------------------------------------------
// 배선 — 종류의 출처는 문서다
// ---------------------------------------------------------------------------

describe('PanelContainer가 문서의 종류를 편집 표면에 넘긴다', () => {
  function soleView(host: HTMLElement): EditorView {
    const el = host.querySelector('.cm-content');
    if (!el) throw new Error('.cm-content가 없다');
    const view = EditorView.findFromDOM(el as HTMLElement);
    if (!view) throw new Error('EditorView를 찾지 못했다');
    return view;
  }

  it('시작 상태(untitled)의 패널은 마크다운층을 받는다', () => {
    app = mountApp();
    expect(soleView(app.host).state.facet(language)?.name).toBe('markdown');
  });

  it('보조 파일을 열면 그 패널의 마크다운층이 사라진다', () => {
    app = mountApp();
    act(() => {
      store().openInActivePanel('/w/analysis.py', 'x = 1', 'auxiliary');
    });
    const panelId = store().activePanelId;
    expect(panelId).not.toBeNull();
    expect(documentOf(store(), panelId as string)?.kind).toBe('auxiliary');
    expect(langName(soleView(app.host))).not.toBe('markdown');
  });

  it('보조 파일 위에 다시 원고를 열면 마크다운층이 돌아온다', () => {
    app = mountApp();
    act(() => {
      store().openInActivePanel('/w/analysis.py', 'x = 1', 'auxiliary');
    });
    act(() => {
      store().openInActivePanel('/w/paper.md', '# 원고', 'markdown');
    });
    expect(soleView(app.host).state.facet(language)?.name).toBe('markdown');
  });
});
