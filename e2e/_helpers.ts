import {
  _electron as electron,
  type CDPSession,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const APP_ENTRY = path.resolve(process.cwd(), 'out', 'main', 'main.cjs');

/**
 * Launch the packaged Electron app with an isolated, ephemeral userData
 * directory so the test never reads or writes the developer's actual
 * `~/Library/Application Support/Electron/preferences.json`.
 *
 * Why this exists (v0.2.13 hot-fix):
 *  - Specs like `b1-features.spec.ts` assume the launch default of
 *    `editor.defaultMode === 'wysiwyg'`. That assumption holds on a fresh
 *    CI runner but breaks the moment a developer flips their personal
 *    preference to `typora` (Live mode) or `markdown` (Source mode) — the
 *    persisted pref bleeds into the test process, the editor boots into
 *    the wrong mode, and assertions like `expect(...).not.toContain('%%')`
 *    fail even though the production code is correct.
 *  - The fix is to give every spec its own throwaway userData dir. Electron
 *    honors the `--user-data-dir=<path>` Chromium command-line switch out
 *    of the box (already used by `c1-features.spec.ts` and `c2-features.spec.ts`),
 *    and `electron/main.ts` also parses it explicitly via `app.setPath`
 *    as belt-and-braces in case Chromium ever stops applying it.
 *
 * The temp dir path is stashed on the returned ElectronApplication via a
 * non-enumerable prop so `shutdownClean` can rm-rf it after the app exits.
 */
export interface LaunchCleanOptions {
  /** Extra CLI args appended after `--user-data-dir`. */
  extraArgs?: string[];
  /**
   * Pre-existing userData directory to use instead of a fresh `mkdtemp`.
   * Specs that need to seed `preferences.json` or `custom.css` before launch
   * (e.g. `c1-features.spec.ts`, `c2-features.spec.ts`) create and populate
   * the dir themselves, then pass it here. `shutdownClean` skips the rm in
   * that case so the test can manage its own cleanup.
   */
  userDataDir?: string;
}

export async function launchClean(
  argsOrOptions: string[] | LaunchCleanOptions = [],
): Promise<ElectronApplication> {
  const opts: LaunchCleanOptions = Array.isArray(argsOrOptions)
    ? { extraArgs: argsOrOptions }
    : argsOrOptions;
  const extraArgs = opts.extraArgs ?? [];
  const ownsDir = !opts.userDataDir;
  const userDataDir = opts.userDataDir ?? (await fs.promises.mkdtemp(path.join(os.tmpdir(), 'durumi-e2e-')));
  const app = await electron.launch({
    args: [APP_ENTRY, `--user-data-dir=${userDataDir}`, ...extraArgs],
    env: {
      ...process.env,
      // Already set by the `test:e2e` script, repeated here for any caller
      // that bypasses the npm script (e.g. running `playwright test`
      // directly from the editor's test runner UI).
      DURUMI_E2E: '1',
    },
  });
  (app as unknown as { __userDataDir: string; __ownsUserDataDir: boolean }).__userDataDir = userDataDir;
  (app as unknown as { __userDataDir: string; __ownsUserDataDir: boolean }).__ownsUserDataDir = ownsDir;
  return app;
}

/**
 * Quit the Electron app via `app.exit(0)` (bypassing the dirty-close
 * beforeunload guard, matching the existing convention) and best-effort
 * remove the temp userData dir created by `launchClean`.
 *
 * The rm is wrapped in a small retry to tolerate Electron flushing late
 * cache/log writes a few ms after exit; failures are swallowed because a
 * stale temp dir is harmless and we don't want a cleanup error to fail an
 * otherwise-passing test.
 */
export async function shutdownClean(app: ElectronApplication): Promise<void> {
  const stash = app as unknown as { __userDataDir?: string; __ownsUserDataDir?: boolean };
  const userDataDir = stash.__userDataDir;
  const ownsDir = stash.__ownsUserDataDir !== false;
  try {
    await app.evaluate(({ app: a }) => a.exit(0));
  } catch {
    // The app may already be torn down (e.g. spec did its own quit). Ignore.
  }
  if (userDataDir && ownsDir) {
    for (let i = 0; i < 5; i++) {
      try {
        await fs.promises.rm(userDataDir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }
}

/**
 * Switch the editor to Typora mode (legacy active-line marker hiding).
 *
 * Why: v0.1.12 introduced a WYSIWYG strict-literal mode (the default). In
 * that mode the editor's transactionFilter intercepts every typed special
 * char and rewrites it with a backslash escape — `#` → `\#`, `*` → `\*`,
 * etc. — so the markdown parser produces zero formatting from raw user
 * typing. Live-decoration e2e specs that drive `page.keyboard.type` with
 * markdown source therefore see no `cm-md-h1`, no task widget, no fence
 * highlighting, and so on.
 *
 * Typora mode (legacy v0.1.0-v0.1.10 behaviour) leaves user typing
 * unescaped so the parser sees real markdown. Use this helper at the top
 * of any spec that types markdown source and relies on the live preview
 * decorations applying.
 *
 * The mode switch is dispatched via the menu-command IPC channel so it
 * exercises the same code path the View ▸ Mode menu item would.
 */
export async function setTyporaMode(app: ElectronApplication, page: Page): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w?.webContents.send('menu:command', { type: 'setEditMode', mode: 'typora' });
  });
  // Let the renderer dispatch the resulting reducer update + reconfigure
  // the editor compartment before the test proceeds with typing.
  await page.waitForTimeout(150);
}

/**
 * Switch the editor to Markdown (source) mode.
 *
 * Used by toolbar tests to verify the toolbar is NOT mounted outside of
 * Document/WYSIWYG mode. Mirrors `setTyporaMode` but targets `markdown`.
 */
export async function setMarkdownMode(app: ElectronApplication, page: Page): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w?.webContents.send('menu:command', { type: 'setEditMode', mode: 'markdown' });
  });
  await page.waitForTimeout(150);
}

