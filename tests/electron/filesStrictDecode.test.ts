import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDecodeFailedError } from '@shared/ipc-contract';

/**
 * SPEC-V03-WORKSPACE-002 M5 단계2 — 열기 경로 엄격 디코드의 **배선 축**.
 *
 * 대상 AC: AC-PANEL-046 ↔ REQ-PANEL-046, 네 갈래를 각각 반증 가능하게 나눈다.
 *
 * | 갈래 | 이 파일의 단언 |
 * |---|---|
 * | Then 편집 패널 미생성 + 사유 보고 | 핸들러가 `FileResult`를 내지 않고 디코드 실패 코드를 단 오류로 거부한다 |
 * | And U+FFFD 부재 | 성공 경로의 `content`에 U+FFFD가 없고, 실패 경로는 애초에 내용을 내지 않는다 |
 * | And SHA-256 불변 | 열기 시도 전후 파일 해시가 같다 |
 * | 양성 대조 | 정상 `.py`/`.csv`/BOM `.csv`는 그대로 열린다 |
 *
 * ## 왜 순수 함수 단언(`openDecode.test.ts`)만으로 부족한가
 *
 * `decodeUtf8StrictKeepingBom`이 옳아도 **핸들러가 그것을 부르지 않으면**
 * 아무 방어가 없다. `tests/electron/filesDialogFilter.test.ts`가 같은 이유로
 * export 대조 대신 `ipcMain.handle` 포착을 택했고, 여기서도 실제 핸들러를
 * 붙잡아 호출한다.
 *
 * ## 양성 대조가 왜 필수인가 (이 저장소의 기록된 실패 방식)
 *
 * 음성 단언만 있으면 "열기가 전부 깨졌다"도 통과한다. 실제로 이 저장소에는
 * 리팩터 후 재현 테스트가 **API 형태 오류**(TypeError)를 가드된 실패로 착각해
 * green이 된 전례가 있다. 그래서 (a) 실패가 `isDecodeFailedError`를 만족하는지
 * 형태로 판정하고, (b) 정상 보조 파일이 열리는 대조를 같은 파일에 둔다.
 *
 * ## 마크다운 경로는 왜 여기서 lossy를 단언하는가
 *
 * 사용자 결정(`progress.md` §F M5, C-10 준수): 엄격 디코드는 **보조 파일 열기
 * 경로에만** 적용하고 마크다운은 오늘 동작을 유지한다. 손상 마크다운의 U+FFFD
 * 치환은 이 SPEC이 닫지 않는 기존 결함으로 **존속한다**. 그 결정을 테스트로
 * 박아 두지 않으면 나중에 누군가 "일관성"을 이유로 조용히 넓힐 수 있다.
 */

interface HandlerMap {
  [channel: string]: (...args: unknown[]) => Promise<unknown>;
}
const handlers = vi.hoisted<HandlerMap>(() => ({}));
const showOpenDialogMock = vi.hoisted(() => vi.fn());
const fakeWin = vi.hoisted(() => ({}) as object);

vi.mock('electron', () => ({
  app: { getPath: () => join(tmpdir(), 'durumi-test-strict-decode-userdata') },
  BrowserWindow: { getAllWindows: () => [fakeWin], fromWebContents: () => fakeWin },
  dialog: {
    showOpenDialog: showOpenDialogMock,
    showSaveDialog: vi.fn(),
    showMessageBox: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn((channel: string, cb: (...args: unknown[]) => Promise<unknown>) => {
      handlers[channel] = cb;
    }),
  },
  shell: { openExternal: vi.fn(), showItemInFolder: vi.fn(), trashItem: vi.fn() },
}));

// 최근 파일 기록은 이 AC의 판정 대상이 아니고, 디스크에 쓰면 테스트가
// 사용자 prefs에 의존하게 된다. 열기 경로가 부르는 두 함수만 무해하게 막는다.
vi.mock('../../electron/preferences', () => ({
  addRecentFile: vi.fn(async () => {}),
  getPreferences: vi.fn(async () => ({})),
}));

import { registerFilesHandlers } from '../../electron/ipc/files';
import {
  allowSessionTree,
  _resetSessionForTests,
  _setPrefsReaderForTests,
  _resetPrefsReaderForTests,
} from '../../electron/pathGuard';

/** 유효하지 않은 UTF-8. 고립 서로게이트 + 맨 연속 바이트 + 잘린 선두. */
const INVALID_UTF8 = Buffer.from([0xed, 0xa0, 0x80, 0x80, 0xc3]);
const BOM = String.fromCharCode(0xfeff);

let dir: string;
const p = (name: string): string => join(dir, name);
const sha256 = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

/** 거부를 값으로 만든다 — `rejects.toThrow()`는 오류의 *형태*를 못 본다. */
async function settle(promise: Promise<unknown>): Promise<{ ok: boolean; value: unknown }> {
  try {
    return { ok: true, value: await promise };
  } catch (e) {
    return { ok: false, value: e };
  }
}

const openPath = (path: string): Promise<unknown> => handlers['file:openPath']!({}, path);

/** 다이얼로그가 이 경로를 고른 것처럼 만들고 `file:open`을 부른다. */
function openViaDialog(path: string): Promise<unknown> {
  showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: [path] });
  return handlers['file:open']!({ sender: {} });
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'durumi-strict-decode-'));
  writeFileSync(p('broken.csv'), INVALID_UTF8);
  writeFileSync(p('broken.md'), INVALID_UTF8);
  writeFileSync(p('analysis.py'), 'print("한글 ok")\n', 'utf8');
  writeFileSync(p('data.csv'), 'a,b\n1,2\n', 'utf8');
  writeFileSync(p('bom.csv'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('x,y\n')]));
  writeFileSync(p('notes.md'), '# 제목\n', 'utf8');
});

