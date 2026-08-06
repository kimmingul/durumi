import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontMatter } from '@shared/frontMatter';
import { MANUSCRIPT_TEMPLATES } from '@shared/manuscriptTemplates';
import { parseWorkspaceManifest, type WorkspaceManifest } from '@shared/workspaceManifest';
import {
  RECOGNIZED_FRONT_MATTER_KEYS,
  normalizeAuthors,
  validateRegistration,
  resolveManuscriptMetadata,
  updateFrontMatterKey,
  isEmptyMetadataValue,
} from '@shared/manuscriptMetadata';

function fm(yamlBody: string, body = '# 본문\n\n한 문단.\n'): string {
  return `---\n${yamlBody}\n---\n${body}`;
}

function manifestOf(yamlBody: string): WorkspaceManifest {
  const r = parseWorkspaceManifest(`name: study\n${yamlBody}\n`);
  if (r.kind !== 'valid') throw new Error(`expected valid manifest: ${r.message}`);
  return r.manifest;
}

function resolve(source: string | null, manifest: WorkspaceManifest | null = null) {
  return resolveManuscriptMetadata({
    frontMatter: source === null ? null : parseFrontMatter(source),
    manifest,
  });
}

describe('front matter 키 스키마 — REQ-WS-050 / AC-WS-061', () => {
  it('인식 키 화이트리스트가 정확히 세 개다', () => {
    expect([...RECOGNIZED_FRONT_MATTER_KEYS]).toEqual([
      'author',
      'registration',
      'acknowledgements',
    ]);
  });

  it('화이트리스트에 authors나 registry가 없다', () => {
    expect(RECOGNIZED_FRONT_MATTER_KEYS).not.toContain('authors');
    expect(RECOGNIZED_FRONT_MATTER_KEYS).not.toContain('registry');
  });

  it('출하 템플릿의 author / registration 키를 인식한다', () => {
    for (const t of MANUSCRIPT_TEMPLATES) {
      const parsed = parseFrontMatter(t.content);
      expect(parsed.error).toBeNull();
      expect(Object.prototype.hasOwnProperty.call(parsed.data ?? {}, 'author')).toBe(true);
    }
    const consort = MANUSCRIPT_TEMPLATES.find((t) => t.id === 'consort')!;
    const prisma = MANUSCRIPT_TEMPLATES.find((t) => t.id === 'prisma')!;
    for (const t of [consort, prisma]) {
      const parsed = parseFrontMatter(t.content);
      expect(Object.prototype.hasOwnProperty.call(parsed.data ?? {}, 'registration')).toBe(true);
    }
  });
});

describe('미기입 판정 — REQ-WS-054 / AC-WS-068', () => {
  it('여섯 가지 미기입 형태를 모두 판정한다', () => {
    for (const v of [undefined, null, '', '   ', [], ['', '  ']]) {
      expect(isEmptyMetadataValue(v)).toBe(true);
    }
  });

  it('원소 하나라도 비어 있지 않으면 미기입이 아니다', () => {
    for (const v of ['Kim', ['Kim'], ['', 'Kim']]) {
      expect(isEmptyMetadataValue(v)).toBe(false);
    }
  });

  it('출하 템플릿의 `author: `는 빈 문자열이 아니라 null로 파싱되며 미기입이다', () => {
    // REQ-WS-054의 파싱 근거를 실측으로 고정한다. 이 단언이 깨지면 미기입
    // 판정을 `=== ''`로 구현해도 통과해 버리는 상태로 되돌아간다.
    for (const src of ['author: ', 'author:', 'author:   ']) {
      const data = parseFrontMatter(fm(src)).data!;
      expect(data.author).toBeNull();
      expect(isEmptyMetadataValue(data.author)).toBe(true);
    }
    expect(parseFrontMatter(fm('author: ""')).data!.author).toBe('');
    expect(parseFrontMatter(fm('author: []')).data!.author).toEqual([]);
  });
});

