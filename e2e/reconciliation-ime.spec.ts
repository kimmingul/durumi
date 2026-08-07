import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import {
  launchClean,
  shutdownClean,
  setWysiwygMode,
  startComposition,
  updateComposition,
  endComposition,
  observeCompositionEnd,
} from './_helpers';

/**
 * AC-WS-019~022 — 조합 중 외부 변경 조정.
 *
 * ## 이 파일이 통째로 skip인 이유 (읽지 않고 넘기지 말 것)
 *
 * 이 AC들은 "외부 프로세스가 파일을 바꿔 쓰고 **변경이 확정된다**"를 전제로
 * 한다. 그 확정 이벤트가 main에서 렌더러의 조정 계층까지 도달하려면 IPC
 * 배선(M8)이 필요한데, 현재 저장소에는 `external-change`를 조정 스토어로
 * 넣는 경로가 **하나도 없다**:
 *
 *   grep -rn "external-change" src/ electron/   → 조정 스토어 정의 외 0건
 *
 * 이 상태에서 아래 검사를 활성화하면 외부 파일 쓰기가 렌더러에 아무 영향도
 * 주지 못하므로 "버퍼가 변경되지 않았다"가 **공허하게 참**이 된다. 조합 중
 * 버퍼를 갈아엎는 구현도, 조정 자체가 없는 구현도 똑같이 통과한다.
 *
 * 그것이 `docs/DOCUMENT_MODE_PRINCIPLES.md` §2가 v0.2.19~.28에 걸쳐 기록한
 * false-green의 모양이며, 이 SPEC이 두 번 감사받아 막으려 한 결함이다.
 * 따라서 **초록을 만들어 내는 대신 막아 둔다**. M8이 배선을 완료하면
 * `test.skip`을 제거하는 것으로 활성화된다 — 검사 본문은 그대로 쓸 수 있다.
 *
 * 프리미티브 자체의 검증은 `e2e/composition-primitive.spec.ts`가 담당하며
 * 그쪽은 M8에 의존하지 않는다.
 */

const M8_BLOCKER =
  'M8 IPC 배선 전까지 실행 불가 — 확정 이벤트가 렌더러에 도달하지 않아 공허하게 통과한다';

test.describe('조합 중 조정 (AC-WS-019~022)', () => {
  test.skip(true, M8_BLOCKER);

  test('AC-WS-019: 조합 중에는 조정이 적용되지 않는다', async () => {
    const app = await launchClean();
    const page = await app.firstWindow();
    await setWysiwygMode(app, page);
    await page.locator('.cm-content').click();

    const filePath = await openScratchFile(page, '원래 내용\n');
    const before = await page.locator('.cm-content').innerText();

    const handle = await startComposition(page, '한');
    fs.writeFileSync(filePath, '디스크에서 바뀐 내용\n', 'utf8');
    await page.waitForTimeout(600); // 합류 창 + 확정 여유

    expect(await page.locator('.cm-content').innerText()).toBe(before);
    expect(await observeCompositionEnd(handle)).toBe(0);

    await endComposition(handle);
    await shutdownClean(app);
  });

  test('AC-WS-020: 조합 종료 후 보류된 조정이 적용된다', async () => {
    const app = await launchClean();
    const page = await app.firstWindow();
    await setWysiwygMode(app, page);
    await page.locator('.cm-content').click();

    const filePath = await openScratchFile(page, '원래 내용\n');
    const handle = await startComposition(page, '한');
    fs.writeFileSync(filePath, '디스크 내용\n', 'utf8');
    await page.waitForTimeout(600);

    await endComposition(handle);
    await page.waitForTimeout(300);

    const text = await page.locator('.cm-content').innerText();
    expect(text).toContain('디스크 내용');
    expect(text).toContain('한');

    await shutdownClean(app);
  });

  test('AC-WS-021: 보류 중 다중 변경은 최종 상태 1회만 적용된다', async () => {
    const app = await launchClean();
    const page = await app.firstWindow();
    await setWysiwygMode(app, page);
    await page.locator('.cm-content').click();

    const filePath = await openScratchFile(page, 'v0\n');
    const handle = await startComposition(page, '한');
    for (const v of ['v1', 'v2', 'v3']) {
      fs.writeFileSync(filePath, `${v}\n`, 'utf8');
      await page.waitForTimeout(250);
    }
    await endComposition(handle);
    await page.waitForTimeout(300);

    const text = await page.locator('.cm-content').innerText();
    expect(text).toContain('v3');
    expect(text).not.toContain('v1');
    expect(text).not.toContain('v2');

    await shutdownClean(app);
  });

  test('AC-WS-022: 조정이 조합 경계와 커밋 텍스트를 훼손하지 않는다', async () => {
    const app = await launchClean();
    const page = await app.firstWindow();
    await setWysiwygMode(app, page);
    await page.locator('.cm-content').click();

    const filePath = await openScratchFile(page, '원래\n');
    const handle = await startComposition(page, 'ㅎ');
    await updateComposition(handle, '하');
    await updateComposition(handle, '한');

    fs.writeFileSync(filePath, '외부 변경\n', 'utf8');
    await page.waitForTimeout(600);

    // (a) endComposition 직전까지 조합 경계가 유지됐다
    expect(await observeCompositionEnd(handle)).toBe(0);
    await endComposition(handle);
    await page.waitForTimeout(300);

    // (b) 커밋 텍스트가 마지막 updateComposition 문자열과 바이트 단위로 일치
    expect(await page.locator('.cm-content').innerText()).toContain('한');

    await shutdownClean(app);
  });
});

/**
 * 임시 파일을 만들어 앱에서 연다. M8 배선 이후 실제 경로로 대체된다 —
 * 지금은 형태만 남겨 둔다.
 */
async function openScratchFile(page: import('@playwright/test').Page, initial: string): Promise<string> {
  void page;
  const dir = fs.mkdtempSync('/tmp/durumi-ime-');
  const filePath = `${dir}/doc.md`;
  fs.writeFileSync(filePath, initial, 'utf8');
  return filePath;
}