/**
 * Switch the editor to Document (WYSIWYG) mode.
 *
 * WYSIWYG is the launch default, so most specs don't need this helper.
 * Use it inside specs that have already flipped to Live or Source mode
 * and want to flip back — e.g. the v0.2.8 memo/CriticMarkup parity spec
 * which exercises both modes back-to-back.
 */
export async function setWysiwygMode(app: ElectronApplication, page: Page): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w?.webContents.send('menu:command', { type: 'setEditMode', mode: 'wysiwyg' });
  });
  await page.waitForTimeout(150);
}

/**
 * Read the live CodeMirror document via the EditorView attached to the DOM.
 *
 * The toolbar tests need to assert raw source (e.g. `**hello**`) — `cm-content`
 * innerText shows the rendered preview which hides the markers. We reach the
 * `EditorView` instance through the CodeMirror 6 internal `cmTile` link that
 * `EditorView.findFromDOM` itself walks: `.cm-editor` → `cmTile.root.view`.
 *
 * Falls back to `.cm-content` innerText when the cmTile traversal is null
 * (e.g. a renderer that swapped out the view between the page.evaluate and
 * the DOM query) — that fallback is lossy but keeps tests from hanging.
 */
export async function getEditorDoc(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const root = document.querySelector('.cm-editor') as HTMLElement | null;
    if (!root) return '';
    // CM6 stashes its view on the .cm-content node via a `cmView` weakmap-ish
    // chain that goes (dom).cmTile.root.view. The `cmTile` symbol is internal
    // but stable enough for e2e since we pin a single CM6 version.
    const content = root.querySelector('.cm-content') as HTMLElement | null;
    const tileHolder = (content ?? root) as unknown as {
      cmTile?: { root?: { view?: { state: { doc: { toString(): string } } } } };
    };
    const view = tileHolder.cmTile?.root?.view;
    if (view) return view.state.doc.toString();
    return content?.innerText ?? '';
  });
}