describe('author 값 형태 — REQ-WS-051 / AC-WS-062 `[N]`', () => {
  it('문자열이면 저자 1명', () => {
    expect(normalizeAuthors('Kim')).toEqual(['Kim']);
  });

  it('시퀀스면 순서를 보존한 복수 저자', () => {
    expect(normalizeAuthors(['Kim', 'Lee'])).toEqual(['Kim', 'Lee']);
  });

  it('빈 문자열은 미기입(0명)이며 오류가 아니다', () => {
    expect(normalizeAuthors('')).toEqual([]);
    expect(normalizeAuthors('   ')).toEqual([]);
  });

  it('단수 문자열 원고를 거부하지 않는다', () => {
    const m = resolve(fm('author: Kim'));
    expect(m.authors.value).toEqual(['Kim']);
    expect(m.warnings).toEqual([]);
  });

  it('프로젝트 없음 상태에서 세 가지 형태를 모두 처리한다', () => {
    // AC-WS-062는 `[N]` 한정이다 — 프로젝트가 있으면 (c)는 매니페스트 기본값을
    // 끌어오므로 저자 0명이 아니다(AC-WS-038c). 두 AC는 서로 다른 계층이다.
    expect(resolve(fm('author: Kim'), null).authors.value).toEqual(['Kim']);
    expect(resolve(fm('author: [Kim, Lee]'), null).authors.value).toEqual(['Kim', 'Lee']);
    expect(resolve(fm('author: '), null).authors.value).toEqual([]);
  });

  it('프로젝트 없음 상태에서 템플릿 출하 원문은 저자 0명이고 경고가 없다', () => {
    const imrad = MANUSCRIPT_TEMPLATES.find((t) => t.id === 'imrad')!;
    const m = resolve(imrad.content, null);
    expect(m.authors.value).toEqual([]);
    expect(m.warnings).toEqual([]);
  });
});

describe('억제는 값 기반이다 — REQ-WS-042 / REQ-WS-054', () => {
  const MANIFEST_3 = () => manifestOf('authors:\n  - A\n  - B\n  - C');

  it('키가 있어도 값이 미기입이면 매니페스트 기본값이 채택된다 (AC-WS-038c)', () => {
    const forms = ['author: ', 'author:', 'author: ""', 'author: "   "', 'author: []'];
    for (const form of forms) {
      const m = resolve(fm(form), MANIFEST_3());
      expect(m.authors.value, `form=${JSON.stringify(form)}`).toEqual(['A', 'B', 'C']);
      expect(m.authors.source, `form=${JSON.stringify(form)}`).toBe('manifest');
    }
  });

  it('출하 템플릿에서 만든 원고가 프로젝트 저자를 상속한다 (AC-WS-069)', () => {
    // 특정 템플릿 하나가 아니라 배열 전체를 순회한다 — 향후 템플릿 추가도 자동 커버.
    expect(MANUSCRIPT_TEMPLATES.length).toBeGreaterThan(0);
    for (const t of MANUSCRIPT_TEMPLATES) {
      const m = resolve(t.content, MANIFEST_3());
      expect(m.authors.value, `template=${t.id}`).toEqual(['A', 'B', 'C']);
      expect(m.authors.source, `template=${t.id}`).toBe('manifest');
    }
  });

  it('미기입이 아닌 값은 매니페스트를 억제한다 (AC-WS-038)', () => {
    const m = resolve(fm('author:\n  - Kim\n  - Lee'), MANIFEST_3());
    expect(m.authors.value).toEqual(['Kim', 'Lee']);
    expect(m.authors.source).toBe('front-matter');
  });

  it('미기입 감사의 글은 매니페스트 기본값을 채택한다 (AC-WS-039b)', () => {
    const manifest = manifestOf('acknowledgements: From manifest');
    const m = resolve(fm('acknowledgements:'), manifest);
    expect(m.acknowledgements.value).toBe('From manifest');
    expect(m.acknowledgements.source).toBe('manifest');
  });

  it('출하 placeholder는 매니페스트 등록번호를 억제하지 않는다 (AC-WS-067c)', () => {
    const manifest = manifestOf('registration: ClinicalTrials.gov NCT01234567');
    for (const placeholder of ['ClinicalTrials.gov NCT', 'PROSPERO CRD']) {
      const m = resolve(fm(`registration: ${placeholder}`), manifest);
      expect(m.registration.value, placeholder).toBe('ClinicalTrials.gov NCT01234567');
      expect(m.registration.source, placeholder).toBe('manifest');
      expect(m.warnings, placeholder).toEqual([]);
    }
  });

  it('CONSORT / PRISMA 템플릿 원고가 프로젝트 등록번호를 상속한다 (AC-WS-067c)', () => {
    const manifest = manifestOf('registration: ClinicalTrials.gov NCT01234567');
    for (const id of ['consort', 'prisma']) {
      const t = MANUSCRIPT_TEMPLATES.find((x) => x.id === id)!;
      const m = resolve(t.content, manifest);
      expect(m.registration.value, id).toBe('ClinicalTrials.gov NCT01234567');
      expect(m.warnings, id).toEqual([]);
    }
  });

  it('미기입이 아닌 등록번호는 매니페스트를 억제한다', () => {
    const manifest = manifestOf('registration: ClinicalTrials.gov NCT01234567');
    const m = resolve(fm('registration: PROSPERO CRD42024123456'), manifest);
    expect(m.registration.value).toBe('PROSPERO CRD42024123456');
    expect(m.registration.source).toBe('front-matter');
  });
});

