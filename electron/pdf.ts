import { BrowserWindow } from 'electron';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DATA_URL_LIMIT = 1.5 * 1024 * 1024;

export async function exportToPdf(html: string, outputPath: string): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  let tmpFile: string | null = null;
  try {
    if (Buffer.byteLength(html, 'utf8') < DATA_URL_LIMIT) {
      const dataUrl = 'data:text/html;charset=UTF-8,' + encodeURIComponent(html);
      await win.loadURL(dataUrl);
    } else {
      tmpFile = join(tmpdir(), `durumi-export-${Date.now()}-${process.pid}.html`);
      await writeFile(tmpFile, html, 'utf8');
      // pathToFileURL handles Windows drive letters and percent-encoding;
      // plain string concat ('file://' + path) produces invalid URLs there.
      await win.loadURL(pathToFileURL(tmpFile).href);
    }
    await new Promise((r) => setTimeout(r, 100));
    const buf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      landscape: false,
      margins: {
        top: 0.5,
        bottom: 0.5,
        left: 0.5,
        right: 0.5,
      },
    });
    await writeFile(outputPath, buf);
  } finally {
    win.destroy();
    if (tmpFile) {
      await unlink(tmpFile).catch(() => undefined);
    }
  }
}
