import { test, expect, type Page } from '@playwright/test';
import {
  launchClean,
  shutdownClean,
  setWysiwygMode,
  startComposition,
  updateComposition,
  endComposition,
  cancelComposition,
  observeComposition,
  observeCompositionEnd,
  composeKorean,
} from './_helpers';

/**
 * 조합 유지형 프리미티브의 **self-test** — plan.md §D가 M5의 첫 산출물로
 * 지정한 것이다.
 *
 * 왜 프리미티브 자체를 먼저 검사하는가: 이 프리미티브는 미검증 코드이고,
 * 그 위에 AC-WS-019~022를 세운다. 프리미티브가 조합을 실제로 열지 못하거나
 * 커밋 텍스트를 남기지 못하면 "버퍼가 변경되지 않았다"가 **공허하게 참**이
 * 되어, 조합 중 버퍼를 갈아엎는 구현까지 전부 통과한다. 그것이 이 저장소가
 * v0.2.19~.28에 걸쳐 다섯 번 출하한 false-green의 모양이다.
 *
 * 실제로 첫 CI 실행에서 P3가 그 결함을 잡았다: 조합은 종료되는데(ends >= 1)
 * 문서가 비어 있었다 — 빈 문자열 `imeSetComposition`이 커밋이 아니라
 * **취소**이기 때문이다. `endComposition`의 주석에 근거를 남겼다.
 *
 * 그래서 이 spec은 세 방향을 모두 단언한다:
 *   - `starts >= 1`  — 조합이 실제로 열렸다 (공허한 통과 차단)
 *   - `ends === 0`   — 조합이 아직 닫히지 않았다 (유지 확인)
 *   - 커밋 텍스트가 문서에 남는다 (취소와 커밋의 구분)
 */

/**
 * 앱을 띄우고 편집 표면에 포커스를 준 뒤 본문을 실행한다.
 *
 * `finally`로 종료를 보장하는 이유: 단언 실패가 `shutdownClean`을 건너뛰면
 * Playwright가 `Worker teardown timeout`을 내며 **진짜 실패 원인을 덮는다**.
 * 첫 CI 실행에서 P3/P5가 정확히 그렇게 두 겹으로 실패했다.
 */
async function withEditor(fn: (page: Page) => Promise<void>): Promise<void> {
  const app = await launchClean();
  try {
    const page = await app.firstWindow();
    await setWysiwygMode(app, page);
    await page.locator('.cm-content').click();
    await fn(page);
  } finally {
    await shutdownClean(app);
  }
}

test('P0: startComposition이 조합을 실제로 연다 (공허한 통과 차단)', async () => {
  await withEditor(async (page) => {
    const handle = await startComposition(page, '한');
    const counts = await observeComposition(handle);

    // 이 단언이 없으면 아래의 모든 검사가 무의미해진다.
    expect(
      counts.starts,
      'compositionstart가 발생하지 않았다면 이 프리미티브는 아무것도 검증하지 못한다',
    ).toBeGreaterThanOrEqual(1);
    expect(counts.ends).toBe(0);

    await endComposition(handle);
  });
});

test('P1: 조합이 임의의 await를 사이에 두고 열린 채 유지된다', async () => {
  await withEditor(async (page) => {
    const handle = await startComposition(page, '한');
    expect((await observeComposition(handle)).starts).toBeGreaterThanOrEqual(1);

    // 조정 계층이 끼어들 수 있는 지점을 흉내낸다 — 실제 AC에서는 이 자리에
    // 외부 파일 쓰기가 들어간다.
    await page.waitForTimeout(300);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
    await page.waitForTimeout(300);

    expect(await observeCompositionEnd(handle), '중간 await 동안 조합이 조기 종료됐다').toBe(0);

    await endComposition(handle);
  });
});

test('P2: updateComposition이 조합을 닫지 않고 텍스트만 바꾼다', async () => {
  await withEditor(async (page) => {
    const handle = await startComposition(page, 'ㅎ');
    await updateComposition(handle, '하');
    await updateComposition(handle, '한');

    expect(await observeCompositionEnd(handle), 'updateComposition이 조합을 종료시켰다').toBe(0);

    await endComposition(handle);
  });
});

test('P3: endComposition이 조합을 닫고 커밋 텍스트가 남는다', async () => {
  await withEditor(async (page) => {
    const handle = await startComposition(page, '한');
    const counts = await endComposition(handle);

    expect(counts.ends).toBeGreaterThanOrEqual(1);
    // 이 단언이 첫 CI 실행에서 실패했다 — 조합은 끝났는데 문서가 비어 있었다.
    await expect(page.locator('.cm-content')).toContainText('한');
  });
});

test('P3b: 마지막 updateComposition 문자열이 그대로 커밋된다', async () => {
  await withEditor(async (page) => {
    const handle = await startComposition(page, 'ㅎ');
    await updateComposition(handle, '하');
    await updateComposition(handle, '한');
    await endComposition(handle);

    const text = await page.locator('.cm-content').innerText();
    expect(text).toContain('한');
    // 중간 조합 상태가 문서에 눌러앉지 않았다 (커밋이 조합을 교체한다).
    expect(text).not.toContain('ㅎ하');
  });
});

test('P3c: cancelComposition은 커밋하지 않는다 (취소와 커밋의 구분)', async () => {
  await withEditor(async (page) => {
    const handle = await startComposition(page, '한');
    const counts = await cancelComposition(handle);

    // 취소도 compositionend를 발생시킨다 — 그래서 end 횟수만으로는
    // 커밋 여부를 알 수 없고, P3의 본문 단언이 반드시 필요하다.
    expect(counts.ends).toBeGreaterThanOrEqual(1);
    expect(await page.locator('.cm-content').innerText()).not.toContain('한');
  });
});

test('P4: 종료된 핸들의 재사용은 조용히 통과하지 않는다', async () => {
  await withEditor(async (page) => {
    const handle = await startComposition(page, '한');
    await endComposition(handle);

    await expect(updateComposition(handle, '핝')).rejects.toThrow(/already ended/);
    await expect(endComposition(handle)).rejects.toThrow(/already ended/);
    await expect(cancelComposition(handle)).rejects.toThrow(/already ended/);
  });
});

test('P5: composeKorean의 시그니처와 동작이 보존된다', async () => {
  await withEditor(async (page) => {
    // 인자 3개, 반환 Promise<void> — 프리미티브 위의 얇은 래퍼로 재구현됐다.
    const result: void = await composeKorean(page, ['ㅎ', '하', '한'], '한');
    expect(result).toBeUndefined();
    await expect(page.locator('.cm-content')).toContainText('한');
  });
});