describe('registration 레지스트리 다형성 — REQ-WS-052 / REQ-WS-053', () => {
  it('유효한 NCT는 경고 없이 통과한다 (AC-WS-040)', () => {
    const v = validateRegistration('ClinicalTrials.gov NCT01234567');
    expect(v.registry).toBe('clinicaltrials');
    expect(v.status).toBe('valid');
  });

  it('형식을 어긴 NCT는 경고하되 원본을 보존한다 (AC-WS-041)', () => {
    const v = validateRegistration('ClinicalTrials.gov NCT123');
    expect(v.status).toBe('invalid');
    expect(v.raw).toBe('ClinicalTrials.gov NCT123');
  });

  it('PROSPERO 값에는 NCT 검증을 적용하지 않는다 (AC-WS-063)', () => {
    const v = validateRegistration('PROSPERO CRD42024123456');
    expect(v.registry).toBe('prospero');
    expect(v.status).toBe('unvalidated');
  });

  it('정의되지 않은 레지스트리 값은 형식 판정 없이 통과한다', () => {
    const v = validateRegistration('UMIN000012345');
    expect(v.status).toBe('unvalidated');
  });

  it('레지스트리 이름 없이 NCT만 쓴 값도 ClinicalTrials.gov로 본다', () => {
    expect(validateRegistration('NCT01234567')).toMatchObject({
      registry: 'clinicaltrials',
      status: 'valid',
    });
    expect(validateRegistration('NCT99')).toMatchObject({
      registry: 'clinicaltrials',
      status: 'invalid',
    });
    expect(validateRegistration('NCT')).toMatchObject({ status: 'unfilled' });
  });

  it('빈 등록번호는 미기입이다', () => {
    expect(validateRegistration('   ').status).toBe('unfilled');
  });

  it('출하 placeholder 두 개는 미기입이며 경고하지 않는다 (AC-WS-064)', () => {
    for (const raw of ['ClinicalTrials.gov NCT', 'PROSPERO CRD']) {
      const v = validateRegistration(raw);
      expect(v.status).toBe('unfilled');
    }
  });

  it('CONSORT / PRISMA 템플릿 원문이 경고를 유발하지 않는다 (AC-WS-064)', () => {
    for (const id of ['consort', 'prisma']) {
      const t = MANUSCRIPT_TEMPLATES.find((x) => x.id === id)!;
      const m = resolve(t.content);
      expect(m.registration.validation?.status).toBe('unfilled');
      expect(m.warnings).toEqual([]);
    }
  });
});

