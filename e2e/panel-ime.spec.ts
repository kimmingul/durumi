import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import {
  launchClean,
  shutdownClean,
  setWysiwygMode,
  startComposition,
  endComposition,
  observeComposition,
} from './_helpers';
import { activeContent, panelCount } from './_panels';

/**
 * 패널 조작이 IME 조합을 중단시키지 않는다 (AC-PANEL-035 ↔ REQ-PANEL-035).
 *
 * ## 왜 e2e여야 하는가
 *
 * 조합은 OS·브라우저 계층의 사건이다. jsdom에는 조합이 없으므로 유닛에서
 * "조합이 끊기지 않았다"는 언제나 공허하게 참이다. 이 저장소는 그 형태의
 * false-green을 v0.2.19~.28에 걸쳐 다섯 번 출하했다.
 *
 * ## 공허한 통과를 막는 장치
 *
 * `compositionend` 횟수가 0인 것만 보면, **조합이 애초에 열리지 않은** 구현도
 * 통과한다. 그래서 세 방향을 함께 단언한다:
 *
 *   - `starts >= 1` — 조합이 실제로 열렸다
 *   - `ends === 0`  — 패널 조작을 지나는 동안 닫히지 않았다
 *   - 커밋 텍스트가 문서에 남는다 — 취소가 아니라 커밋으로 끝났다
 *
 * 프리미티브 자체의 계약은 `e2e/composition-primitive.spec.ts`가 고정한다.
 *
 * ## "패널 B를 활성화하고"가 무엇을 뜻하는가 — 실측으로 갈라낸 것
 *
 * AC 문언의 활성화를 **"B의 편집 표면으로 DOM 포커스를 옮긴다"**로 읽으면 그
 * 요구는 만족 불가능하다. 실측했다: 조합 중 다른 `.cm-content`로 포커스를
 * 옮기면 `compositionend`가 1회 발생한다. 마우스 클릭이든 `element.focus()`든
 * 같고, **이 SPEC의 포커스 배선(`onFocusCapture`)을 통째로 제거하고 측정해도
 * 같다.** 즉 원인은 앱이 아니라 플랫폼이며, 조합 중인 요소에서 포커스가 떠나면
 * IME는 조합을 커밋한다.
 *
 * 그리고 그 읽기는 AC 자신의 다음 절과도 모순된다 — "패널 A의 조합을 정상
 * 종료하면"은 그 시점에 A의 조합이 **살아 있어야** 성립하는데, B로 포커스를
 * 옮기는 순간 A의 조합은 이미 커밋되어 있다.
 *
 * 그래서 여기서 검사하는 활성화는 **패널 관리 연산이 수행하는 활성화**다:
 * `splitPanel`은 새 패널을 만들면서 그것을 활성으로 만들고, `closePanel`은
 * 남는 패널을 활성으로 되돌린다. 둘 다 DOM 포커스를 옮기지 않는다. 활성화가
 * 실제로 일어났다는 것은 그 다음 모드 커맨드가 **B에만** 적용되는 것으로
 * 확인한다(REQ-PANEL-024) — 그러지 않으면 "아무 일도 일어나지 않았다"와
 * 구분되지 않는다.
 */

async function sendMenu(app: ElectronApplication, command: unknown): Promise<void> {
  await app.evaluate(({ BrowserWindow }, cmd) => {
    const w = BrowserWindow.getAllWindows()[0];
    w?.webContents.send('menu:command', cmd);
  }, command);
}

const toolbarCount = (page: Page): Promise<number> => page.locator('.editor-toolbar').count();

test('패널 분할·활성화·닫기가 조합을 중단시키지 않는다', async () => {
  const app = await launchClean();
  try {
    const page = await app.firstWindow();
    await setWysiwygMode(app, page);
    await activeContent(page).click();

    expect(await panelCount(page), '시작 상태가 단일 패널이 아니다').toBe(1);

    // 패널 A에서 조합을 연다. 이후 어떤 `await`도 이 조합을 닫지 않는다.
    const handle = await startComposition(page, '한글');

    const opened = await observeComposition(handle);
    expect(opened.starts, '조합이 열리지 않았다 — 아래 단언이 공허해진다').toBeGreaterThanOrEqual(1);
    expect(opened.ends, '조합이 열리자마자 닫혔다').toBe(0);

    // (1) 분할 — 패널 B가 생기고 **활성이 된다**.
    await sendMenu(app, 'splitPanel');
    await page.waitForTimeout(250);
    expect(await panelCount(page), '분할이 패널을 만들지 않았다').toBe(2);
    expect(await toolbarCount(page), '두 패널 모두 Document 모드여야 한다').toBe(2);
    expect((await observeComposition(handle)).ends, '분할이 조합을 끊었다').toBe(0);

    // (2) 활성화 확인 — 모드 커맨드가 **활성 패널 B에만** 적용된다.
    // 툴바는 Document 모드에서만 마운트되므로 하나만 남으면 B만 바뀐 것이다.
    await sendMenu(app, { type: 'setEditMode', mode: 'markdown' });
    await page.waitForTimeout(250);
    expect(await toolbarCount(page), '모드 커맨드가 활성 패널 하나에 작용하지 않았다').toBe(1);
    expect((await observeComposition(handle)).ends, '패널 활성화가 조합을 끊었다').toBe(0);

    // (3) 닫기 — 패널 B를 닫는다. 새 패널은 빈 untitled이므로 폐기 확인이 없다.
    await sendMenu(app, 'closePanel');
    await page.waitForTimeout(250);
    expect(await panelCount(page), '닫기가 패널을 없애지 않았다').toBe(1);
    expect((await observeComposition(handle)).ends, '패널 닫기가 조합을 끊었다').toBe(0);

    // 패널 전환 UI는 모달을 쓰지 않는다 (REQ-WS-049 승계).
    expect(await page.locator('[role="dialog"]').count(), '패널 전환에 모달이 떴다').toBe(0);

    // 살아남은 패널 A는 자기 모드(Document)를 그대로 유지한다 — B의 모드 변경이
    // A로 새지 않았다(REQ-PANEL-021).
    expect(await toolbarCount(page), '닫힌 패널의 모드 변경이 A로 샜다').toBe(1);

    // 조합을 정상 종료하면 커밋 텍스트가 남는다 — 취소가 아니라 커밋이다.
    const counts = await endComposition(handle);
    expect(counts.ends, '조합이 종료되지 않았다').toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(200);
    const text = await activeContent(page).innerText();
    expect(text, '커밋된 텍스트가 입력한 바이트와 다르다').toContain('한글');
  } finally {
    await shutdownClean(app);
  }
});
