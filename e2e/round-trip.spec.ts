/**
 * v0.2.10 — golden Pandoc DOCX round-trip e2e.
 *
 * Builds a kitchen-sink markdown fixture that exercises every Durumi feature
 * in `docs/durumi-markdown-reference.md`, exports it to .docx via the same
 * menu-driven flow the user sees, then re-imports the .docx via Pandoc and
 * asserts STRUCTURAL parity (heading count, citation count, footnote count,
 * etc.). Byte-perfect parity is not the goal — Pandoc reformats whitespace
 * and may rewrite a number of constructs.
 *
 * Pandoc-availability gating: if `pandoc` isn't on PATH the entire suite
 * `test.skip()`s with a reason. We deliberately don't block CI on a missing
 * external binary; CI environments that need to verify this should install
 * Pandoc up front (e.g. `brew install pandoc` / `apt install pandoc`).
 */

import { test, expect, type ElectronApplication } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { launchClean, setTyporaMode, shutdownClean } from './_helpers';

const PNG_FIXTURE = path.resolve(process.cwd(), 'e2e', 'fixtures', 'tiny.png');

function pandocBinary(): string | null {
  for (const cand of ['pandoc', '/usr/local/bin/pandoc', '/opt/homebrew/bin/pandoc']) {
    const r = spawnSync(cand, ['--version']);
    if (r.status === 0) return cand;
  }
  return null;
}

const PANDOC = pandocBinary();

async function launch() {
  const app = await launchClean();
  const page = await app.firstWindow();
  await page.waitForSelector('.cm-content');
  return { app, page };
}

async function shutdown(app: ElectronApplication) {
  await shutdownClean(app);
}

/**
 * Kitchen-sink markdown that exercises every section of
 * `docs/durumi-markdown-reference.md`. Every assertion in the round-trip
 * test maps back to a feature here.
 */
function kitchenSinkMarkdown(pngPath: string): string {
  return [
    '---',
    'title: Round-trip kitchen sink',
    'author: Durumi e2e',
    '---',
    '',
    '[toc]',
    '',
    '# H1 Heading',
    '',
    '## H2 Heading',
    '',
    '### H3 Heading',
    '',
    'Paragraph with **bold**, *italic*, ~~strikethrough~~, and `inline code`.',
    'Also ==highlight==, H~2~O, and X^2^.',
    '',
    '> Plain blockquote',
    '',
    '> [!NOTE]',
    '> GitHub alert callout (v0.2.9 feature).',
    '',
    '- bullet one',
    '- bullet two',
    '',
    '1. numbered first',
    '2. numbered second',
    '',
    '- [ ] todo task',
    '- [x] done task',
    '',
    '```typescript',
    'const x: number = 1;',
    '```',
    '',
    '[Inline link](https://example.com)',
    '',
    `![tiny](${pngPath})`,
    '',
    'Footnote reference[^note1].',
    '',
    '[^note1]: Footnote body.',
    '',
    '| col A | col B | col C |',
    '|:------|:-----:|------:|',
    '| left  | mid   | right |',
    '| **A** | *B*   | `C`   |',
    '',
    'Citation [@smith2020] inline.',
    '',
    'CriticMarkup: {++inserted++}, {--deleted--}, {~~old~>new~~}, {==marked==}, {>>comment<<}.',
    '',
    'Inline memo %% reviewer note %%.',
    '',
    'Inline math $x^2 + y^2 = z^2$ and block math:',
    '',
    '$$',
    '\\int_{0}^{\\infty} e^{-x} dx = 1',
    '$$',
    '',
    '```mermaid',
    'graph TD; A-->B;',
    '```',
    '',
  ].join('\n');
}

const TINY_BIB = `@article{smith2020,
  author = {Smith, J.},
  title = {Round-trip survival},
  journal = {Test Journal},
  year = {2020},
  volume = {1},
  pages = {1--2},
}
`;

