import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(async () => undefined),
  unlink: vi.fn(async () => undefined),
  tmpdir: vi.fn(() => '/tmp'),
  loadURL: vi.fn(async () => undefined),
  printToPDF: vi.fn(async () => Buffer.from('pdf-bytes')),
  destroy: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: { writeFile: mocks.writeFile, unlink: mocks.unlink },
  writeFile: mocks.writeFile,
  unlink: mocks.unlink,
}));

vi.mock('node:os', () => ({
  default: { tmpdir: mocks.tmpdir },
  tmpdir: mocks.tmpdir,
}));

vi.mock('electron', () => ({
  BrowserWindow: vi.fn().mockImplementation(() => ({
    webContents: { printToPDF: mocks.printToPDF },
    loadURL: mocks.loadURL,
    destroy: mocks.destroy,
  })),
}));

import { exportToPdf } from '../../electron/pdf';

const { writeFile, unlink, loadURL, printToPDF, destroy } = mocks;

beforeEach(() => {
  writeFile.mockClear();
  unlink.mockClear();
  loadURL.mockClear();
  printToPDF.mockClear();
  destroy.mockClear();
});

describe('exportToPdf', () => {
  it('uses a data URL for small HTML and writes no temp file', async () => {
    await exportToPdf('<p>hi</p>', '/out/out.pdf');
    expect(loadURL).toHaveBeenCalledTimes(1);
    expect(loadURL.mock.calls[0]?.[0]).toMatch(/^data:text\/html/);
    // Only the final PDF write — no temp HTML write.
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0]?.[0]).toBe('/out/out.pdf');
    expect(unlink).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('falls back to a temp file via pathToFileURL for large HTML and cleans it up', async () => {
    const big = 'x'.repeat(2 * 1024 * 1024);
    await exportToPdf(big, '/out/big.pdf');

    expect(loadURL).toHaveBeenCalledTimes(1);
    const url = loadURL.mock.calls[0]?.[0] as string;
    // pathToFileURL produces a file:// URL with proper encoding (no plain
    // string concat artifacts like missing slashes on Windows).
    expect(url.startsWith('file:///')).toBe(true);

    // Two writeFile calls: the temp HTML, then the PDF.
    expect(writeFile).toHaveBeenCalledTimes(2);
    const tmpPath = writeFile.mock.calls[0]?.[0] as string;
    expect(tmpPath.startsWith('/tmp/durumi-export-')).toBe(true);
    expect(tmpPath.endsWith('.html')).toBe(true);

    expect(unlink).toHaveBeenCalledWith(tmpPath);
  });

  it('still cleans up the temp file when printToPDF throws', async () => {
    const big = 'x'.repeat(2 * 1024 * 1024);
    printToPDF.mockRejectedValueOnce(new Error('print failed'));
    await expect(exportToPdf(big, '/out/big.pdf')).rejects.toThrow('print failed');
    expect(unlink).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
