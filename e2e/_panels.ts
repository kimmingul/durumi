import { type Locator, type Page } from '@playwright/test';

/**
 * 패널 지목 헬퍼 (SPEC-V03-WORKSPACE-002 M4-2 / AC-PANEL-095, `plan.md` §B.8).
 *
 * ## 왜 이 파일이 있는가
 *
 * v0.2까지 e2e는 `.cm-content`를 **창 안 유일 요소로 가정**했다 —
 * `page.locator('.cm-content')`, `document.querySelector('.cm-content')`.
 * 패널이 둘 이상이면 그 전제가 깨지고, 깨지는 방식이 고약하다: Playwright의
 * `locator.click()`은 strict mode 위반으로 **실패**하지만
 * `document.querySelector`는 조용히 **첫 번째**를 집는다. 후자는 초록을 유지한 채
 * 엉뚱한 패널을 검사한다.
 *
 * ## 왜 헬퍼를 거치는가
 *
 * 35개 파일이 속성 문자열을 직접 쓰면 표식 이름을 바꿀 때 35개를 고쳐야 한다.
 * 여기를 거치면 한 파일이다. 그래서 **로케이터와 셀렉터 문자열 양쪽**을 여기서
 * 내보낸다 — `page.evaluate` 안에서는 로케이터를 쓸 수 없고 셀렉터 문자열이
 * 필요하기 때문이다(인자로 넘겨 받는다).
 *
 * ## 지목 축이 index·active인 이유
 *
 * `panelId`는 런타임 생성 문자열이라 e2e가 예측할 수 없다. 그래서 위치
 * (`data-panel-index`, 렌더 순서 0-based)와 활성 여부(`data-panel-active`,
 * 활성 패널에만 존재)로 지목한다. 표식은 `src/components/PanelContainer.tsx`가
 * 패널 최외곽에 붙인다.
 */

/** 패널 하나. */
export const PANEL = '[data-panel]';
/** 활성 패널. 창에 언제나 정확히 하나 있다. */
export const ACTIVE_PANEL = '[data-panel][data-panel-active]';

/** N번(0-based) 패널. */
export function panelSelector(index: number): string {
  return `[data-panel][data-panel-index="${index}"]`;
}

/** 활성 패널의 편집 표면. `.cm-content`를 쓰던 자리의 대체물이다. */
export const ACTIVE_CONTENT = `${ACTIVE_PANEL} .cm-content`;
/** 활성 패널의 에디터 루트. `.cm-editor`를 쓰던 자리의 대체물이다. */
export const ACTIVE_EDITOR = `${ACTIVE_PANEL} .cm-editor`;
/** 활성 패널의 조정 표면(배너·상태). 배너는 패널 안에 산다(REQ-PANEL-053). */
export const ACTIVE_RECONCILE_SURFACE = `${ACTIVE_PANEL} [data-reconcile-surface]`;

/** N번 패널의 편집 표면. */
export function contentSelector(index: number): string {
  return `${panelSelector(index)} .cm-content`;
}

/** N번 패널의 에디터 루트. */
export function editorSelector(index: number): string {
  return `${panelSelector(index)} .cm-editor`;
}

/** N번 패널의 조정 표면. */
export function reconcileSurfaceSelector(index: number): string {
  return `${panelSelector(index)} [data-reconcile-surface]`;
}

// ---------------------------------------------------------------------------
// 로케이터
// ---------------------------------------------------------------------------

/** 활성 패널. */
export function activePanel(page: Page): Locator {
  return page.locator(ACTIVE_PANEL);
}

/** N번(0-based) 패널. */
export function panelAt(page: Page, index: number): Locator {
  return page.locator(panelSelector(index));
}

/** 활성 패널의 편집 표면. */
export function activeContent(page: Page): Locator {
  return page.locator(ACTIVE_CONTENT);
}

/** N번 패널의 편집 표면. */
export function contentAt(page: Page, index: number): Locator {
  return page.locator(contentSelector(index));
}

/** 활성 패널의 조정 표면. */
export function activeReconcileSurface(page: Page): Locator {
  return page.locator(ACTIVE_RECONCILE_SURFACE);
}

/** 열려 있는 패널 수. `.cm-content` 개수를 세던 자리의 대체물이다. */
export function panelCount(page: Page): Promise<number> {
  return page.locator(PANEL).count();
}

/**
 * 활성 패널의 편집 표면이 마운트될 때까지 기다린다.
 * `page.waitForSelector('.cm-content')`를 쓰던 자리의 대체물이다.
 */
export async function waitForActiveContent(
  page: Page,
  options: { timeout?: number } = {},
): Promise<void> {
  await page.waitForSelector(ACTIVE_CONTENT, options);
}
