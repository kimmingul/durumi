import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  MANIFEST_FILENAME,
  parseWorkspaceManifest,
  type ManifestWarning,
  type WorkspaceManifest,
} from '../shared/workspaceManifest';
import type { FolderRole } from '../shared/projectFolders';

/**
 * Durumi 프로젝트 discovery — 열린 파일에서 상위로 올라가며 매니페스트를 찾는다.
 *
 * 형태는 기존 `.bib` walk-up(`electron/bibliography.ts`)을 그대로 따른다:
 * 같은 32단계 상한, 같은 "읽기 실패는 조용히 다음 후보로" 규칙. REQ-WS-004가
 * 요구하는 "동일한 상한"이 문장이 아니라 같은 코드 형태로 지켜지도록 했다.
 *
 * **이 모듈은 절대 쓰지 않는다.** 손상된 매니페스트를 고치지도(REQ-WS-007),
 * 규약 폴더를 만들지도(REQ-WS-011) 않는다. 읽기 전용이다.
 *
 * **신뢰 경계 (D-6 / REQ-WS-012)**: discovery는 `pathGuard`의 신뢰를 넓히지
 * 않는다 — 세션 신뢰 등록 API도, 워크스페이스 폴더 추가도 호출하지 않으며,
 * 매니페스트를 찾았다는 사실은 그 루트 하위 경로에 대한 어떤 권한도 만들지
 * 않는다. 손상된 렌더러가 매니페스트를 심어 스스로 신뢰를 넓히는 경로를
 * 만들지 않기 위함이다. (이 모듈이 그 API들의 이름조차 담지 않는 것은
 * 의도된 것이다 — 회귀 테스트가 소스를 스캔한다.)
 *
 * **호출자의 선행 조건**: `filePath`는 호출자가 이미 `assertAllowedPath`로
 * 검증한 경로여야 한다. discovery는 거기서 파생한 조상 디렉터리만 훑으며,
 * 렌더러가 임의 경로를 지정할 수 없다.
 */

/** 기존 `.bib` walk-up과 동일한 상한 (REQ-WS-004). */
export const MAX_WALK_UP_LEVELS = 32;

export type ProjectDiscovery =
  /** 소유 프로젝트 없음 — 오류가 아니라 1급 상태다 (REQ-WS-006). */
  | { kind: 'none' }
  | {
      kind: 'project';
      /** 매니페스트가 있는 디렉터리의 절대 경로. */
      root: string;
      manifestPath: string;
      manifest: WorkspaceManifest;
      warnings: ManifestWarning[];
    }
  /** 파싱 실패 또는 필수 키 결여 (REQ-WS-007, 008). 프로젝트 없음이 아니다. */
  | {
      kind: 'corrupt';
      root: string;
      manifestPath: string;
      reason: 'yaml' | 'not-mapping' | 'missing-name';
      message: string;
    };

/**
 * `dir`에 매니페스트가 있으면 그 판정을, 없으면 null을 돌려준다.
 *
 * 읽기 실패를 "여기 없음"으로 처리하는 것은 `bibliography.ts::probeDir`와
 * 같은 선택이다 — 권한 오류와 부재를 구분하려면 stat 왕복이 추가되는데,
 * 그 구분으로 달라지는 동작이 없다.
 */
async function probeDir(dir: string): Promise<ProjectDiscovery | null> {
  const manifestPath = join(dir, MANIFEST_FILENAME);
  let source: string;
  try {
    source = await fs.readFile(manifestPath, 'utf8');
  } catch {
    return null;
  }

  const parsed = parseWorkspaceManifest(source);
  if (parsed.kind === 'corrupt') {
    return { kind: 'corrupt', root: dir, manifestPath, reason: parsed.reason, message: parsed.message };
  }
  return {
    kind: 'project',
    root: dir,
    manifestPath,
    manifest: parsed.manifest,
    warnings: parsed.warnings,
  };
}

/**
 * `filePath`의 소유 프로젝트를 찾는다. 가장 가까운 매니페스트가 이기며
 * (REQ-WS-005), 그것이 손상이면 손상으로 보고한다 — 상위의 정상 매니페스트로
 * 넘어가지 않는다. 그렇게 하면 손상이 조용히 가려진다(REQ-WS-008).
 */
export async function discoverProjectFor(filePath: string | null): Promise<ProjectDiscovery> {
  if (!filePath) return { kind: 'none' };

  let dir = resolve(dirname(filePath));
  for (let i = 0; i < MAX_WALK_UP_LEVELS; i++) {
    const hit = await probeDir(dir);
    if (hit) return hit;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { kind: 'none' };
}

/**
 * 역할별 규약 폴더의 **절대** 경로. `shared/projectFolders.ts`는 node 타입이
 * 없어 루트 상대 경로까지만 산출하므로(composite 경계), 절대 경로 결합은 여기서
 * 한다 — AC-WS-008이 요구하는 `<루트>/output/fig` 형태가 이 함수의 산출이다.
 *
 * 경로를 돌려줄 뿐 디렉터리를 만들지 않는다(REQ-WS-011).
 */
export function projectFolderPaths(
  discovery: Extract<ProjectDiscovery, { kind: 'project' }>,
): Record<FolderRole, string> {
  const out = {} as Record<FolderRole, string>;
  for (const [role, rel] of Object.entries(discovery.manifest.folders)) {
    out[role as FolderRole] = join(discovery.root, rel);
  }
  return out;
}
