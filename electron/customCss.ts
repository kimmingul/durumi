import { app, shell } from 'electron';
import { promises as fs, watch as fsWatch, type FSWatcher } from 'node:fs';
import { dirname, join } from 'node:path';

const TEMPLATE = `/* Durumi custom CSS — edit and save. Reloads automatically.
 * Examples:
 *   .cm-editor { font-family: "JetBrains Mono", monospace; }
 *   .export-content h1 { color: #c33; }
 *   :root { --cm-background-light: #fafafa; }
 */
`;

export function getCustomCssPath(): string {
  return join(app.getPath('userData'), 'custom.css');
}

export async function getCustomCss(): Promise<string> {
  const p = getCustomCssPath();
  try {
    return await fs.readFile(p, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      try {
        await fs.mkdir(dirname(p), { recursive: true });
        await fs.writeFile(p, TEMPLATE, 'utf8');
        return TEMPLATE;
      } catch (writeErr) {
        console.warn('[customCss] failed to initialize template', writeErr);
        return '';
      }
    }
    console.warn('[customCss] failed to read', err);
    return '';
  }
}

let watcher: FSWatcher | null = null;

export function watchCustomCss(cb: (css: string) => void): () => void {
  const p = getCustomCssPath();
  let timer: NodeJS.Timeout | null = null;
  try {
    watcher = fsWatch(p, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void getCustomCss().then(cb);
      }, 300);
    });
  } catch (err) {
    console.warn('[customCss] watch failed', err);
  }
  return () => {
    if (timer) clearTimeout(timer);
    watcher?.close();
    watcher = null;
  };
}

export async function openCustomCss(): Promise<void> {
  const p = getCustomCssPath();
  // Ensure the file exists so the OS editor opens an existing file.
  await getCustomCss();
  await shell.openPath(p);
}
