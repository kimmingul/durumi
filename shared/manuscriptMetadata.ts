import yaml from 'js-yaml';
import { parseFrontMatterFenced, type FrontMatterResult } from './frontMatter';
import { spliceTopLevelKey } from './yamlKeyRange';
import type { WorkspaceManifest } from './workspaceManifest';

/**
 * 원고 메타데이터 — 저자·감사의 글·등록번호의 유효값 계산. 순수 함수다.
 *
 * **정본은 원고 front matter다**(REQ-WS-034). 한 연구가 본문·보충자료·리뷰어
 * 응답서 등 여러 원고를 갖고 저자 목록이 서로 다른 것이 의학연구 실무에서
 * 흔하기 때문이다. 매니페스트는 원고가 그 키를 선언하지 **않았을 때만** 쓰이는
 * 프로젝트 기본값이며, 두 값이 다른 것은 충돌이 아니라 정상적인 문서 수준
 * 선언이므로 경고하지 않는다(REQ-WS-042).
 *
 * front matter 파싱은 `./frontMatter`가 유일한 진입점이다 — 두 번째 파서를
 * 두지 않는다(REQ-WS-044).
 */

/**
 * 인식하는 front matter 메타데이터 키. **이미 출하 중인 템플릿 키를 그대로**
 * 쓰며 병렬 명칭(`authors` / `registry`)을 도입하지 않는다(REQ-WS-050).
 * `author`는 단수 명칭을 유지한 채 값 타입으로 복수를 표현한다(REQ-WS-051).
 */
export const RECOGNIZED_FRONT_MATTER_KEYS = ['author', 'registration', 'acknowledgements'] as const;

export type RecognizedFrontMatterKey = (typeof RECOGNIZED_FRONT_MATTER_KEYS)[number];

export type MetadataSource = 'front-matter' | 'manifest' | 'none';

export type RegistrationRegistry = 'clinicaltrials' | 'prospero' | 'other';

export interface RegistrationValidation {
  /** 원본 문자열. 어떤 판정에서도 보존된다(REQ-WS-038). */
  raw: string;
  registry: RegistrationRegistry;
  /** 레지스트리 접두를 뗀 식별자 부분. */
  identifier: string;
  /**
   * - `valid` — ClinicalTrials.gov NCT 형식을 만족
   * - `unfilled` — 출하 템플릿의 미기입 placeholder (경고 없음, REQ-WS-053)
   * - `unvalidated` — 형식을 정의하지 않은 레지스트리 (경고 없음, REQ-WS-052)
   * - `invalid` — ClinicalTrials.gov 값이 NCT 형식을 어김 (경고, REQ-WS-038)
   */
  status: 'valid' | 'unfilled' | 'unvalidated' | 'invalid';
}

export interface MetadataWarning {
  key: RecognizedFrontMatterKey;
  code: 'registration-format';
  message: string;
  /** 경고를 유발한 값이 어느 계층에서 채택되었는가. */
  source: MetadataSource;
}

export interface EffectiveMetadata {
  authors: { value: string[]; source: MetadataSource };
  acknowledgements: { value: string | null; source: MetadataSource };
  registration: { value: string | null; source: MetadataSource; validation: RegistrationValidation | null };
  warnings: MetadataWarning[];
}

/**
 * `author` 값을 저자 목록으로 정규화한다(REQ-WS-051).
 * 문자열이면 1명, 시퀀스면 순서를 보존한 복수, 빈 문자열이면 미기입(0명)이다 —
 * 템플릿(`manuscriptTemplates.ts:22`)이 `author: `를 빈 값으로 출하하므로
 * 빈 값은 오류가 아니다.
 */
export function normalizeAuthors(value: unknown): string[] {
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? [] : [t];
  }
  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter((v) => v !== '');
  }
  return [];
}

const CLINICALTRIALS_PREFIX = /^ClinicalTrials\.gov\b/i;
const PROSPERO_PREFIX = /^PROSPERO\b/i;
const NCT_FORMAT = /^NCT\d{8}$/;

/**
 * 등록번호를 검증한다. **레지스트리 다형성**을 갖는다(REQ-WS-052): 값의
 * 레지스트리 접두를 식별하고 ClinicalTrials.gov 값에만 NCT 형식 검증을
 * 적용한다. 그 밖의 레지스트리 값은 형식 판정 없이 원본 그대로 통과한다 —
 * 정의하지 않은 형식을 근거로 유효 입력을 거부하지 않기 위함이다.
 *
 * 출하 템플릿의 미기입 placeholder(`ClinicalTrials.gov NCT`, `PROSPERO CRD`)는
 * 경고 대상이 아니다(REQ-WS-053) — 새 원고를 만들 때마다 경고가 뜨는 동작은
 * 결함이다.
 */