/**
 * v0.2.29 — Synthesize a Korean Hangul composition via the Chrome
 * DevTools Protocol.
 *
 * Why this exists: 4 prior release cycles (v0.2.19/.20/.21/.23/.28)
 * false-greened on automated tests because `page.keyboard.type` does
 * NOT exercise IME composition events — it sends synthesized
 * keystrokes, which the markdown escape filter and the atomic-range
 * facets handle in a code path completely separate from
 * `compositionstart` / `compositionupdate` / `compositionend`. Real
 * Korean input goes through the latter; the former is a different
 * (and irrelevant) world. Manual macOS smoke was the only signal
 * that ever caught the actual bugs.
 *
 * `Input.imeSetComposition` (Chrome DevTools Protocol, experimental
 * but supported by Chromium-based runtimes including Electron)
 * dispatches real composition events into the focused element. The
 * test author hands a list of intermediate syllables — e.g. for the
 * Korean letter `한` the user's 2-set IME progresses through
 * `['ㅎ', '하', '한']` — and the final committed text. The helper
 * sends each intermediate state, then commits the final text via
 * `Input.insertText`.
 *
 * Use this helper for any e2e that exercises code paths affected
 * by IME composition:
 *   - atomic ranges (`src/editor/atomicMedia.ts`, `src/editor/atomicInlineMarks.ts`)
 *   - marker-hide widgets (`src/editor/decorations/emphasis.ts` etc.)
 *   - contentEditable cells (table cells, `src/editor/markdownExt/tableEdit.ts`)
 *   - WYSIWYG escape filter (`src/editor/wysiwygEscape.ts`)
 *   - any transactionFilter that handles `input.type` events
 *
 * Caveat: CDP `Input.imeSetComposition` synthesizes events at the
 * W3C `CompositionEvent` API level. Real macOS Korean 2-set IME has
 * an additional OS-level conversion layer that CDP does NOT
 * replicate (e.g. specific Hanja conversion, Japanese reconversion).
 * The manual macOS Korean smoke at release sign-off remains the
 * final gate; this helper covers ~99% of the surface that automation
 * could ever catch.
 *
 * If the runtime doesn't support `Input.imeSetComposition`, this
 * function throws — wrap in a try/catch and `test.skip` if you want
 * graceful degradation (see `e2e/toolbar-ime-composition.spec.ts`
 * for the probe pattern).
 *
 * @param page         the Playwright Page (must have focus on the target editor)
 * @param syllables    ordered intermediate states, e.g. ['ㅎ', '하', '한']
 * @param commitText   the final text to insert (typically the last syllable)
 *
 * @example
 *   // Compose '한' (ㅎ + ㅏ + ㄴ → 한)
 *   await composeKorean(page, ['ㅎ', '하', '한'], '한');
 *   // Compose '학교' as two separate syllables
 *   await composeKorean(page, ['ㅎ', '하', '학'], '학');
 *   await composeKorean(page, ['ㄱ', '교'], '교');
 */
export async function composeKorean(
  page: Page,
  syllables: string[],
  commitText: string,
): Promise<void> {
  // 시그니처 보존용 얇은 래퍼 (plan.md §B.3). 중간 음절은 예전과 같이
  // 문서화 목적으로만 받는다 — CDP `imeSetComposition`의 교체 semantics가
  // 실제 macOS 한글 IME의 compositionupdate 시퀀스와 1:1이 아니기 때문이다.
  void syllables;
  const handle = await startComposition(page, commitText);
  await endComposition(handle);
}

// ---------------------------------------------------------------------------
// 조합 유지형 프리미티브 (SPEC-V03-WORKSPACE-001 M5 / plan.md §B.3)
// ---------------------------------------------------------------------------

/**
 * 열린 조합 세션 핸들. `startComposition`이 CDP 세션을 **detach하지 않고**
 * 돌려주므로, 반환 이후 임의의 `await`(외부 파일 쓰기 포함)를 끼워 넣을 수 있다.
 */
export interface CompositionHandle {
  page: Page;
  session: CDPSession;
  detached: boolean;
  /** 마지막으로 설정한 조합 텍스트. `endComposition`이 이 값을 커밋한다. */
  composingText: string;
}

/** 페이지에서 관측한 조합 경계 횟수. */
export interface CompositionCounts {
  starts: number;
  ends: number;
}

const COUNTER_KEY = '__durumiCompositionCounts';

/**
 * 조합을 **열어 둔 채** 유지한다. 기존 `composeKorean`은 시작과 종료를 한
 * 호출에 원자적으로 수행하고 `finally`에서 detach하므로, 조합 도중에 외부
 * 파일 쓰기를 끼워 넣을 경계가 없었다 — 그 헬퍼로 REQ-WS-020~023을 검사하면
 * 조합 중 버퍼를 갈아엎는 구현도 통과한다.
 *
 * 카운터를 조합 시작 **전에** 설치하는 것이 핵심이다. `compositionstart`가
 * 애초에 발생하지 않았다면 `ends === 0`은 공허하게 참이 되고, 그 위에 세운
 * 모든 AC가 무의미하게 통과한다. 그래서 `observeComposition`은 starts와 ends를
 * 함께 돌려주고, self-test가 `starts >= 1`을 먼저 단언한다.
 */