describe('메타데이터 3계층 — REQ-WS-034 ~ 037, 042', () => {
  it('키별로 정본·기본값이 갈린다 (AC-WS-054)', () => {
    const manifest = manifestOf('authors:\n  - Manifest Author\nacknowledgements: From manifest');
    // front matter의 acknowledgements는 키가 있으되 미기입이다.
    const m = resolve(fm('author: FM Author\nacknowledgements:'), manifest);
    expect(m.authors.value).toEqual(['FM Author']);
    expect(m.authors.source).toBe('front-matter');
    expect(m.acknowledgements.value).toBe('From manifest');
    expect(m.acknowledgements.source).toBe('manifest');
  });

  it('저자 정본은 front matter다 (AC-WS-038)', () => {
    const m = resolve(fm('author:\n  - Kim\n  - Lee'));
    expect(m.authors.value).toEqual(['Kim', 'Lee']);
    expect(m.authors.source).toBe('front-matter');
  });

  it('매니페스트 저자는 front matter가 키를 선언하지 않았을 때만 쓰인다 (AC-WS-038b)', () => {
    const manifest = manifestOf('authors:\n  - A\n  - B\n  - C');
    const m = resolve(fm('title: x'), manifest);
    expect(m.authors.value).toEqual(['A', 'B', 'C']);
    expect(m.authors.source).toBe('manifest');
  });

  it('감사의 글도 front matter가 이긴다 (AC-WS-039)', () => {
    const manifest = manifestOf('acknowledgements: manifest side');
    const m = resolve(fm('acknowledgements: fm side'), manifest);
    expect(m.acknowledgements.value).toBe('fm side');
    expect(m.acknowledgements.source).toBe('front-matter');
  });

  it('front matter 선언은 매니페스트를 무음으로 대체한다 (AC-WS-045)', () => {
    const manifest = manifestOf('authors:\n  - Manifest');
    const m = resolve(fm('author: Document'), manifest);
    expect(m.authors.value).toEqual(['Document']);
    expect(m.warnings).toEqual([]);
    // 두 소스 중 어느 것도 수정되지 않는다 — 순수 함수이므로 입력 불변.
    expect(manifest.authors).toEqual(['Manifest']);
  });

  it('어느 계층에도 없으면 source가 none이다', () => {
    const m = resolve(fm('title: x'));
    expect(m.authors).toEqual({ value: [], source: 'none' });
    expect(m.acknowledgements).toEqual({ value: null, source: 'none' });
    expect(m.registration.source).toBe('none');
  });
});

describe('형식 검증은 채택된 값에만 — REQ-WS-038 / AC-WS-067', () => {
  it('채택되지 않은 매니페스트 값은 검증되지 않는다 (AC-WS-067)', () => {
    const manifest = manifestOf('registration: ClinicalTrials.gov NCT');
    const m = resolve(fm('registration: ClinicalTrials.gov NCT01234567'), manifest);
    expect(m.registration.value).toBe('ClinicalTrials.gov NCT01234567');
    expect(m.registration.source).toBe('front-matter');
    expect(m.warnings).toEqual([]);
  });

  it('낡은 매니페스트 placeholder가 유효한 원고를 오염시키지 않는다 (AC-WS-067)', () => {
    const manifest = manifestOf('registration: ClinicalTrials.gov NCT99');
    const m = resolve(fm('registration: ClinicalTrials.gov NCT01234567'), manifest);
    expect(m.warnings).toEqual([]);
  });

  it('기본값으로 채택된 매니페스트 값은 검증된다 (AC-WS-067b)', () => {
    const manifest = manifestOf('registration: ClinicalTrials.gov NCT99');
    const m = resolve(fm('title: x'), manifest);
    expect(m.registration.source).toBe('manifest');
    expect(m.registration.value).toBe('ClinicalTrials.gov NCT99');
    expect(m.warnings).toHaveLength(1);
    expect(m.warnings[0]!.key).toBe('registration');
    expect(m.warnings[0]!.source).toBe('manifest');
  });

  it('형식 위반 값은 보존된 채 경고된다 (AC-WS-041)', () => {
    const m = resolve(fm('registration: ClinicalTrials.gov NCT123'));
    expect(m.registration.value).toBe('ClinicalTrials.gov NCT123');
    expect(m.warnings).toHaveLength(1);
  });
});

