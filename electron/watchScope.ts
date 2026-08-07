import { promises as fs, type Dirent } from 'node:fs';
import { join } from 'node:path';
import { EXCLUDED_WATCH_ROLE, type FolderRole } from '../shared/projectFolders';
import { projectFolderPaths, type ProjectDiscovery } from './projectDiscovery';

/**
 * 감시 범위 결정 — 무엇을 감시하고 무엇을 빼는가.
 *
 * 두 축이 독립적이다:
 *  - **열린 파일**은 위치·프로젝트 소속과 무관하게 전부 감시한다 (REQ-WS-013).
 *  - **규약 폴더**는 소유 프로젝트가 있을 때만 추가로 감시한다 (REQ-WS-045).
 *
 * 제외는 **역할 기반**이다 (REQ-WS-046). `folders`가 data 역할에 대해 해석한
 * 경로 정확히 하나만 빠진다 — 리터럴 이름 `data`를 빼는 것이 아니다.
 * `folders.data: archive`와 `folders.manuscript: data`가 함께 선언된 프로젝트에서
 * 이름으로 제외하면 원고 폴더 감시가 끊겨 REQ-WS-045를 정면으로 위반한다.
 *
 * 제외 이유는 성능이다 — 의학연구 원자료는 수 기가바이트에 이를 수 있어 감시
 * 등록과 이벤트 처리 비용이 UI 응답성을 위협한다. 그래서 **폴더**를 뺄 뿐이며,
 * 그 안의 파일이라도 **열려 있으면** 감시된다.
 */

export interface WatchScope {
  /** 열린 파일 — 위치 무관 (REQ-WS-013). */
  files: string[];
  /** 추가 감시 대상 규약 폴더 (REQ-WS-045). */
  folders: string[];
  /** 감시에서 뺀 경로. 언제나 data 역할 하나뿐이다 (REQ-WS-046). */
  excluded: string[];
}

export interface WatchScopeInput {
  openFiles: readonly string[];
  project: ProjectDiscovery;
}

export function resolveWatchScope({ openFiles, project }: WatchScopeInput): WatchScope {
  const files = [...openFiles];
  if (project.kind !== 'project') {
    // 프로젝트 없음·손상 모두 규약 폴더 감시가 없을 뿐, 열린 파일 감시는 그대로다.
    return { files, folders: [], excluded: [] };
  }

  const byRole = projectFolderPaths(project);
  const folders: string[] = [];
  const excluded: string[] = [];
  for (const [role, path] of Object.entries(byRole) as [FolderRole, string][]) {
    if (role === EXCLUDED_WATCH_ROLE) excluded.push(path);
    else folders.push(path);
  }
  return { files, folders, excluded };
}

export interface WatchRegistrar {
  /** 신뢰 밖이면 throw. 기존 `assertAllowedPath`가 그대로 들어온다. */
  assertAllowed: (path: string) => Promise<void>;
  watch: (path: string) => Promise<void>;
}

/**
 * 범위를 실제 감시자에 등록한다.
 *
 * 감시는 `pathGuard` 검증을 우회하지 않는다 (REQ-WS-019). 등록 **전에** 전부
 * 검증하므로, 목록에 신뢰 밖 경로가 하나라도 있으면 아무것도 등록되지 않는다 —
 * 절반만 등록된 상태를 남기지 않기 위함이다.
 */
export async function registerWatchScope(
  scope: WatchScope,
  registrar: WatchRegistrar,
): Promise<void> {
  const targets = [...scope.files, ...scope.folders];
  for (const path of targets) {
    await registrar.assertAllowed(path);
  }
  for (const path of targets) {
    await registrar.watch(path);
  }
}

/**
 * 수동 새로고침 — 프로젝트 트리를 재열거한다 (REQ-WS-047).
 *
 * **data 역할 경로를 포함한다.** 감시에서 빠져 있는 그 경로의 변경을
 * 표면화하는 유일한 경로가 이 재열거다.
 *
 * 없는 규약 폴더는 오류가 아니며(REQ-WS-011) 조용히 건너뛴다. 디렉터리를
 * 만들지 않는다.
 *
 * 시각적 어포던스(버튼 위치·단축키)는 SPEC-2가 소유하고, IPC·메뉴 진입점
 * 배선은 M8이 맡는다 (REQ-WS-047a). 여기서는 호출 가능한 함수만 제공한다.
 */
export async function refreshProjectTree(project: ProjectDiscovery): Promise<string[]> {
  if (project.kind !== 'project') return [];

  const roots = Object.values(projectFolderPaths(project));
  const out: string[] = [];
  for (const root of roots) {
    await collectInto(root, out);
  }
  return out.sort();
}

async function collectInto(dir: string, out: string[]): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    // 규약 폴더 부재는 오류가 아니다 (REQ-WS-011).
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await collectInto(full, out);
    else out.push(full);
  }
}
