import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
 * M8이 main→렌더러 채널을 배선하기 전까지 이 검사들은 **공허하게 통과**했다:
 * 외부 파일 쓰기가 렌더러에 닿지 않아 "버퍼 불변"이 자동으로 참이었다.
 * 그래서 그때는 `test.skip`으로 막아 두었다.
 *
 * 이제 채널이 있으므로 검사가 실제로 실패할 수 있다. 공허한 통과를 막기 위해
 * 각 검사는 **채널이 살아 있다는 것을 먼저 증명한다** — 조합 밖에서 같은 외부
 * 쓰기가 버퍼에 반영되는지 확인한 뒤에야 조합 중 불변을 단언한다. 그 사전
 * 확인이 없으면 채널이 죽어도 AC-WS-019가 통과한다.
 */

const DEBOUNCE_SETTLE_MS = 900;

interface Fixture {
  app: ElectronApplication;
  page: Page;
  filePath: string;
  dir: string;
}

async function withOpenDoc(initial: string, fn: (f: Fixture) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'durumi-reconcile-'));
  const filePath = path.join(dir, 'doc.md');
  fs.writeFileSync(filePath, initial, 'utf8');

  const app = await launchClean();
  try {
    const page = await app.firstWindow();
    await setWysiwygMode(app, page);

    // 렌더러의 열기 흐름을 태운다 — DURUMI_E2E=1 아래에서 tmpdir는 신뢰된다.
    await app.evaluate(async ({ BrowserWindow }, p: string) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('menu:command', {
        type: 'openRecent',
        path: p,
      });
    }, filePath);

    const firstLine = initial.trim().split('\n')[0] ?? '';
    await page.waitForFunction(
      (expected: string) =>
        (document.querySelector('.cm-content') as HTMLElement | null)?.innerText.includes(
          expected,
        ) ?? false,
      firstLine,
      { timeout: 10_000 },
    );

    await page.locator('.cm-content').click();
    await fn({ app, page, filePath, dir });
  } finally {
    await shutdownClean(app);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const bufferText = (page: Page): Promise<string> => page.locator('.cm-content').innerText();

/**
 * 편집 표면(`.cm-content`)에서 직접 조합 경계를 센다.
 *
 * `startComposition`의 카운터는 `document`에 capture로 달려 있어, 조합이
 * 편집 표면까지 닿지 않아도 증가한다. IME 게이트는 `view.contentDOM`에
 * 붙으므로 **그 요소가 실제로 이벤트를 받았는지**가 게이트 동작의 전제다.
 * 이 계측이 없으면 "게이트가 막았다"와 "게이트가 애초에 안 걸렸다"를
 * 구분할 수 없다.
 */
async function installSurfaceCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const cm = document.querySelector('.cm-content');
    if (!cm) throw new Error('.cm-content not found');
    const w = window as unknown as { __cmCounts?: { starts: number; ends: number } };
    const counts = { starts: 0, ends: 0 };
    w.__cmCounts = counts;
    cm.addEventListener('compositionstart', () => { counts.starts += 1; });
    cm.addEventListener('compositionend', () => { counts.ends += 1; });
  });
}

const surfaceCounts = (page: Page): Promise<{ starts: number; ends: number }> =>
  page.evaluate(() => {
    const w = window as unknown as { __cmCounts?: { starts: number; ends: number } };
    return w.__cmCounts ?? { starts: 0, ends: 0 };
  });

/**
 * 채널이 살아 있음을 확인한다. 이 함수가 실패하면 아래 AC들의 "버퍼 불변"
 * 단언은 아무것도 증명하지 못한다 — 공허한 통과를 막는 관문이다.
 */
async function proveChannelLive(f: Fixture): Promise<void> {
  fs.writeFileSync(f.filePath, 'CHANNEL-LIVE-PROBE\n', 'utf8');
  await f.page.waitForFunction(
    () =>
      (document.querySelector('.cm-content') as HTMLElement | null)?.innerText.includes(
        'CHANNEL-LIVE-PROBE',
      ) ?? false,
    undefined,
    { timeout: 10_000 },
  );
}

