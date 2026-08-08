import { describe, it, expect } from 'vitest';
import {
  MANIFEST_FILENAME,
  MANIFEST_TOP_LEVEL_KEYS,
  parseWorkspaceManifest,
  setManifestKey,
  manifestBibliographyPath,
} from '@shared/workspaceManifest';

const VALID = [
  'name: cohort-2026',
  'version: 1',
  'folders:',
  '  figures: output/fig',
  'authors:',
  '  - Kim',
  '  - Lee',
  'acknowledgements: Funded by NRF.',
  'registration: ClinicalTrials.gov NCT01234567',
  'bibliography: refs/custom.bib',
  '',
].join('\n');

describe('매니페스트 파일명 — REQ-WS-001', () => {
  it('durumi.project.yaml이다', () => {
    expect(MANIFEST_FILENAME).toBe('durumi.project.yaml');
  });
});

describe('매니페스트 최상위 키 — REQ-WS-002 / AC-WS-052', () => {
  it('정의된 7개 키를 노출한다', () => {
    expect([...MANIFEST_TOP_LEVEL_KEYS].sort()).toEqual(
      ['acknowledgements', 'authors', 'bibliography', 'folders', 'name', 'registration', 'version'].sort(),
    );
  });

  it('7개 키가 모두 파싱되고 미정의 키가 실패·경고를 유발하지 않는다', () => {
    const src = VALID + 'future_key: whatever\n';
    const r = parseWorkspaceManifest(src);
    expect(r.kind).toBe('valid');
    if (r.kind !== 'valid') return;
    expect(r.warnings).toEqual([]);
    expect(r.manifest.name).toBe('cohort-2026');
    expect(r.manifest.version).toBe('1');
    expect(r.manifest.folders.figures).toBe('output/fig');
    expect(r.manifest.authors).toEqual(['Kim', 'Lee']);
    expect(r.manifest.acknowledgements).toBe('Funded by NRF.');
    expect(r.manifest.registration).toBe('ClinicalTrials.gov NCT01234567');
    expect(r.manifest.bibliography).toEqual({ kind: 'path', relPath: 'refs/custom.bib' });
  });

  it('미정의 키를 원문 매핑에 보존한다', () => {
    const r = parseWorkspaceManifest(VALID + 'future_key: whatever\n');
    if (r.kind !== 'valid') throw new Error('expected valid');
    expect(r.manifest.raw.future_key).toBe('whatever');
  });
});

describe('손상 판정 — REQ-WS-007 / REQ-WS-008 전제', () => {
  it('유효하지 않은 YAML은 손상이다', () => {
    const r = parseWorkspaceManifest('name: [unclosed\n');
    expect(r.kind).toBe('corrupt');
    if (r.kind !== 'corrupt') return;
    expect(r.reason).toBe('yaml');
    expect(r.message.length).toBeGreaterThan(0);
  });

  it('매핑이 아니면 손상이다', () => {
    expect(parseWorkspaceManifest('- a\n- b\n').kind).toBe('corrupt');
    expect(parseWorkspaceManifest('just a string\n').kind).toBe('corrupt');
  });

  it('name 키 결여는 손상이며 프로젝트 없음으로 강등하지 않는다', () => {
    const r = parseWorkspaceManifest('version: 1\n');
    expect(r.kind).toBe('corrupt');
    if (r.kind !== 'corrupt') return;
    expect(r.reason).toBe('missing-name');
  });

  it('name이 빈 문자열이어도 손상이다', () => {
    const r = parseWorkspaceManifest('name: "   "\n');
    expect(r.kind).toBe('corrupt');
  });

  it('version은 문자열로도 숫자로도 쓸 수 있고 문자열로 정규화된다', () => {
    const s = parseWorkspaceManifest('name: x\nversion: "2.0"\n');
    if (s.kind !== 'valid') throw new Error('expected valid');
    expect(s.manifest.version).toBe('2.0');

    const n = parseWorkspaceManifest('name: x\nversion: 2\n');
    if (n.kind !== 'valid') throw new Error('expected valid');
    expect(n.manifest.version).toBe('2');

    const none = parseWorkspaceManifest('name: x\n');
    if (none.kind !== 'valid') throw new Error('expected valid');
    expect(none.manifest.version).toBeNull();
  });

  it('선택 키가 전부 없어도 유효하다', () => {
    const r = parseWorkspaceManifest('name: minimal\n');
    expect(r.kind).toBe('valid');
    if (r.kind !== 'valid') return;
    expect(r.manifest.folders.data).toBe('data');
    expect(r.manifest.bibliography).toEqual({ kind: 'absent' });
  });
});