test.describe('Pandoc DOCX golden round-trip', () => {
  test.skip(PANDOC === null, 'pandoc binary not available on PATH');

  test('kitchen-sink markdown survives DOCX export → re-import structurally', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'durumi-roundtrip-'));
    const mdPath = path.join(tmpDir, 'kitchen-sink.md');
    const docxPath = path.join(tmpDir, 'kitchen-sink.docx');
    const bibPath = path.join(tmpDir, 'references.bib');
    // Copy the fixture so it lives under the e2e tmpdir trust tree.
    const localPng = path.join(tmpDir, 'tiny.png');
    fs.copyFileSync(PNG_FIXTURE, localPng);
    const sourceMd = kitchenSinkMarkdown('tiny.png');
    fs.writeFileSync(mdPath, sourceMd, 'utf8');
    fs.writeFileSync(bibPath, TINY_BIB, 'utf8');

    const { app, page } = await launch();
    try {
      // Open the fixture md through the app — primes path-guard tree trust
      // for sibling assets (the .bib + the PNG).
      await app.evaluate(async ({ BrowserWindow }, p: string) => {
        const win = BrowserWindow.getAllWindows()[0];
        win?.webContents.send('menu:command', { type: 'openRecent', path: p });
      }, mdPath);
      // openRecent goes through file:openPath which the path-guard rejects
      // unless the path is trusted; under DURUMI_E2E=1 the tmpdir bypass
      // (pathGuard.ts:18) accepts it for tests.
      await page.waitForFunction(
        (expected: string) => {
          const cm = document.querySelector('.cm-content') as HTMLElement | null;
          return cm?.innerText.includes(expected) ?? false;
        },
        'Round-trip kitchen sink',
        { timeout: 5000 },
      );

      // Stub the save dialog so the export writes to the fixed path.
      await app.evaluate(({ dialog }, p: string) => {
        (
          dialog as unknown as { showSaveDialog: (...args: unknown[]) => Promise<unknown> }
        ).showSaveDialog = async () => ({ canceled: false, filePath: p });
      }, docxPath);

      // Trigger the DOCX export the same way the menu would.
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win?.webContents.send('menu:command', 'exportDocx');
      });

      // Wait for the file to land. Pandoc launches asynchronously.
      let attempts = 0;
      while (!fs.existsSync(docxPath) && attempts < 100) {
        await page.waitForTimeout(150);
        attempts++;
      }
      expect(fs.existsSync(docxPath)).toBe(true);
      expect(fs.statSync(docxPath).size).toBeGreaterThan(1000);

      // Re-import via pandoc → markdown directly (deterministic, no UI).
      const reimportRes = spawnSync(
        PANDOC!,
        [
          '-f',
          'docx',
          '-t',
          'markdown+yaml_metadata_block+footnotes+pipe_tables-raw_html',
          '--wrap=none',
          docxPath,
        ],
        { encoding: 'utf8' },
      );
      expect(reimportRes.status).toBe(0);
      const reimported = reimportRes.stdout;

      // ----- Structural assertions -----

      // Headings: at least the H1 + H2 + H3 must survive.
      const headingMatches = reimported.match(/^#{1,3} /gm) ?? [];
      expect(headingMatches.length).toBeGreaterThanOrEqual(3);

      // The original 3 headings + any TOC-promoted heading must include the
      // distinctive titles.
      expect(reimported).toContain('H1 Heading');
      expect(reimported).toContain('H2 Heading');
      expect(reimported).toContain('H3 Heading');

      // Bold / italic / strike still recoverable as text content.
      expect(reimported.toLowerCase()).toContain('bold');
      expect(reimported.toLowerCase()).toContain('italic');
      expect(reimported.toLowerCase()).toContain('strikethrough');

      // Code spans retained.
      expect(reimported).toMatch(/`?inline code`?/);

      // Lists round-trip into either real list syntax OR plain text bullets.
      expect(reimported.toLowerCase()).toContain('bullet one');
      expect(reimported.toLowerCase()).toContain('numbered first');
      expect(reimported.toLowerCase()).toContain('done task');

      // Code block survives (look for a marker token from the source).
      expect(reimported).toContain('const x');

      // Inline link target survives somewhere in the body.
      expect(reimported).toContain('example.com');

      // Footnote reference / definition survives — Pandoc uses `[^N]` syntax.
      expect(reimported).toMatch(/\[\^[a-z0-9]+\]/i);
      expect(reimported.toLowerCase()).toContain('footnote body');

      // Table contents survive (cell text, not necessarily `|` syntax).
      expect(reimported).toContain('left');
      expect(reimported).toContain('right');

      // CriticMarkup: Pandoc by default ACCEPTS changes (the safe medical-
      // manuscript default), so `inserted` survives, `deleted` does not, the
      // substitution resolves to `new`, and `marked` survives. The comment
      // body may or may not survive (depends on `exportIncludeComments`).
      expect(reimported).toContain('inserted');
      expect(reimported).not.toContain('deleted');
      expect(reimported).toContain('new');
      expect(reimported).toContain('marked');

      // Memo content must NOT leak (default is to strip).
      expect(reimported).not.toContain('reviewer note');

      // Math survives — block math at minimum keeps the integral payload.
      expect(reimported).toMatch(/\\int|integral|e\^|\^\{-x\}|infty/i);

      // Mermaid block: Pandoc round-trips it as a fenced block since it
      // doesn't know the dialect; the source `graph TD` content survives.
      expect(reimported).toMatch(/graph\s+TD|A-+>B/);

      // YAML front matter behavior: Pandoc's DOCX writer places `title:` and
      // `author:` into Word's document-properties metadata (Word's Title /
      // Author fields), NOT into the body. The re-import via `pandoc -f docx
      // -t markdown` reads body content only by default, so YAML metadata
      // does NOT round-trip into the reimported markdown body. This is a
      // documented Pandoc behavior, not a Durumi bug — flagged in v0.2.10
      // PROGRESS as a known lossy item. The metadata IS preserved inside
      // the .docx (verifiable via `unzip -p file.docx docProps/core.xml`),
      // it just doesn't surface in the body-only re-import.
      //
      // Test the negative: assert the body has the documented loss shape
      // (no `title:` / `author:` lines in the body) so this assertion stays
      // accurate if Pandoc ever changes its DOCX writer behavior.
      expect(reimported).not.toMatch(/^title:/m);
      expect(reimported).not.toMatch(/^author:/m);
    } finally {
      await shutdown(app);
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  });

});