test('AC-WS-019: 조합 중에는 조정이 적용되지 않는다', async () => {
  await withOpenDoc('원래 내용\n', async (f) => {
    await proveChannelLive(f);
    await installSurfaceCounter(f.page);
    const before = await bufferText(f.page);

    const handle = await startComposition(f.page, '한');

    // 게이트가 붙은 요소가 실제로 조합을 받았는가. 0이면 아래 단언은
    // "게이트가 막았다"가 아니라 "조합이 편집 표면에 닿지 않았다"를 뜻한다.
    expect(
      (await surfaceCounts(f.page)).starts,
      '편집 표면에 compositionstart가 도달하지 않았다 — IME 게이트가 걸릴 수 없다',
    ).toBeGreaterThanOrEqual(1);

    fs.writeFileSync(f.filePath, '조합 중에 바뀐 내용\n', 'utf8');
    await f.page.waitForTimeout(DEBOUNCE_SETTLE_MS);

    // 조합이 편집 표면에서 아직 열려 있는가. 여기서 끝나 있으면 게이트의
    // 지연 드레인이 이미 돌아 버퍼가 바뀐 것이고, 원인은 게이트가 아니라
    // 조합이 조기 종료된 데 있다.
    expect(
      (await surfaceCounts(f.page)).ends,
      '편집 표면에서 조합이 조기 종료됐다 — 게이트가 아니라 조합 수명이 원인',
    ).toBe(0);

    // 조정 계층이 보류 상태에 들어갔는가. 프로덕션 표면이 그대로 증거다.
    expect(
      await f.page.locator('[data-reconcile-status]').getAttribute('data-reconcile-status').catch(() => null),
      '조정 계층이 보류 상태로 진입하지 않았다 — 게이트가 걸리지 않았다',
    ).toBe('held-composition');

    expect(await bufferText(f.page), '조합 중 버퍼가 교체됐다').toBe(before);
    expect(await observeCompositionEnd(handle), '조정이 조합을 조기 종료시켰다').toBe(0);

    await endComposition(handle);
  });
});

test('AC-WS-020: 조합 종료 후 보류된 조정이 적용된다', async () => {
  await withOpenDoc('원래 내용\n', async (f) => {
    await proveChannelLive(f);

    const handle = await startComposition(f.page, '한');
    fs.writeFileSync(f.filePath, '디스크 내용\n', 'utf8');
    await f.page.waitForTimeout(DEBOUNCE_SETTLE_MS);
    await endComposition(handle);

    await f.page.waitForFunction(
      () =>
        (document.querySelector('.cm-content') as HTMLElement | null)?.innerText.includes(
          '디스크 내용',
        ) ?? false,
      undefined,
      { timeout: 10_000 },
    );
  });
});

test('AC-WS-021: 보류 중 다중 변경은 최종 상태 1회만 적용된다', async () => {
  await withOpenDoc('v0\n', async (f) => {
    await proveChannelLive(f);

    const handle = await startComposition(f.page, '한');
    for (const v of ['v1', 'v2', 'v3']) {
      fs.writeFileSync(f.filePath, `${v}\n`, 'utf8');
      await f.page.waitForTimeout(300);
    }
    await endComposition(handle);

    await f.page.waitForFunction(
      () =>
        (document.querySelector('.cm-content') as HTMLElement | null)?.innerText.includes('v3') ??
        false,
      undefined,
      { timeout: 10_000 },
    );
    const text = await bufferText(f.page);
    expect(text).not.toContain('v1');
    expect(text).not.toContain('v2');
  });
});

test('AC-WS-022: 조정이 조합 경계와 커밋 텍스트를 훼손하지 않는다', async () => {
  await withOpenDoc('원래\n', async (f) => {
    await proveChannelLive(f);

    const handle = await startComposition(f.page, 'ㅎ');
    await updateComposition(handle, '하');
    await updateComposition(handle, '한');

    fs.writeFileSync(f.filePath, '외부 변경\n', 'utf8');
    await f.page.waitForTimeout(DEBOUNCE_SETTLE_MS);

    // (a) endComposition 직전까지 조합 경계가 유지됐다
    expect(await observeCompositionEnd(handle)).toBe(0);
    await endComposition(handle);
    await f.page.waitForTimeout(500);

    // (b) 마지막 updateComposition 문자열이 커밋됐다
    expect(await bufferText(f.page)).toContain('한');
  });
});
