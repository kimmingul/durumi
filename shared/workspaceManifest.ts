import yaml from 'js-yaml';
import {
  normalizeProjectRelativePath,
  resolveProjectFolders,
  type FolderRole,
} from './projectFolders';
import { spliceTopLevelKey } from './yamlKeyRange';

/**
 * Durumi 프로젝트 매니페스트 — 타입·파싱·검증·최소 쓰기. 순수 함수다.
 *
 * 이 모듈이 하지 않는 것: 파일 읽기/쓰기, walk-up 탐색, 감시. 그 셋은 main
 * 계층(`electron/`)의 몫이고 이 모듈은 그들이 쓸 스키마와 판정만 제공한다.
 *
 * 메타데이터 키(`authors` / `acknowledgements` / `registration`)는 여기서
 * **원문 그대로** 실어 나른다. 정본은 원고 front matter이고(REQ-WS-034)
 * 계층 병합과 형식 검증은 `shared/manuscriptMetadata.ts`가 담당한다.
 */

/** 프로젝트 루트당 정확히 하나만 유효한 매니페스트 파일명 (REQ-WS-001). */
export const MANIFEST_FILENAME = 'durumi.project.yaml';

/** 앱이 정의하는 최상위 키 (REQ-WS-002). 이 밖의 키도 읽기는 성공한다. */
export const MANIFEST_TOP_LEVEL_KEYS = [
  'name',
  'version',
  'folders',
  'authors',
  'acknowledgements',
  'registration',
  'bibliography',
] as const;

export type ManifestTopLevelKey = (typeof MANIFEST_TOP_LEVEL_KEYS)[number];

/**
 * 서지 참조. 매니페스트는 `.bib` **경로를 가리키기만** 한다 — 인라인 서지
 * 엔트리는 스키마 위반이다(REQ-WS-039).
 */
export type BibliographyRef =
  | { kind: 'absent' }
  | { kind: 'path'; relPath: string }
  | { kind: 'invalid'; message: string };

export interface ManifestWarning {
  key: string;
  message: string;
}

export interface WorkspaceManifest {
  name: string;
  /** 스키마 버전. 숫자로 써도 문자열로 정규화한다. */
  version: string | null;
  /** 역할→루트 상대 경로. 재정의가 해석된 결과다 (REQ-WS-010). */
  folders: Record<FolderRole, string>;
  /** 프로젝트 기본값 — 원문 그대로. 정본은 front matter다 (REQ-WS-035). */
  authors: unknown;
  acknowledgements: unknown;
  registration: unknown;
  bibliography: BibliographyRef;
  /** 앱이 모르는 키를 포함한 원문 매핑. 갱신 시 보존 대상이다. */
  raw: Record<string, unknown>;
}

export type ManifestParseResult =
  | { kind: 'valid'; manifest: WorkspaceManifest; warnings: ManifestWarning[] }
  | { kind: 'corrupt'; reason: 'yaml' | 'not-mapping' | 'missing-name'; message: string };

/** 서지 엔트리처럼 보이는가 — 경로가 아니라 항목을 담은 값. */
function looksLikeBibEntry(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((v) => looksLikeBibEntry(v));
  return typeof value === 'object' && value !== null;
}

function readBibliography(value: unknown): { ref: BibliographyRef; warning: ManifestWarning | null } {
  if (value === undefined || value === null) return { ref: { kind: 'absent' }, warning: null };

  if (looksLikeBibEntry(value)) {
    const message =
      'bibliography는 .bib 파일 경로 문자열이어야 한다 — 인라인 서지 항목은 채택하지 않는다';
    return { ref: { kind: 'invalid', message }, warning: { key: 'bibliography', message } };
  }
  const relPath = normalizeProjectRelativePath(value);
  if (relPath === null) {
    const message = 'bibliography 경로가 프로젝트 루트 안의 상대 경로가 아니다';
    return { ref: { kind: 'invalid', message }, warning: { key: 'bibliography', message } };
  }
  return { ref: { kind: 'path', relPath }, warning: null };
}

/**
 * 매니페스트 원문을 파싱한다.
 *
 * 손상(`corrupt`) 판정은 세 가지 — YAML 파싱 실패, 매핑이 아님, 필수 키
 * `name` 결여. 셋 다 "프로젝트 없음"으로 조용히 강등하지 않는다(REQ-WS-008).
 * 그 밖의 스키마 위반(예: 인라인 서지)은 손상이 아니라 경고이며, 문서 편집은
 * 계속 가능해야 한다.
 */
export function parseWorkspaceManifest(source: string): ManifestParseResult {
  let loaded: unknown;
  try {
    loaded = yaml.load(source, { schema: yaml.JSON_SCHEMA });
  } catch (err) {
    return { kind: 'corrupt', reason: 'yaml', message: err instanceof Error ? err.message : String(err) };
  }
  if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) {
    return { kind: 'corrupt', reason: 'not-mapping', message: '매니페스트는 YAML 매핑이어야 한다' };
  }

  const raw = loaded as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (name === '') {
    return { kind: 'corrupt', reason: 'missing-name', message: '매니페스트에 필수 키 name이 없다' };
  }

  const warnings: ManifestWarning[] = [];
  const bib = readBibliography(raw.bibliography);
  if (bib.warning) warnings.push(bib.warning);

  const version =
    typeof raw.version === 'string'
      ? raw.version
      : typeof raw.version === 'number'
        ? String(raw.version)
        : null;

  return {
    kind: 'valid',
    warnings,
    manifest: {
      name,
      version,
      folders: resolveProjectFolders(raw.folders),
      authors: raw.authors,
      acknowledgements: raw.acknowledgements,
      registration: raw.registration,
      bibliography: bib.ref,
      raw,
    },
  };
}

/**
 * 채택 가능한 서지 경로. 없거나 스키마 위반이면 null — 호출자는 기존 walk-up
 * 탐색으로 폴백한다(REQ-WS-040, AC-WS-043 / AC-WS-055).
 */
export function manifestBibliographyPath(manifest: WorkspaceManifest | null): string | null {
  if (!manifest) return null;
  return manifest.bibliography.kind === 'path' ? manifest.bibliography.relPath : null;
}

/**
 * 최상위 키 하나만 교체한 매니페스트 원문을 반환한다(REQ-WS-003).
 *
 * 값 직렬화에만 js-yaml을 쓰고 **파일 전체를 재직렬화하지 않는다** — 그래서
 * 주석·키 순서·들여쓰기·앱이 모르는 키가 그대로 남는다. 대상 키 범위 밖
 * 바이트는 한 글자도 바뀌지 않는다.
 */
export function setManifestKey(source: string, key: string, value: unknown): string {
  const rendered = yaml.dump({ [key]: value }, { lineWidth: -1, noRefs: true }).replace(/\n+$/, '');
  return spliceTopLevelKey(source, key, rendered);
}