test.describe('HTML export image inlining (v0.2.10)', () => {
  test('exportInlineImages=true rewrites <img> to data: URI in exported HTML', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'durumi-inline-'));
    const mdPath = path.join(tmpDir, 'inline.md');
    const htmlPath = path.join(tmpDir, 'inline.html');
    // Copy the fixture next to the doc so it sits under the tmpdir bypass
    // tree; the asset protocol's path guard rejects paths outside the
    // session-trusted area otherwise.
    const localPng = path.join(tmpDir, 'tiny.png');
    fs.copyFileSync(PNG_FIXTURE, localPng);
    const md = `# inline test\n\n![tiny](tiny.png)\n`;
    fs.writeFileSync(mdPath, md, 'utf8');

    const { app, page } = await launch();
    try {
      // Flip the inline-images preference on for this test.
      await page.evaluate(async () => {
        await (
          window as unknown as {
            api: { prefsSet: (p: { exportInlineImages: boolean }) => Promise<void> };
          }
        ).api.prefsSet({ exportInlineImages: true });
      });

      // Source the markdown fixture through the menu so the file is open
      // in the renderer (filePath populated → relative img paths resolve).
      await app.evaluate(async ({ BrowserWindow }, p: string) => {
        const win = BrowserWindow.getAllWindows()[0];
        win?.webContents.send('menu:command', { type: 'openRecent', path: p });
      }, mdPath);
      await setTyporaMode(app, page);
      await page.waitForFunction(
        (expected: string) => {
          const cm = document.querySelector('.cm-content') as HTMLElement | null;
          return cm?.innerText.includes(expected) ?? false;
        },
        'inline test',
        { timeout: 5000 },
      );

      await app.evaluate(({ dialog }, p: string) => {
        (
          dialog as unknown as { showSaveDialog: (...args: unknown[]) => Promise<unknown> }
        ).showSaveDialog = async () => ({ canceled: false, filePath: p });
      }, htmlPath);
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win?.webContents.send('menu:command', 'exportHtml');
      });

      let attempts = 0;
      while (!fs.existsSync(htmlPath) && attempts < 50) {
        await page.waitForTimeout(100);
        attempts++;
      }
      expect(fs.existsSync(htmlPath)).toBe(true);
      const html = fs.readFileSync(htmlPath, 'utf8');
      // Image was inlined — no raw asset path or durumi-asset URL.
      expect(html).toContain('data:image/png;base64,');
      expect(html).not.toContain(PNG_FIXTURE);
      expect(html).not.toContain('durumi-asset://');
    } finally {
      // Reset the preference so other specs aren't affected.
      try {
        await page.evaluate(async () => {
          await (
            window as unknown as {
              api: { prefsSet: (p: { exportInlineImages: boolean }) => Promise<void> };
            }
          ).api.prefsSet({ exportInlineImages: false });
        });
      } catch {
        /* page may already be closed */
      }
      await shutdown(app);
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  });
});