export function validateRegistration(raw: string): RegistrationValidation {
  const value = raw.trim();

  let registry: RegistrationRegistry;
  let identifier: string;
  if (CLINICALTRIALS_PREFIX.test(value)) {
    registry = 'clinicaltrials';
    identifier = value.replace(CLINICALTRIALS_PREFIX, '').trim();
  } else if (PROSPERO_PREFIX.test(value)) {
    registry = 'prospero';
    identifier = value.replace(PROSPERO_PREFIX, '').trim();
  } else if (/^NCT/i.test(value)) {
    // 레지스트리 이름 없이 NCT 식별자만 쓴 값도 ClinicalTrials.gov로 본다.
    registry = 'clinicaltrials';
    identifier = value;
  } else {
    registry = 'other';
    identifier = value;
  }

  const base = { raw, registry, identifier };

  // 식별자 자리가 비었거나 접두어만 남은 placeholder → 미기입.
  if (identifier === '') return { ...base, status: 'unfilled' };
  if (registry === 'clinicaltrials' && /^NCT$/i.test(identifier)) {
    return { ...base, status: 'unfilled' };
  }
  if (registry === 'prospero' && /^CRD$/i.test(identifier)) {
    return { ...base, status: 'unfilled' };
  }

  if (registry !== 'clinicaltrials') return { ...base, status: 'unvalidated' };
  return { ...base, status: NCT_FORMAT.test(identifier) ? 'valid' : 'invalid' };
}

function declares(data: Record<string, unknown> | null | undefined, key: string): boolean {
  return !!data && Object.prototype.hasOwnProperty.call(data, key);
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t === '' ? null : value;
}

export interface ResolveMetadataInput {
  /** `parseFrontMatter()`의 결과. 없으면 front matter 계층이 비어 있다. */
  frontMatter?: FrontMatterResult | null;
  /** 소유 프로젝트의 매니페스트. 프로젝트 없음 상태에서는 null이다. */
  manifest?: WorkspaceManifest | null;
}

/**
 * 3계층(front matter 정본 → 매니페스트 기본값)을 해석해 유효 메타데이터를
 * 계산한다.
 *
 * 형식 검증은 **채택된 유효값에만** 적용한다(REQ-WS-038). 그렇지 않으면 유효한
 * NCT를 선언한 원고가 쓰이지도 않는 매니페스트의 낡은 placeholder 때문에
 * 경고를 받는다 — REQ-WS-053이 막으려는 것과 같은 결함 계열이다.
 *
 * 프로젝트 없음 상태에서도 완전히 동작한다(REQ-WS-041). 비는 것은 기본값 계층
 * 하나뿐이다.
 */
export function resolveManuscriptMetadata(input: ResolveMetadataInput): EffectiveMetadata {
  const fmData = input.frontMatter?.data ?? null;
  const manifest = input.manifest ?? null;
  const warnings: MetadataWarning[] = [];

  // --- author (front matter 단수 키) / authors (매니페스트 기본값) ---
  let authors: EffectiveMetadata['authors'];
  if (declares(fmData, 'author')) {
    authors = { value: normalizeAuthors(fmData!.author), source: 'front-matter' };
  } else if (manifest && manifest.authors !== undefined) {
    authors = { value: normalizeAuthors(manifest.authors), source: 'manifest' };
  } else {
    authors = { value: [], source: 'none' };
  }

  // --- acknowledgements ---
  let acknowledgements: EffectiveMetadata['acknowledgements'];
  if (declares(fmData, 'acknowledgements')) {
    acknowledgements = { value: asText(fmData!.acknowledgements), source: 'front-matter' };
  } else if (manifest && manifest.acknowledgements !== undefined) {
    acknowledgements = { value: asText(manifest.acknowledgements), source: 'manifest' };
  } else {
    acknowledgements = { value: null, source: 'none' };
  }

  // --- registration ---
  let registrationRaw: string | null = null;
  let registrationSource: MetadataSource = 'none';
  if (declares(fmData, 'registration')) {
    registrationRaw = asText(fmData!.registration);
    registrationSource = 'front-matter';
  } else if (manifest && manifest.registration !== undefined) {
    registrationRaw = asText(manifest.registration);
    registrationSource = 'manifest';
  }

  const validation = registrationRaw === null ? null : validateRegistration(registrationRaw);
  if (validation?.status === 'invalid') {
    warnings.push({
      key: 'registration',
      code: 'registration-format',
      message: `등록번호 형식이 ClinicalTrials.gov NCT 규칙(NCT + 숫자 8자리)과 다르다: ${validation.raw}`,
      source: registrationSource,
    });
  }

  return {
    authors,
    acknowledgements,
    registration: { value: registrationRaw, source: registrationSource, validation },
    warnings,
  };
}

/**
 * 원고 front matter의 키 하나만 갱신한다(REQ-WS-043).
 *
 * front matter 영역 밖 바이트는 한 글자도 바뀌지 않는다 — 여는·닫는 구분자와
 * 본문은 원문 슬라이스를 그대로 이어 붙인다. front matter가 없으면 본문 앞에
 * 새로 만든다.
 */
export function updateFrontMatterKey(source: string, key: string, value: unknown): string {
  const rendered = yaml.dump({ [key]: value }, { lineWidth: -1, noRefs: true }).replace(/\n+$/, '');

  const fenced = parseFrontMatterFenced(source);
  if (fenced.yamlText === null) {
    return `---\n${rendered}\n---\n${source}`;
  }

  // 펜스 경계는 재계산하지 않고 파서가 준 오프셋을 그대로 쓴다(REQ-WS-044).
  const { yamlStart } = fenced;
  const yamlEnd = yamlStart + fenced.yamlText.length;
  const nextYaml = spliceTopLevelKey(fenced.yamlText, key, rendered);
  return source.slice(0, yamlStart) + nextYaml + source.slice(yamlEnd);
}
