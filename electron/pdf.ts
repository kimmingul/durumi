import { BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';

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
  try {
    if (Buffer.byteLength(html, 'utf8') < DATA_URL_LIMIT) {
      const dataUrl = 'data:text/html;charset=UTF-8,' + encodeURIComponent(html);
      await win.loadURL(dataUrl);
    } else {
      const os = await import('node:os');
      const path = await import('node:path');
      const tmpFile = path.join(os.tmpdir(), `durumi-export-${Date.now()}.html`);
      await writeFile(tmpFile, html, 'utf8');
      await win.loadURL('file://' + tmpFile);
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
  }
}
