import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The `dialog:pickFile` handler is a thin wrapper over `dialog.showOpenDialog`.
 * We mock electron's primitives, register the IPC handlers, capture the
 * `dialog:pickFile` callback by name, and call it with synthetic events to
 * verify behavior.
 */

interface HandlerMap { [channel: string]: (...args: unknown[]) => Promise<unknown> }
const handlers = vi.hoisted<HandlerMap>(() => ({}));
const showOpenDialogMock = vi.hoisted(() => vi.fn());
const fakeWin = vi.hoisted(() => ({}) as object);

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [fakeWin],
    fromWebContents: () => fakeWin,
  },
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
  nativeTheme: {
    on: vi.fn(),
    shouldUseDarkColors: false,
  },
  shell: { openExternal: vi.fn() },
}));

// Tests don't exercise these, but registerIpcHandlers imports them.
vi.mock('../../electron/preferences', () => ({
  getPreferences: vi.fn(),
  setPreferences: vi.fn(),
  addRecentFile: vi.fn(),
}));
vi.mock('../../electron/fs', () => ({
  listDirectory: vi.fn(),
  watchRoot: vi.fn(),
  unwatchRoot: vi.fn(),
  unwatchAllRoots: vi.fn(),
  openFolderDialog: vi.fn(),
}));
vi.mock('../../electron/pdf', () => ({ exportToPdf: vi.fn() }));
vi.mock('../../electron/customCss', () => ({ getCustomCss: vi.fn() }));
vi.mock('../../electron/images', () => ({ saveImage: vi.fn() }));
// pendingAssets pulls in `app.getPath('userData')` at module load via the
// shared electron mock; we don't exercise it here, so stub the exports.
vi.mock('../../electron/pendingAssets', () => ({
  migratePendingInContent: vi.fn(async (content: string) => ({
    content,
    changed: false,
    moved: 0,
    failed: 0,
  })),
  savePendingImage: vi.fn(),
  isPendingPath: vi.fn(() => false),
  sweepStalePendingDirs: vi.fn(),
}));
vi.mock('../../electron/macros', () => ({ getMacros: vi.fn() }));
vi.mock('../../electron/git', () => ({ getRepoStatus: vi.fn() }));
vi.mock('../../electron/i18n', () => ({
  resolveLang: vi.fn(() => 'en'),
  t: vi.fn((k: string) => k),
}));
vi.mock('../../electron/pandoc', () => ({
  clearPandocCache: vi.fn(),
  detectHomebrew: vi.fn(),
  detectPandoc: vi.fn(),
  importViaPandoc: vi.fn(),
  installPandocViaHomebrew: vi.fn(),
  runPandoc: vi.fn(),
}));
vi.mock('../../electron/search', () => ({ searchInWorkspace: vi.fn() }));
vi.mock('../../electron/fileIndex', () => ({ indexWorkspace: vi.fn() }));
vi.mock('../../electron/bibliography', () => ({ findBibliographyFor: vi.fn() }));
vi.mock('../../electron/fileOps', () => ({
  createFile: vi.fn(),
  createFolder: vi.fn(),
  duplicate: vi.fn(),
  moveToTrash: vi.fn(),
  rename: vi.fn(),
  revealInFolder: vi.fn(),
}));

import { registerIpcHandlers } from '../../electron/ipc';

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  showOpenDialogMock.mockReset();
  registerIpcHandlers();
});

describe('dialog:pickFile IPC handler', () => {
  it('returns the selected file path when the user confirms', async () => {
    showOpenDialogMock.mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/style.docx'],
    });
    const handler = handlers['dialog:pickFile'];
    expect(handler).toBeDefined();
    const result = await handler!({ sender: {} }, {
      title: 'Pick a file',
      filters: [{ name: 'Word', extensions: ['docx'] }],
    });
    expect(result).toBe('/tmp/style.docx');
    expect(showOpenDialogMock).toHaveBeenCalledTimes(1);
    const [winArg, opts] = showOpenDialogMock.mock.calls[0]!;
    expect(winArg).toBe(fakeWin);
    expect(opts).toMatchObject({
      properties: ['openFile'],
      title: 'Pick a file',
      filters: [{ name: 'Word', extensions: ['docx'] }],
    });
  });

  it('returns null when the user cancels', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] });
    const result = await handlers['dialog:pickFile']!({ sender: {} });
    expect(result).toBeNull();
  });

  it('returns null when no file is selected even if not canceled', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: [] });
    const result = await handlers['dialog:pickFile']!({ sender: {} });
    expect(result).toBeNull();
  });

  it('passes options through and works without options', async () => {
    showOpenDialogMock.mockResolvedValue({
      canceled: false,
      filePaths: ['/x'],
    });
    await handlers['dialog:pickFile']!({ sender: {} });
    const [, opts] = showOpenDialogMock.mock.calls[0]!;
    expect(opts).toMatchObject({ properties: ['openFile'] });
    expect(opts.title).toBeUndefined();
    expect(opts.filters).toBeUndefined();
  });
});
