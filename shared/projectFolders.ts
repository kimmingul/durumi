/**
 * 프로젝트 폴더 규약 — 역할(role) 다섯 가지와 그 기본 경로, 그리고 매니페스트
 * `folders` 재정의의 해석. 순수 함수이며 의존성이 없다.
 *
 * `REFERENCE_DIR_NAME`이 여기 있는 이유(REQ-WS-009): 참고문헌 폴더명은
 * `electron/referenceFs.ts`가 v0.1.7부터 출하해 온 값이고 이 SPEC은 그것을
 * 바꾸지 않는다. 그런데 `shared/`는 composite 경계(`tsconfig.web.json`) 때문에
 * `electron/`을 import할 수 없다(TS6307). 그래서 상수를 `shared/`로 옮기고
 * `electron/referenceFs.ts`가 재export하도록 방향을 뒤집었다 — 기존 import
 * 경로는 그대로 동작하고 값의 출처는 하나로 남는다.
 *
 * 반환 경로는 **프로젝트 루트 기준 상대 POSIX 경로**다. 절대 경로 결합은
 * `node:path`를 쓸 수 있는 main 계층의 몫이다 — `shared/`에는 node 타입이 없다.
 */

export type FolderRole = 'data' | 'scripts' | 'figures' | 'manuscript' | 'reference';

export const FOLDER_ROLES: readonly FolderRole[] = [
  'data',
  'scripts',
  'figures',
  'manuscript',
  'reference',
] as const;

/** 참고문헌 폴더명 (단수형). `electron/referenceFs.ts`가 이 값을 재export한다. */
export const REFERENCE_DIR_NAME = 'reference';

/**
 * 감시 대상에서 제외되는 역할(REQ-WS-046). 제외는 **역할 기준**이지 이름
 * 기준이 아니다 — `folders.manuscript: data`인 프로젝트에서 `data/`는 원고
 * 폴더이므로 제외되지 않는다.
 */
export const EXCLUDED_WATCH_ROLE: FolderRole = 'data';

export const DEFAULT_PROJECT_FOLDERS: Readonly<Record<FolderRole, string>> = Object.freeze({
  data: 'data',
  scripts: 'scripts',
  figures: 'figures',
  manuscript: 'manuscript',
  reference: REFERENCE_DIR_NAME,
});

/**
 * 프로젝트 루트 안에 머무는 상대 경로면 정규화해서 반환하고, 아니면 null.
 * 역슬래시는 구분자 모호성 때문에 거부한다 — 매니페스트는 POSIX 구분자로
 * 쓴다(거부되면 기본값으로 되돌아가므로 안전한 쪽으로 실패한다).
 */
export function normalizeProjectRelativePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (raw === '' || raw.includes('\\')) return null;
  // 절대 경로(POSIX / 드라이브 문자) 거부.
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) return null;

  const segments: string[] = [];
  for (const seg of raw.split('/')) {
    if (seg === '' || seg === '.') continue;
    // 루트 밖으로 나가는 경로는 항목 전체를 무효로 본다 (REQ-WS-010).
    if (seg === '..') return null;
    segments.push(seg);
  }
  if (segments.length === 0) return null;
  return segments.join('/');
}

/**
 * 매니페스트의 `folders` 값을 역할→상대 경로 맵으로 해석한다.
 * 유효하지 않거나 루트 밖을 가리키는 항목은 무시하고 기본값을 쓴다(REQ-WS-010).
 * 알 수 없는 키는 결과에 나타나지 않는다.
 */
export function resolveProjectFolders(overrides: unknown): Record<FolderRole, string> {
  const resolved = { ...DEFAULT_PROJECT_FOLDERS } as Record<FolderRole, string>;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return resolved;

  const map = overrides as Record<string, unknown>;
  for (const role of FOLDER_ROLES) {
    if (!Object.prototype.hasOwnProperty.call(map, role)) continue;
    const normalized = normalizeProjectRelativePath(map[role]);
    if (normalized !== null) resolved[role] = normalized;
  }
  return resolved;
}
