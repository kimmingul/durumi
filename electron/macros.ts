import { app, shell } from 'electron';
import { promises as fs, watch as fsWatch } from 'node:fs';
import { join, dirname } from 'node:path';

export interface Macro {
  name: string;
  keybind: string;
  insertion: string;
}

const TEMPLATE = {
  macros: [
    { name: "Insert today's date", keybind: 'Mod-Shift-D', insertion: '${date}' },
    { name: 'Insert horizontal rule', keybind: 'Mod-Shift-H', insertion: '\n\n---\n\n' },
  ],
};

export function getMacrosPath(): string {
  return join(app.getPath('userData'), 'macros.json');
}

function isValid(m: unknown): m is Macro {
  return (
    !!m &&
    typeof m === 'object' &&
    typeof (m as { name: unknown }).name === 'string' &&
    typeof (m as { keybind: unknown }).keybind === 'string' &&
    typeof (m as { insertion: unknown }).insertion === 'string'
  );
}

export async function getMacros(): Promise<Macro[]> {
  const p = getMacrosPath();
  try {
    const raw = await fs.readFile(p, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const obj = parsed as { macros?: unknown };
    if (!Array.isArray(obj.macros)) return [];
    return obj.macros.filter(isValid);
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === 'ENOENT') {
      try {
        await fs.mkdir(dirname(p), { recursive: true });
        await fs.writeFile(p, JSON.stringify(TEMPLATE, null, 2), 'utf8');
        return TEMPLATE.macros;
      } catch (writeErr) {
        console.warn('[macros] failed to initialize macros.json', writeErr);
        return [];
      }
    }
    console.warn('[macros] parse failed', err);
    return [];
  }
}

export function watchMacros(cb: (macros: Macro[]) => void): () => void {
  const p = getMacrosPath();
  let timer: NodeJS.Timeout | null = null;
  let watcher: ReturnType<typeof fsWatch> | null = null;
  try {
    watcher = fsWatch(p, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void getMacros().then(cb);
      }, 300);
    });
  } catch (err) {
    console.warn('[macros] watch failed', err);
  }
  return () => {
    if (timer) clearTimeout(timer);
    watcher?.close();
  };
}

export async function openMacrosConfig(): Promise<void> {
  // Ensure file exists before opening so the user always sees something.
  await getMacros();
  await shell.openPath(getMacrosPath());
}
