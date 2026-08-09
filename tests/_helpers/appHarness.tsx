import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../../src/App';

/**
 * `App` 전체를 jsdom에 마운트하는 하네스.
 *
 * SPEC-V03-WORKSPACE-002 M2의 1차 산출물은 **단일 패널 축퇴가 오늘의 동작과
 * 관측상 구분되지 않는 것**이며(AC-PANEL-003b), 그것을 판정하려면 렌더 트리를
 * 실제로 만들어 봐야 한다. 대체하는 것은 preload 브리지(`window.api`)뿐이다.
 *
 * 알려지지 않은 채널은 프록시가 흡수한다 — 목적은 IPC 계약 검증이 아니라 레이아웃
 * 관측이고, 채널이 하나 늘 때마다 이 하네스가 깨지면 회귀 방어선이 오히려 약해진다.
 * `on*` 계열만은 **구독 해제 함수를 돌려줘야 하므로** 따로 다룬다.
 */

export interface FakeApiOverrides {
  [channel: string]: unknown;
}

export function installFakeApi(overrides: FakeApiOverrides = {}): void {
  const sub = () => () => {};
  const base: Record<string, unknown> = {
    prefsGet: async () => ({}),
    // 실패 형태를 돌려주는 채널들 — 호출부가 `.ok`를 읽으므로 undefined를
    // 돌려주면 언핸들드 거부가 된다. 무엇도 찾지 못한 상태를 흉내낸다.
    bibliographyFind: async () => null,
    bibliographyComputePath: async () => ({ ok: false as const }),
    prefsSet: async () => undefined,
    customCssGet: async () => '',
    macrosGet: async () => [],
    gitGetStatus: async () => null,
    aiHasKey: async () => false,
    onCustomCssChanged: sub,
    onThemeChanged: sub,
    onMacrosChanged: sub,
    onGitStatusChanged: sub,
    onAppRequestClose: sub,
    onExternalFileChange: sub,
    onMenuCommand: sub,
    ...overrides,
  };

  (window as unknown as { api: unknown }).api = new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      if (typeof prop === 'string' && prop.startsWith('on')) return sub;
      // 결과 객체를 기대하는 호출부가 많으므로 `{ ok: false }`를 기본으로 둔다 —
      // `undefined`를 돌려주면 `.ok` 접근이 언핸들드 거부가 된다.
      return async () => ({ ok: false });
    },
  });
}

export interface MountedApp {
  host: HTMLElement;
  root: Root;
  unmount: () => void;
}

export function mountApp(): MountedApp {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<App />);
  });
  return {
    host,
    root,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// 구조 다이제스트
// ---------------------------------------------------------------------------

/** 배치를 규정하는 스타일만 추린다 — 색·여백 같은 표현은 대상이 아니다. */
const LAYOUT_STYLE_KEYS = [
  'display',
  'flex',
  'flexDirection',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'minWidth',
  'minHeight',
  'overflow',
  'width',
  'height',
] as const;

interface NodeDigest {
  tag: string;
  className: string;
  /** 배치 관련 인라인 스타일만. */
  style: Record<string, string>;
  /** 레이아웃 판정에 쓰이는 data-* 표식. */
  data: Record<string, string>;
  children: NodeDigest[];
}

function styleOf(el: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of LAYOUT_STYLE_KEYS) {
    const v = el.style[key];
    if (v) out[key] = v;
  }
  return out;
}

function dataOf(el: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of el.getAttributeNames()) {
    if (name.startsWith('data-')) out[name] = el.getAttribute(name) ?? '';
  }
  return out;
}

/**
 * 렌더 트리의 **구조**를 깊이 제한으로 찍는다.
 *
 * 깊이를 자르는 이유: 에디터 내부(CodeMirror가 만드는 DOM)는 이 SPEC의 관심이
 * 아니고, 거기까지 고정하면 CodeMirror 판올림마다 회귀 방어선이 오탐을 낸다.
 * 관심은 좌/중앙/우 형제 순서와 각자의 flex 계열 스타일이다.
 */
export function layoutDigest(root: HTMLElement, maxDepth = 4): NodeDigest {
  const walk = (el: HTMLElement, depth: number): NodeDigest => ({
    tag: el.tagName.toLowerCase(),
    className: el.className || '',
    style: styleOf(el),
    data: dataOf(el),
    children:
      depth >= maxDepth
        ? []
        : [...el.children].map((c) => walk(c as HTMLElement, depth + 1)),
  });
  return walk(root, 0);
}

/** AC-PANEL-003b가 이름 붙인 세 가지 관측 대상. */
export interface LayoutFacts {
  /** (b) 편집 표면의 존재와 개수. */
  cmHostCount: number;
  cmContentCount: number;
  /** (c) 상태바·조정 표면의 마운트 위치 (최상위 자식 인덱스, 없으면 -1). */
  statusBarIndex: number;
  reconcileSurfaceIndex: number;
  /** 패널 다중화를 시사하는 시각 요소. 단일 패널에서는 전부 0이어야 한다. */
  panelResizers: number;
  panelTabs: number;
  panelFrames: number;
}

export function layoutFacts(root: HTMLElement): LayoutFacts {
  const top = root.firstElementChild;
  const topChildren = top ? [...top.children] : [];
  const indexOfMatching = (selector: string): number =>
    topChildren.findIndex((c) => c.matches(selector) || c.querySelector(selector) !== null);

  return {
    cmHostCount: root.querySelectorAll('.cm-host').length,
    cmContentCount: root.querySelectorAll('.cm-content').length,
    statusBarIndex: indexOfMatching('[data-testid="status-bar"], .status-bar'),
    reconcileSurfaceIndex: indexOfMatching('[data-reconcile-surface]'),
    panelResizers: root.querySelectorAll('[data-panel-resizer]').length,
    panelTabs: root.querySelectorAll('[data-panel-tab]').length,
    panelFrames: root.querySelectorAll('[data-panel-frame]').length,
  };
}
