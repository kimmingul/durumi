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
  cancelComposition,
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

/** 조정 표면의 현재 상태. 없으면 null. */
const reconcileStatus = (page: Page): Promise<string | null> =>
  page
    .locator('[data-reconcile-status]')
    .getAttribute('data-reconcile-status')
    .catch(() => null);

const bannerActions = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-reconcile-surface] button')].map(
      (b) => (b as HTMLElement).dataset.action ?? '',
    ),
  );

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

    // 조합 중인 글자는 정당하게 버퍼에 나타난다 — `before`와의 전체 비교는
    // 그것까지 결함으로 센다. 단언 대상은 **외부 내용이 들어왔는가**다.
    const after = await bufferText(f.page);
    expect(after, '조합 중 외부 내용이 버퍼에 반영됐다').not.toContain('조합 중에 바뀐 내용');
    expect(after, '조합 이전 내용이 사라졌다').toContain('CHANNEL-LIVE-PROBE');
    expect(await observeCompositionEnd(handle), '조정이 조합을 조기 종료시켰다').toBe(0);

    await endComposition(handle);
  });
});

test('AC-WS-020: 조합 종료 시 보류된 변경이 배너로 라우팅된다', async () => {
  await withOpenDoc('원래 내용\n', async (f) => {
    await proveChannelLive(f);
    await installSurfaceCounter(f.page);

    const handle = await startComposition(f.page, '한');
    fs.writeFileSync(f.filePath, '디스크 내용\n', 'utf8');
    await f.page.waitForTimeout(DEBOUNCE_SETTLE_MS);
    await endComposition(handle);
    await f.page.waitForTimeout(800);

    const text = await bufferText(f.page);
    // 커밋된 조합 텍스트는 미저장 편집이다 → REQ-WS-028이 교체를 금지한다.
    expect(text, '커밋된 조합 텍스트가 사라졌다').toContain('한');
    expect(text, '미저장 편집이 있는데 디스크 내용이 적용됐다').not.toContain('디스크 내용');

    expect(await reconcileStatus(f.page), '배너 상태로 라우팅되지 않았다').toBe('held-notify');
    const actions = await bannerActions(f.page);
    expect(actions).toContain('view-diff');
    expect(actions).toContain('load-from-disk');
  });
});

test('AC-WS-020b: 텍스트를 남기지 않은 조합 취소는 자동 반영으로 돌아간다', async () => {
  // AC-WS-020과의 대비가 REQ-WS-021의 불변식을 고정한다 — 같은 게이트를
  // 통과한 두 시나리오가 dirty 여부로만 갈린다. "조합 후엔 항상 배너"로
  // 하드코딩한 구현은 이 검사에서 떨어진다.
  await withOpenDoc('원래 내용\n', async (f) => {
    await proveChannelLive(f);

    const handle = await startComposition(f.page, '한');
    fs.writeFileSync(f.filePath, '자동 반영 대상\n', 'utf8');
    await f.page.waitForTimeout(DEBOUNCE_SETTLE_MS);
    await cancelComposition(handle);

    await f.page.waitForFunction(
      () =>
        (document.querySelector('.cm-content') as HTMLElement | null)?.innerText.includes(
          '자동 반영 대상',
        ) ?? false,
      undefined,
      { timeout: 10_000 },
    );
    expect(await reconcileStatus(f.page), '자동 반영인데 배너가 남았다').toBeNull();
  });
});

test('AC-WS-021: 보류 중 다중 변경은 최종 상태 1건으로 합류되어 라우팅된다', async () => {
  await withOpenDoc('v0\n', async (f) => {
    await proveChannelLive(f);

    const handle = await startComposition(f.page, '한');
    for (const v of ['v1', 'v2', 'v3']) {
      fs.writeFileSync(f.filePath, `${v}\n`, 'utf8');
      await f.page.waitForTimeout(300);
    }
    await endComposition(handle);
    await f.page.waitForTimeout(800);

    // 합류 대상은 라우팅이지 적용이 아니다 — dirty 버퍼이므로 배너다.
    expect(await reconcileStatus(f.page)).toBe('held-notify');
    const text = await bufferText(f.page);
    expect(text, '조합 텍스트가 사라졌다').toContain('한');
    for (const v of ['v1', 'v2', 'v3']) {
      expect(text, `${v}가 버퍼에 적용됐다`).not.toContain(v);
    }
  });
});

test('AC-WS-023c: 보류 표시는 정책 결과로 인계된다 (무성 소실 금지)', async () => {
  await withOpenDoc('원래 내용\n', async (f) => {
    await proveChannelLive(f);

    const handle = await startComposition(f.page, '한');
    fs.writeFileSync(f.filePath, '디스크 내용\n', 'utf8');
    await f.page.waitForTimeout(DEBOUNCE_SETTLE_MS);

    expect(await reconcileStatus(f.page), '보류 표시가 뜨지 않았다').toBe('held-composition');
    const beforeEnd = await bufferText(f.page);

    await endComposition(handle);
    await f.page.waitForTimeout(800);

    // 금지 상태: 보류가 풀렸는데 후속 표면도 없고 버퍼도 그대로.
    const status = await reconcileStatus(f.page);
    const changed = (await bufferText(f.page)) !== beforeEnd;
    expect(
      status !== null || changed,
      '보류 표시가 후속 표면 없이 사라졌다 — 사용자는 외부 변경이 취소된 것으로 오해한다',
    ).toBe(true);
    expect(status, '보류 상태가 그대로 멈춰 있다').not.toBe('held-composition');
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
