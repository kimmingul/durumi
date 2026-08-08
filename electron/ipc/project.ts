import { BrowserWindow, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import type { ExternalFileChange, ProjectState } from '@shared/ipc-contract';
import { assertAllowedPath } from '../pathGuard';
import { discoverProjectFor, projectFolderPaths } from '../projectDiscovery';
import { refreshProjectTree } from '../watchScope';
import { createExternalWatchService } from '../externalWatch';
import { watchRoot, unwatchRoot, WATCH_DEBOUNCE_MS } from '../fs';

/**
 * 프로젝트·외부 변경 IPC (SPEC-V03-WORKSPACE-001 M8).
 *
 * **모든 채널이 `assertAllowedPath`를 먼저 통과한다** (REQ-WS-019). IPC 표면은
 * 렌더러가 준 경로가 처음으로 실행 가능해지는 지점이므로, 여기서 막지 못하면
 * 뒤의 어떤 계층도 막을 수 없다.
 *
 * **읽기 범위에 대한 위협 모델 (M3에서 이월)**: `project:discover`는 열린 파일의
 * 조상 디렉터리에서 `durumi.project.yaml`을 읽는다. 그 경로들은 렌더러의 신뢰
 * 범위 밖이므로, 이 채널은 렌더러가 직접 요청할 수 없는 위치의 내용을 알게
 * 한다. 다음 세 가지로 좁혔다:
 *
 *  1. **시작점이 신뢰된 경로여야 한다** — `assertAllowedPath(filePath)`를
 *     통과한 파일에서만 위로 올라간다. 렌더러가 임의 경로를 지정할 수 없다.
 *  2. **파일명이 고정이다** — 읽는 것은 `durumi.project.yaml` 하나뿐이다.
 *     임의 파일을 이 채널로 읽어낼 수 없다.
 *  3. **원문을 돌려주지 않는다** — 파싱된 필드(`name`, 역할별 폴더 경로)만
 *     넘긴다. 주석·미정의 키·원문 바이트는 경계를 넘지 않는다. 손상된
 *     매니페스트도 파서 메시지만 나가고 파일 내용은 나가지 않는다.
 *
 * 남는 노출은 "사용자가 직접 쓴 프로젝트 이름과 폴더 이름"이며, 그 프로젝트에
 * 속한 파일을 이미 연 렌더러에게 알려지는 것이다. 기능에 내재적이라고 판단해
 * 수용한다. **D-6은 유지된다** — 매니페스트를 찾았다는 사실이 어떤 경로도
 * 신뢰 목록에 넣지 않는다.
 */

let service: ReturnType<typeof createExternalWatchService> | null = null;
/** 감시 등록된 파일의 부모 디렉터리 → 참조 수. 중복 등록·조기 해제를 막는다. */
const watchedDirs = new Map<string, number>();

function broadcast(change: ExternalFileChange): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('project:externalFileChange', change);
  }
}

function ensureService(): ReturnType<typeof createExternalWatchService> {
  if (service) return service;
  service = createExternalWatchService(
    {
      stat: async (p) => {
        try {
          const st = await fs.stat(p);
          return { size: st.size, mtimeMs: st.mtimeMs };
        } catch {
          return null;
        }
      },
      readBytes: async (p) => new Uint8Array(await fs.readFile(p)),
      assertAllowed: assertAllowedPath,
      watchPath: async (filePath) => {
        // fs.watch는 디렉터리 단위가 안정적이다. 파일의 부모를 감시하고
        // 이벤트를 서비스로 넘긴다 — 소유하지 않은 경로는 서비스가 끊는다.
        const dir = dirnameOf(filePath);
        const count = watchedDirs.get(dir) ?? 0;
        watchedDirs.set(dir, count + 1);
        if (count === 0) {
          await watchRoot(dir, (changedPath) => {
            service?.ingest({ type: 'change', path: changedPath });
          });
        }
      },
      unwatchPath: async (filePath) => {
        const dir = dirnameOf(filePath);
        const count = watchedDirs.get(dir) ?? 0;
        if (count <= 1) {
          watchedDirs.delete(dir);
          await unwatchRoot(dir);
        } else {
          watchedDirs.set(dir, count - 1);
        }
      },
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as NodeJS.Timeout),
    },
    broadcast,
  );
  return service;
}

function dirnameOf(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i <= 0 ? p : p.slice(0, i);
}

/**
 * 파서 메시지에서 **원문 발췌를 잘라낸다**.
 *
 * `js-yaml`의 오류 메시지는 사유 다음에 문제가 된 소스 줄을 그대로 붙인다:
 *
 * ```
 * bad indentation of a mapping entry (2:8)
 *
 *  1 | name: [unclosed
 *  2 | secret: leak-me
 * -----------^
 * ```
 *
 * 그대로 넘기면 렌더러가 직접 읽을 수 없는 위치의 매니페스트 **내용**을
 * 오류 메시지를 통해 알게 된다. REQ-WS-007이 요구하는 "파싱 오류 표시"는
 * 첫 줄(사유와 위치)로 충족되므로 나머지는 자른다.
 */
export function sanitizeParseMessage(message: string): string {
  return (message.split('\n')[0] ?? '').slice(0, 200);
}

/** discovery 결과를 경계를 넘어도 되는 필드만 담은 형태로 좁힌다. */
export function toProjectState(
  discovery: Awaited<ReturnType<typeof discoverProjectFor>>,
): ProjectState {
  if (discovery.kind === 'none') return { kind: 'none' };
  if (discovery.kind === 'corrupt') {
    return {
      kind: 'corrupt',
      root: discovery.root,
      manifestPath: discovery.manifestPath,
      reason: discovery.reason,
      message: sanitizeParseMessage(discovery.message),
    };
  }
  return {
    kind: 'project',
    root: discovery.root,
    name: discovery.manifest.name,
    folders: projectFolderPaths(discovery),
  };
}

export function registerProjectHandlers(): void {
  ipcMain.handle('project:discover', async (_e, filePath: string): Promise<ProjectState> => {
    await assertAllowedPath(filePath);
    return toProjectState(await discoverProjectFor(filePath));
  });

  // REQ-WS-047 — data 역할 경로를 포함한 재열거. REQ-WS-047a가 요구하는
  // "호출 가능한 진입점"의 IPC 쪽이다. 시각적 어포던스는 SPEC-2 소유.
  ipcMain.handle('project:refresh', async (_e, filePath: string): Promise<string[]> => {
    await assertAllowedPath(filePath);
    return refreshProjectTree(await discoverProjectFor(filePath));
  });

  ipcMain.handle('project:watchOpenFile', async (_e, path: string, content: string) => {
    await assertAllowedPath(path);
    await ensureService().watchFile(path, content);
  });

  ipcMain.handle('project:unwatchOpenFile', async (_e, path: string) => {
    await assertAllowedPath(path);
    await ensureService().unwatchFile(path);
  });

  ipcMain.handle('project:noteOpenFileContent', async (_e, path: string, content: string) => {
    await assertAllowedPath(path);
    ensureService().setOpenContent(path, content);
  });
}

/** 테스트 전용 — 모듈 수준 상태를 초기화한다. */
export function _resetProjectIpcForTests(): void {
  service = null;
  watchedDirs.clear();
}

export { WATCH_DEBOUNCE_MS };
