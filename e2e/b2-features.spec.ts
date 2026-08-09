import { test, expect, type ElectronApplication } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { launchClean, setTyporaMode, shutdownClean } from './_helpers';

async function launch() {
  const app = await launchClean();
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');
  return { app, page };
}

// Force-exit to bypass the dirty-close (beforeunload) dialog that
// `app.close()` would otherwise hang on after we have typed into the editor.
async function shutdown(app: ElectronApplication) {
  await shutdownClean(app);
}

function makeTempFolder(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'durumi-b2-'));
  fs.writeFileSync(path.join(dir, 'one.md'), '# One\n\nbody');
  fs.writeFileSync(path.join(dir, 'two.md'), '# Two\n\n## Sub\n\nbody');
  return dir;
}

test('open folder + click file opens content', async () => {
  const { app, page } = await launch();
  const tmp = makeTempFolder();
  try {
    // Pin sidebar.activeTab to 'files' so persisted state from a prior run
    // (e.g. the Outline test that follows) doesn't hide the file tree.
    await page.evaluate(async (p: string) => {
      const api = (window as unknown as {
        api: {
          prefsSet: (x: {
            workspaceFolders: string[];
            sidebar?: { visible: boolean; activeTab: 'files'; width: number };
          }) => Promise<void>;
        };
      }).api;
      await api.prefsSet({
        workspaceFolders: [p],
        sidebar: { visible: true, activeTab: 'files', width: 315 },
      });
    }, tmp);
    await page.reload();
    await page.waitForSelector('.cm-content');
    await page.waitForSelector('.cm-tree-row-file', { timeout: 5000 });
    const rows = page.locator('.cm-tree-row-file');
    await expect(rows).toHaveCount(2);
    await rows.first().click();
    await page.waitForTimeout(200);
    const content = await page.evaluate(
      () => (document.querySelector('.cm-content') as HTMLElement).innerText
    );
    expect(content).toContain('One');
  } finally {
    await shutdown(app);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('outline tab shows headings and clicking jumps cursor', async () => {
  // 사이드바 탭 라벨은 i18n을 거치고(`Sidebar.tsx`의 `t('sidebar.outline')`),
  // 기본 설정 `language: 'system'`은 `resolveRendererLang`에서
  // `navigator.language`로 해석된다. 즉 이 스펙은 **호스트 OS 로케일에 따라
  // 결과가 갈렸다** — 영어 머신에서는 'Outline'이 매치돼 통과하고, 한국어
  // 머신에서는 실제 라벨이 '목차'라 0개를 매치했다.
  //
  // 0개를 매치한 쪽이 조용했던 이유: Playwright의 `locator.click()`은 매치가
  // 생길 때까지 기다리고 기본 액션 타임아웃이 없어서, 단언 한 줄 남기지 못한 채
  // 30초 테스트 타임아웃으로만 죽었다. 실패 메시지가 통째로 비어 있던 게 그
  // 때문이다.
  //
  // c1-features.spec.ts와 동일하게 prefs에 언어를 못박아 호스트 로케일 의존을
  // 끊는다. 셀렉터는 원래 의도대로 영어 라벨을 유지한다.
  //
  // 기각한 대안 — 셀렉터를 '목차'로 바꾸기: 한국어 머신에서만 통과하는 스펙이
  // 되어 방향만 뒤집힐 뿐 로케일 의존은 그대로 남는다.
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'durumi-b2-outline-'));
  fs.writeFileSync(
    path.join(userData, 'preferences.json'),
    JSON.stringify({
      theme: 'system',
      language: 'en',
      sidebar: { visible: true, activeTab: 'files', width: 240 },
      workspaceFolders: [],
      recentFiles: [],
      lastWindow: { width: 980, height: 720 },
    }),
    'utf8',
  );
  const app = await launchClean({ userDataDir: userData });
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');
  try {
    // Typed-markdown test: switch to Typora mode so `#` chars aren't escaped
    // by the WYSIWYG strict-literal filter (see e2e/_helpers.ts).
    await setTyporaMode(app, page);
    await page.click('.cm-content');
    await page.keyboard.type('# H1\n\n## H2\n\n### H3\n\nbody text\n');
    // useDocOutline has a 100ms debounce; wait it out before switching tabs.
    await page.waitForTimeout(150);
    const outlineTab = page.locator('.cm-sidebar-tab', { hasText: 'Outline' });
    // 라벨이 다시 어긋나면 30초 침묵 대신 여기서 즉시, 원인을 적으며 터진다.
    await expect(outlineTab).toHaveCount(1, { timeout: 10000 });
    await outlineTab.click();
    await page.waitForSelector('.cm-outline-row', { timeout: 3000 });
    const rows = page.locator('.cm-outline-row');
    await expect(rows).toHaveCount(3);
    await rows.nth(2).click();
    await page.waitForTimeout(100);
    const activeLineText = await page.evaluate(() => {
      const a = document.querySelector('.cm-activeLine');
      return a ? (a as HTMLElement).innerText : '';
    });
    expect(activeLineText).toContain('H3');
  } finally {
    await shutdown(app);
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(userData, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }
});