describe('프로젝트 없음 상태 — REQ-WS-041 / C-1', () => {
  it('front matter만으로 세 값이 모두 반환된다 (AC-WS-044)', () => {
    const m = resolve(
      fm('author: Kim\nacknowledgements: Thanks\nregistration: ClinicalTrials.gov NCT01234567'),
      null,
    );
    expect(m.authors.value).toEqual(['Kim']);
    expect(m.acknowledgements.value).toBe('Thanks');
    expect(m.registration.value).toBe('ClinicalTrials.gov NCT01234567');
    for (const f of [m.authors, m.acknowledgements, m.registration]) {
      expect(f.source).toBe('front-matter');
    }
  });

  it('매니페스트 부재가 형식 검증을 비활성화하지 않는다 (AC-WS-065)', () => {
    const m = resolve(fm('registration: ClinicalTrials.gov NCT99'), null);
    expect(m.warnings).toHaveLength(1);
    expect(m.registration.value).toBe('ClinicalTrials.gov NCT99');
  });

  it('front matter가 아예 없어도 붕괴하지 않는다', () => {
    const m = resolve('# 본문만 있는 문서\n');
    expect(m.authors.value).toEqual([]);
    expect(m.warnings).toEqual([]);
  });

  it('front matter 파싱이 실패해도 붕괴하지 않는다', () => {
    const m = resolve('---\nauthor: [unclosed\n---\n본문\n');
    expect(m.authors.source).toBe('none');
  });
});

describe('front matter 갱신 — REQ-WS-043 / AC-WS-046', () => {
  const SRC = fm('title: A study\nauthor: Kim\ndate: 2026-08-07', '# 본문\n\n본문 바이트  \t는 그대로.\n');

  it('front matter 영역 밖 본문의 바이트 diff가 0이다', () => {
    const out = updateFrontMatterKey(SRC, 'author', ['Kim', 'Lee']);
    const bodyOf = (s: string) => parseFrontMatter(s).body;
    expect(bodyOf(out)).toBe(bodyOf(SRC));
    expect(bodyOf(out)).toBe('# 본문\n\n본문 바이트  \t는 그대로.\n');
  });

  it('front matter 안의 다른 키와 순서를 보존한다', () => {
    const out = updateFrontMatterKey(SRC, 'author', ['Kim', 'Lee']);
    expect(out).toContain('title: A study');
    expect(out).toContain('date: 2026-08-07');
    expect(out.indexOf('title:')).toBeLessThan(out.indexOf('author:'));
    expect(out.indexOf('author:')).toBeLessThan(out.indexOf('date:'));
  });

  it('갱신 결과를 다시 읽으면 새 값이 유효값이 된다', () => {
    const out = updateFrontMatterKey(SRC, 'author', ['Kim', 'Lee']);
    expect(resolve(out).authors.value).toEqual(['Kim', 'Lee']);
  });

  it('front matter가 없으면 본문 앞에 새로 만든다', () => {
    const out = updateFrontMatterKey('# 본문\n', 'author', 'Kim');
    expect(parseFrontMatter(out).body).toBe('# 본문\n');
    expect(resolve(out).authors.value).toEqual(['Kim']);
  });
});

describe('두 번째 front matter 파서를 도입하지 않는다 — REQ-WS-044 / AC-WS-047', () => {
  it('shared/ 안에서 front matter 파싱 진입점은 기존 두 모듈뿐이다', () => {
    const dir = join(process.cwd(), 'shared');
    const offenders: string[] = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue;
      if (f === 'frontMatter.ts' || f === 'frontMatterFenced.ts') continue;
      const src = readFileSync(join(dir, f), 'utf8');
      // front matter 여는 펜스(`/^---`)를 스스로 찾거나 자체 parseFrontMatter를
      // 정의하면 두 번째 파서다. YAML 문서 마커(`/^(?:---|...)`)는 front matter
      // 지식이 아니라 YAML 스트림 일반의 문법이므로 여기 해당하지 않는다.
      if (src.includes('/^---') || /function\s+parseFrontMatter/.test(src)) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('메타데이터 모듈이 기존 파서를 import한다', () => {
    const src = readFileSync(join(process.cwd(), 'shared', 'manuscriptMetadata.ts'), 'utf8');
    expect(src).toMatch(/from '\.\/frontMatter'/);
  });
});