afterEach(() => {
  _resetSessionForTests();
  _resetPrefsReaderForTests();
});

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  showOpenDialogMock.mockReset();
  registerFilesHandlers();
  _setPrefsReaderForTests(async () => ({}));
  allowSessionTree(dir);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe('AC-PANEL-046 Then — 디코드 불가 보조 파일은 편집 내용을 내지 않는다', () => {
  it('file:openPath가 디코드 실패 코드를 단 오류로 거부한다', async () => {
    const outcome = await settle(openPath(p('broken.csv')));

    expect(outcome.ok, '핸들러가 손상된 내용을 성공으로 돌려주었다').toBe(false);
    // 형태로 판정한다 — 아무 오류나(TypeError 등) 통과시키면 "가드가 사라져도
    // green"이 되고, 그것이 이 저장소가 실제로 겪은 실패 방식이다.
    expect(isDecodeFailedError(outcome.value), `예상 밖 오류: ${String(outcome.value)}`).toBe(true);
  });

  it('file:open(다이얼로그) 경로도 같은 자세로 거부한다', async () => {
    const outcome = await settle(openViaDialog(p('broken.csv')));

    expect(outcome.ok).toBe(false);
    expect(isDecodeFailedError(outcome.value)).toBe(true);
  });

  it('사유에 어느 파일인지가 실려 있다', async () => {
    const outcome = await settle(openPath(p('broken.csv')));

    expect(String((outcome.value as Error).message)).toContain('broken.csv');
  });
});

describe('AC-PANEL-046 And — 버퍼에 U+FFFD가 담기지 않는다', () => {
  it('그 파일은 오늘의 lossy 디코드였다면 U+FFFD를 만들어 냈을 파일이다', () => {
    // 함정이 진짜임을 먼저 고정한다. 이 단언이 깨지면 아래 단언은 무의미하다.
    expect(readFileSync(p('broken.csv'), 'utf8')).toContain('�');
  });

  it('핸들러가 U+FFFD를 담은 어떤 내용도 내놓지 않는다', async () => {
    const outcome = await settle(openPath(p('broken.csv')));

    const produced = outcome.ok ? JSON.stringify(outcome.value) : '';
    expect(produced).not.toContain('�');
  });

  it('정상 보조 파일의 내용에도 U+FFFD가 없다', async () => {
    const r = (await openPath(p('analysis.py'))) as { content: string };

    expect(r.content).not.toContain('�');
  });
});

describe('AC-PANEL-046 And — 그 파일의 바이트가 변경되지 않는다 (SHA-256)', () => {
  it('열기 시도 전후 해시가 같다', async () => {
    const before = sha256(p('broken.csv'));

    await settle(openPath(p('broken.csv')));
    await settle(openViaDialog(p('broken.csv')));

    expect(sha256(p('broken.csv'))).toBe(before);
  });

  it('성공적으로 연 보조 파일도 열기만으로는 바뀌지 않는다', async () => {
    const before = sha256(p('bom.csv'));

    await openPath(p('bom.csv'));

    expect(sha256(p('bom.csv'))).toBe(before);
  });
});

describe('AC-PANEL-046 양성 대조 — 정상 보조 파일은 그대로 열린다', () => {
  it('.py가 열린다 — 엄격 디코드가 과잉 차단하지 않는다', async () => {
    const r = (await openPath(p('analysis.py'))) as { path: string; content: string };

    expect(r.path).toBe(p('analysis.py'));
    expect(r.content).toBe('print("한글 ok")\n');
  });

  it('.csv가 열린다 (REQ-PANEL-045 평문 폴백 대상)', async () => {
    const r = (await openPath(p('data.csv'))) as { content: string };

    expect(r.content).toBe('a,b\n1,2\n');
  });

  it('BOM 있는 .csv는 BOM을 그대로 담아 열린다 — 왕복 3바이트가 증발하지 않는다', async () => {
    const r = (await openPath(p('bom.csv'))) as { content: string };

    expect(r.content).toBe(`${BOM}x,y\n`);
    // 오늘의 `readFile(path,'utf8')`과 같은 문자열이어야 한다.
    expect(r.content).toBe(readFileSync(p('bom.csv'), 'utf8'));
  });
});

describe('C-10 — 마크다운 경로는 오늘 동작을 유지한다 (사용자 결정)', () => {
  it('손상된 .md는 여전히 lossy로 열린다 — 이 SPEC은 그 결함을 닫지 않는다', async () => {
    const outcome = await settle(openPath(p('broken.md')));

    expect(outcome.ok, '마크다운 경로가 엄격해졌다 — 사용자 결정(C-10) 위반').toBe(true);
    expect((outcome.value as { content: string }).content).toContain('�');
  });

  it('정상 .md도 그대로 열린다', async () => {
    const r = (await openPath(p('notes.md'))) as { content: string };

    expect(r.content).toBe('# 제목\n');
  });

  it('마크다운 판정은 확장자로만 갈린다 — 같은 바이트가 .csv에서는 거부된다', async () => {
    // 같은 내용, 다른 확장자. 분기가 실제로 종류에 걸려 있음을 고정한다.
    const asMarkdown = await settle(openPath(p('broken.md')));
    const asAuxiliary = await settle(openPath(p('broken.csv')));

    expect([asMarkdown.ok, asAuxiliary.ok]).toEqual([true, false]);
  });
});
