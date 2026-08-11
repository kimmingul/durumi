import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MARKDOWN_EXTENSIONS } from '@shared/fileKind';

/**
 * AC-PANEL-040 의 `And` 축 — 다이얼로그가 실제로 받는 확장자 집합이
 * `shared/fileKind.ts`의 값과 같은가.
 *
 * ## 왜 export 대조가 아니라 동작 포착인가
 *
 * `electron/ipc/files.ts`가 상수를 내보내는지 보는 것으로는 **다이얼로그가
 * 그 값을 받는지** 알 수 없다. 호출부에 배열을 다시 박아 넣어도 export는
 * 그대로이기 때문이다. 그래서 `ipcMain.handle`로 `file:open` 핸들러를
 * 포착하고, 그것을 호출해 `dialog.showOpenDialog`에 **실제로 건네진 인자**를
 * 검사한다. 형태는 `tests/electron/pickFile.test.ts`의 선례를 따른다.
 *
 * ## 이 단언이 잡지 못하는 것
 *
 * 구조적 동등(`toEqual`) 검사이므로, 호출부가 상수를 읽지 않고 **값이 같은**
 * 리터럴을 다시 박아 넣는 경우는 통과한다. 참조 동일성(`toBe`)이면 그것까지
 * 잡히지만 Electron `FileFilter.extensions`가 `string[]`(가변)이라 `shared/`의
 * 상수를 `readonly`로 둔 채로는 같은 객체를 건넬 수 없다. 공유 SSOT의 불변성이
 * 더 큰 값이라 판단해 구조적 동등을 택했다 — 실제로 막으려던 실패(두 값이
 * **갈라지는 것**)는 이 형태로 잡힌다.
 */

interface HandlerMap {
  [channel: string]: (...args: unknown[]) => Promise<unknown>;
}
const handlers = vi.hoisted<HandlerMap>(() => ({}));
const showOpenDialogMock = vi.hoisted(() => vi.fn());
const fakeWin = vi.hoisted(() => ({}) as object);

vi.mock('electron', () => ({
  // `preferences.ts`/`pendingAssets.ts`가 모듈 로드 시점에 부르는 경로.
  app: { getPath: () => '/tmp/durumi-test-filekind' },
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

import { registerFilesHandlers } from '../../electron/ipc/files';

interface OpenDialogOptions {
  filters?: { name: string; extensions: string[] }[];
}

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  showOpenDialogMock.mockReset();
  registerFilesHandlers();
});

describe('file:open 다이얼로그 필터 — AC-PANEL-040 And', () => {
  it('shared/fileKind.ts의 마크다운 확장자 집합을 그대로 건넨다', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] });

    const handler = handlers['file:open'];
    expect(handler).toBeDefined();
    await handler!({ sender: {} });

    expect(showOpenDialogMock).toHaveBeenCalledTimes(1);
    const [winArg, opts] = showOpenDialogMock.mock.calls[0]! as [object, OpenDialogOptions];
    expect(winArg).toBe(fakeWin);
    expect(opts.filters?.[0]?.extensions).toEqual([...MARKDOWN_EXTENSIONS]);
  });
});