export async function startComposition(
  page: Page,
  composingText: string,
): Promise<CompositionHandle> {
  await page.evaluate((key) => {
    const w = window as unknown as Record<string, { starts: number; ends: number } | undefined>;
    if (w[key]) return; // 이미 설치됨 — 카운터를 유지한다
    const counts = { starts: 0, ends: 0 };
    w[key] = counts;
    document.addEventListener('compositionstart', () => { counts.starts += 1; }, true);
    document.addEventListener('compositionend', () => { counts.ends += 1; }, true);
  }, COUNTER_KEY);

  const session = await page.context().newCDPSession(page);
  await session.send('Input.imeSetComposition', {
    text: composingText,
    selectionStart: composingText.length,
    selectionEnd: composingText.length,
  });
  return { page, session, detached: false, composingText: composingText };
}

/** 열린 세션에서 조합 텍스트를 교체한다 (다단계 조합 근사). */
export async function updateComposition(
  handle: CompositionHandle,
  composingText: string,
): Promise<void> {
  if (handle.detached) throw new Error('updateComposition: composition already ended');
  await handle.session.send('Input.imeSetComposition', {
    text: composingText,
    selectionStart: composingText.length,
    selectionEnd: composingText.length,
  });
  handle.composingText = composingText;
}

/**
 * 조합을 **커밋하고** 종료한 뒤 세션을 detach한다.
 *
 * **빈 텍스트 `imeSetComposition`을 쓰지 않는 이유** — 이 프리미티브가 실제로
 * 물린 지점이다. CDP 프로토콜 정의가 명시한다:
 *
 *   "Use imeCommitComposition to commit the final text.
 *    Use imeSetComposition with empty string as text to cancel composition."
 *   (playwright-core/types/protocol.d.ts, Input.imeSetComposition)
 *
 * 즉 빈 문자열은 **취소**다 — 조합 텍스트가 버려진다. 취소도 `compositionend`를
 * 발생시키므로 "end 횟수 >= 1"은 통과하지만 문서에는 아무것도 남지 않는다.
 * 기존 `composeKorean` 주석은 "empty imeSetComposition just finalizes"라고
 * 적고 있었으나 그 함수는 호출부가 0곳이어서 그 주장이 한 번도 실행된 적이
 * 없었다. self-test P3가 처음 실행하자마자 거짓임이 드러났다.
 *
 * `Input.imeCommitComposition`은 이 프로토콜 버전에 **존재하지 않는다**(위
 * 문장의 산문에만 등장하고 커맨드 맵에 항목이 없다). 따라서 커밋 경로는
 * `Input.insertText`뿐이며, Chromium은 이를 `ImeCommitText`로 라우팅해
 * **진행 중인 조합을 주어진 텍스트로 교체**한다 — 위에 덧붙이지 않는다.
 */
export async function endComposition(handle: CompositionHandle): Promise<CompositionCounts> {
  if (handle.detached) throw new Error('endComposition: composition already ended');
  await handle.session.send('Input.insertText', { text: handle.composingText });
  await handle.session.detach();
  handle.detached = true;
  return observeComposition(handle);
}

/**
 * 조합을 **취소**한다 (커밋하지 않음). 빈 문자열 `imeSetComposition`의 실제
 * semantics를 이름으로 고정해 둔다 — `endComposition`과 헷갈리면 조합 텍스트가
 * 조용히 사라진다.
 */
export async function cancelComposition(handle: CompositionHandle): Promise<CompositionCounts> {
  if (handle.detached) throw new Error('cancelComposition: composition already ended');
  await handle.session.send('Input.imeSetComposition', {
    text: '',
    selectionStart: 0,
    selectionEnd: 0,
  });
  await handle.session.detach();
  handle.detached = true;
  return observeComposition(handle);
}

/**
 * `startComposition`이 설치한 카운터를 읽는다.
 *
 * **AC-WS-019/022가 "조합이 조기 종료되지 않았다"를 단언할 유일한 관측
 * 수단이다.** 저장소에 범용 조합 플래그가 없고 `dataset.composing`은 표 셀
 * 전용(`table.ts:810-814`)이라 그것에 의존할 수 없다.
 */
export async function observeComposition(handle: CompositionHandle): Promise<CompositionCounts> {
  const counts = await handle.page.evaluate((key) => {
    const w = window as unknown as Record<string, { starts: number; ends: number } | undefined>;
    return w[key] ?? { starts: 0, ends: 0 };
  }, COUNTER_KEY);
  return counts;
}

/** `compositionend` 발생 횟수만 돌려주는 좁은 관측 (plan.md §B.3 계약 이름). */
export async function observeCompositionEnd(handle: CompositionHandle): Promise<number> {
  return (await observeComposition(handle)).ends;
}
