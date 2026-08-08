import { readdir, stat, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import * as fs from 'node:fs';
import * as pathLib from 'node:path';
import { dialog, BrowserWindow } from 'electron';
import type { DirEntry } from '../shared/ipc-contract';
import { logWarn } from './log';

/**
 * Atomic write: tmp file in the target's directory → fs.rename → cleanup
 * tmp on failure. Same-directory tmp guarantees the rename is atomic on
 * POSIX, so a crash mid-write leaves either the old file intact or the
 * fully-written new file — never a truncated half.
 *
 * `mkdir({ recursive: true })` on the parent so callers don't need to
 * pre-create directories (matches the previous `writeMemoSidecar`
 * contract). Throws on any I/O error.
 *
 * Tmp filenames combine pid + ts + a process-local counter so two
 * concurrent writes to the same target within a millisecond don't
 * collide (which would otherwise cause one of them to ENOENT on rename).
 */
let atomicCounter = 0;

export async function writeFileAtomic(
  path: string,
  content: string | Uint8Array,
  encoding: BufferEncoding = 'utf8',
): Promise<void> {
  const seq = (atomicCounter = (atomicCounter + 1) >>> 0);
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}-${seq}`;
  await mkdir(pathLib.dirname(path), { recursive: true });
  await writeFile(tmp, content, typeof content === 'string' ? encoding : undefined);
  try {
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}

const EXCLUDE_DIRS = new Set([
  'node_modules',
  'out',
  'dist',
  'dist-build',
  'target',
  'build',
  '.git',
  '.DS_Store',
  '.vscode',
  '.idea',
  '.next',
  '.nuxt',
]);

const MD_EXT = /\.(md|markdown)$/i;

function isMarkdownFile(name: string): boolean {
  return MD_EXT.test(name);
}

function isHidden(name: string): boolean {
  return name.startsWith('.');
}

function isExcluded(name: string): boolean {
  return EXCLUDE_DIRS.has(name);
}

export async function listDirectory(absPath: string): Promise<DirEntry[]> {
  let entries: Array<{ name: string; isDirectory: () => boolean }>;
  try {
    entries = (await readdir(absPath, { withFileTypes: true })) as never;
  } catch (err) {
    void logWarn('fs', `listDirectory: failed to read ${absPath}`, err);
    return [];
  }
  const out: DirEntry[] = [];
  for (const e of entries) {
    if (isHidden(e.name)) continue;
    if (isExcluded(e.name)) continue;
    const isDir = e.isDirectory();
    if (!isDir && !isMarkdownFile(e.name)) continue;
    const full = pathLib.join(absPath, e.name);
    let mtimeMs = 0;
    try {
      const st = await stat(full);
      mtimeMs = st.mtimeMs;
    } catch {
      // permission denied on stat — keep entry with mtimeMs=0
    }
    out.push({ name: e.name, path: full, isDir, mtimeMs });
  }
  out.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

export const WATCH_DEBOUNCE_MS = 200;
export const WATCH_POLL_MS = 5000;

/**
 * 폴링 스냅샷용 열거 — **확장자로 거르지 않는다** (REQ-WS-032).
 *
 * `listDirectory`를 재사용하면 안 되는 이유: 그 함수는 폴더 트리 UI용이라
 * 마크다운이 아닌 파일을 의도적으로 제외한다. 감시가 그것을 재사용하면
 * `.py`·`.csv` 변경이 Linux에서 통째로 보이지 않는다 — 감시 규칙이 확장자에
 * 의존해서는 안 된다는 REQ-WS-032 위반이다. 숨김·제외 디렉터리 규칙만 공유한다.
 */
async function pollEntries(absPath: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  let entries: Array<{ name: string; isDirectory: () => boolean }>;
  try {
    entries = (await readdir(absPath, { withFileTypes: true })) as never;
  } catch {
    return out;
  }
  for (const e of entries) {
    if (isHidden(e.name)) continue;
    if (isExcluded(e.name)) continue;
    const full = pathLib.join(absPath, e.name);
    let mtimeMs = 0;
    try {
      const st = await stat(full);
      mtimeMs = st.mtimeMs;
    } catch {
      // stat 실패는 mtime 0으로 둔다 — listDirectory와 같은 처리다.
    }
    out.set(full, mtimeMs);
  }
  return out;
}

interface RootWatchEntry {
  watcher: fs.FSWatcher | null;
  pollInterval: NodeJS.Timeout | null;
  pollSnapshot: Map<string, number>;
  /**
   * **경로별** 합류 타이머 (REQ-WS-016).
   *
   * 이전에는 루트당 스칼라 `pendingPath` 하나와 타이머 하나였다. 합류 창
   * 안에 두 파일이 바뀌면 뒤엣것이 앞엣것을 덮어써 **한 이벤트가 소실됐다** —
   * 에이전트가 `manuscript/a.md`와 `b.md`를 연달아 쓰는 v0.4의 정상 흐름에서
   * 곧바로 드러난다. 지금까지 문제가 보이지 않은 이유는 유일한 소비자인
   * `useFolderTree`가 어차피 루트를 재열거하기 때문이고, 조정 계층은 어느
   * 경로가 바뀌었는지를 요구하므로 사정이 다르다.
   */
  pendingTimers: Map<string, NodeJS.Timeout>;
}

const watchers: Map<string, RootWatchEntry> = new Map();

export async function watchRoot(
  rootPath: string,
  onChange: (changedPath: string) => void,
): Promise<void> {
  // Idempotent: if this root is already being watched, no-op.
  if (watchers.has(rootPath)) return;

  const entry: RootWatchEntry = {
    watcher: null,
    pollInterval: null,
    pollSnapshot: new Map(),
    pendingTimers: new Map(),
  };
  watchers.set(rootPath, entry);

  if (process.platform === 'linux') {
    entry.pollInterval = setInterval(async () => {
      const cur = await pollEntries(rootPath);
      // 폴링도 **경로 단위**로 방출한다 (plan.md §B.5 선택 (a)).
      // 이전에는 무엇이 바뀌었든 `onChange(rootPath)`를 방출해 REQ-WS-016의
      // 경로별 보장을 구조적으로 만족할 수 없었다. 스냅샷이 이미 경로별
      // mtime 맵이므로 바뀐 키를 추리는 비용은 사실상 없고, 그 결과 감시
      // 계약이 플랫폼에 무관하게 하나로 유지된다.
      const prev = entry.pollSnapshot;
      const changedPaths: string[] = [];
      for (const [path, mtime] of cur) {
        if (prev.get(path) !== mtime) changedPaths.push(path);
      }
      for (const path of prev.keys()) {
        if (!cur.has(path)) changedPaths.push(path);
      }
      if (changedPaths.length > 0) {
        entry.pollSnapshot = cur;
        for (const path of changedPaths) onChange(path);
      }
    }, WATCH_POLL_MS);
    entry.pollSnapshot = await pollEntries(rootPath);
  } else {
    entry.watcher = fs.watch(rootPath, { recursive: true }, (_event, filename) => {
      const changedPath = filename ? pathLib.join(rootPath, String(filename)) : rootPath;
      // 경로마다 독립된 타이머를 둔다. 같은 경로의 후속 이벤트만 창을
      // 연장하므로, 한 창 안에 서로 다른 경로가 바뀌어도 어느 것도 소실되지
      // 않는다 (REQ-WS-016 / AC-WS-059).
      const existing = entry.pendingTimers.get(changedPath);
      if (existing) clearTimeout(existing);
      entry.pendingTimers.set(
        changedPath,
        setTimeout(() => {
          entry.pendingTimers.delete(changedPath);
          onChange(changedPath);
        }, WATCH_DEBOUNCE_MS),
      );
    });
  }
}

export async function unwatchRoot(rootPath: string): Promise<void> {
  const entry = watchers.get(rootPath);
  if (!entry) return;
  if (entry.watcher) {
    entry.watcher.close();
    entry.watcher = null;
  }
  if (entry.pollInterval) {
    clearInterval(entry.pollInterval);
    entry.pollInterval = null;
  }
  for (const timer of entry.pendingTimers.values()) clearTimeout(timer);
  entry.pendingTimers.clear();
  entry.pollSnapshot = new Map();
  watchers.delete(rootPath);
}

export async function unwatchAllRoots(): Promise<void> {
  const paths = Array.from(watchers.keys());
  for (const p of paths) {
    await unwatchRoot(p);
  }
}

export async function openFolderDialog(): Promise<string | null> {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return null;
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (r.canceled || r.filePaths.length === 0) return null;
  return r.filePaths[0] ?? null;
}