describe('bibliography — REQ-WS-039 / REQ-WS-040', () => {
  it('매니페스트 경로가 walk-up보다 우선한다 (AC-WS-042)', () => {
    const r = parseWorkspaceManifest('name: x\nbibliography: refs/custom.bib\n');
    if (r.kind !== 'valid') throw new Error('expected valid');
    expect(manifestBibliographyPath(r.manifest)).toBe('refs/custom.bib');
  });

  it('키가 없으면 null을 반환해 기존 walk-up에 위임한다 (AC-WS-043)', () => {
    const r = parseWorkspaceManifest('name: x\n');
    if (r.kind !== 'valid') throw new Error('expected valid');
    expect(manifestBibliographyPath(r.manifest)).toBeNull();
    expect(manifestBibliographyPath(null)).toBeNull();
  });

  it('인라인 서지 엔트리 매핑은 스키마 위반으로 보고하고 채택하지 않는다 (AC-WS-055)', () => {
    const src = ['name: x', 'bibliography:', '  title: A paper', '  doi: 10.1/xyz', ''].join('\n');
    const r = parseWorkspaceManifest(src);
    expect(r.kind).toBe('valid');
    if (r.kind !== 'valid') return;
    expect(r.manifest.bibliography.kind).toBe('invalid');
    expect(r.warnings.map((w) => w.key)).toContain('bibliography');
    expect(manifestBibliographyPath(r.manifest)).toBeNull();
  });

  it('인라인 엔트리 시퀀스도 스키마 위반이다 (AC-WS-055)', () => {
    const src = ['name: x', 'bibliography:', '  - title: A paper', '    doi: 10.1/xyz', ''].join('\n');
    const r = parseWorkspaceManifest(src);
    if (r.kind !== 'valid') throw new Error('expected valid');
    expect(r.manifest.bibliography.kind).toBe('invalid');
    expect(manifestBibliographyPath(r.manifest)).toBeNull();
  });

  it('루트 밖 경로는 스키마 위반이다', () => {
    const r = parseWorkspaceManifest('name: x\nbibliography: ../outside.bib\n');
    if (r.kind !== 'valid') throw new Error('expected valid');
    expect(r.manifest.bibliography.kind).toBe('invalid');
  });
});

describe('setManifestKey — REQ-WS-003 / AC-WS-007', () => {
  // AC-WS-007: 주석 → name → 미정의 키 → authors 순서
  const SRC = [
    '# 2026 코호트 연구',
    'name: cohort-2026',
    'custom_field:',
    '  nested: value',
    'authors:',
    '  - Kim',
    '',
  ].join('\n');

  it('authors 줄 범위 밖 바이트의 diff가 0이다', () => {
    const out = setManifestKey(SRC, 'authors', ['Kim', 'Lee']);
    const head = '# 2026 코호트 연구\nname: cohort-2026\ncustom_field:\n  nested: value\n';
    expect(out.startsWith(head)).toBe(true);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.slice(head.length).trimEnd()).toBe('authors:\n  - Kim\n  - Lee');
  });

  it('주석·미정의 키·키 순서가 보존된다', () => {
    const out = setManifestKey(SRC, 'authors', ['Lee']);
    expect(out).toContain('# 2026 코호트 연구');
    expect(out).toContain('custom_field:\n  nested: value');
    expect(out.indexOf('name:')).toBeLessThan(out.indexOf('custom_field:'));
    expect(out.indexOf('custom_field:')).toBeLessThan(out.indexOf('authors:'));
  });

  it('갱신 결과를 다시 파싱하면 새 값이 읽힌다', () => {
    const out = setManifestKey(SRC, 'authors', ['Kim', 'Lee']);
    const r = parseWorkspaceManifest(out);
    if (r.kind !== 'valid') throw new Error('expected valid');
    expect(r.manifest.authors).toEqual(['Kim', 'Lee']);
    expect(r.manifest.raw.custom_field).toEqual({ nested: 'value' });
  });

  it('없는 키는 말미에 추가하고 나머지는 건드리지 않는다', () => {
    const out = setManifestKey(SRC, 'acknowledgements', 'Thanks.');
    expect(out.startsWith(SRC)).toBe(true);
    expect(out.trimEnd().endsWith('acknowledgements: Thanks.')).toBe(true);
  });
});
