import { describe, it, expect } from 'vitest';
import { findTopLevelKeyRange, spliceTopLevelKey } from '@shared/yamlKeyRange';

describe('findTopLevelKeyRange — REQ-WS-003 키 단위 범위 산출', () => {
  it('스칼라 키의 줄 범위를 반환한다', () => {
    const src = 'name: study\nversion: 1\n';
    const r = findTopLevelKeyRange(src, 'version');
    expect(r).not.toBeNull();
    expect(src.slice(r!.from, r!.to)).toBe('version: 1\n');
  });

  it('여러 줄 시퀀스 키의 블록 전체를 반환한다', () => {
    const src = 'name: study\nauthors:\n  - Kim\n  - Lee\nregistration: x\n';
    const r = findTopLevelKeyRange(src, 'authors');
    expect(src.slice(r!.from, r!.to)).toBe('authors:\n  - Kim\n  - Lee\n');
  });

  it('마지막 키는 개행이 없어도 끝까지 잡는다', () => {
    const src = 'name: study\nauthors:\n  - Kim';
    const r = findTopLevelKeyRange(src, 'authors');
    expect(src.slice(r!.from, r!.to)).toBe('authors:\n  - Kim');
  });

  it('없는 키는 null을 반환한다', () => {
    expect(findTopLevelKeyRange('name: study\n', 'authors')).toBeNull();
  });

  it('들여쓴 동명 키(중첩 매핑)를 최상위로 오인하지 않는다', () => {
    const src = 'folders:\n  authors: nope\nname: study\n';
    expect(findTopLevelKeyRange(src, 'authors')).toBeNull();
  });

  it('CRLF 줄바꿈에서도 범위가 정확하다', () => {
    const src = 'name: study\r\nauthors:\r\n  - Kim\r\nversion: 1\r\n';
    const r = findTopLevelKeyRange(src, 'authors');
    expect(src.slice(r!.from, r!.to)).toBe('authors:\r\n  - Kim\r\n');
  });

  it('블록 뒤의 빈 줄은 범위에 포함하지 않는다', () => {
    const src = 'authors:\n  - Kim\n\nname: study\n';
    const r = findTopLevelKeyRange(src, 'authors');
    expect(src.slice(r!.from, r!.to)).toBe('authors:\n  - Kim\n');
  });

  it('블록 뒤의 열-0 주석에서 멈춘다', () => {
    const src = 'authors:\n  - Kim\n# 사용자 주석\nname: study\n';
    const r = findTopLevelKeyRange(src, 'authors');
    expect(src.slice(r!.from, r!.to)).toBe('authors:\n  - Kim\n');
  });

  it('따옴표로 감싼 키도 찾는다', () => {
    const src = '"authors":\n  - Kim\nname: x\n';
    const r = findTopLevelKeyRange(src, 'authors');
    expect(src.slice(r!.from, r!.to)).toBe('"authors":\n  - Kim\n');
  });

  it('작은따옴표 키도 찾는다', () => {
    const src = "'authors':\n  - Kim\nname: x\n";
    const r = findTopLevelKeyRange(src, 'authors');
    expect(src.slice(r!.from, r!.to)).toBe("'authors':\n  - Kim\n");
  });
});

describe('spliceTopLevelKey — REQ-WS-003 대상 키 밖 바이트 불변', () => {
  // AC-WS-007: 주석 → name → 앱이 정의하지 않은 키 → authors 순서의 매니페스트
  const MANIFEST = [
    '# 이 프로젝트는 2026 코호트 연구다',
    'name: cohort-2026',
    'custom_field:',
    '  nested: value',
    'authors:',
    '  - Kim',
    '',
  ].join('\n');

  it('갱신 대상 키 밖 바이트의 diff가 0이다', () => {
    const out = spliceTopLevelKey(MANIFEST, 'authors', 'authors:\n  - Kim\n  - Lee');
    const before = MANIFEST.slice(0, findTopLevelKeyRange(MANIFEST, 'authors')!.from);
    const after = MANIFEST.slice(findTopLevelKeyRange(MANIFEST, 'authors')!.to);
    expect(out.startsWith(before)).toBe(true);
    expect(out.endsWith(after)).toBe(true);
  });

  it('주석이 원문 그대로 남는다', () => {
    const out = spliceTopLevelKey(MANIFEST, 'authors', 'authors:\n  - Lee');
    expect(out).toContain('# 이 프로젝트는 2026 코호트 연구다');
  });

  it('앱이 정의하지 않은 키가 값·위치 모두 그대로다', () => {
    const out = spliceTopLevelKey(MANIFEST, 'authors', 'authors:\n  - Lee');
    expect(out).toContain('custom_field:\n  nested: value');
    expect(out.indexOf('custom_field')).toBeLessThan(out.indexOf('authors'));
  });

  it('키 순서가 보존된다', () => {
    const out = spliceTopLevelKey(MANIFEST, 'name', 'name: renamed');
    const order = ['name', 'custom_field', 'authors'].map((k) => out.indexOf(`\n${k}`) >= 0 ? out.indexOf(`\n${k}`) : out.indexOf(k));
    expect(order[0]).toBeLessThan(order[1]!);
    expect(order[1]).toBeLessThan(order[2]!);
  });

  it('말미 빈 줄이 보존된다', () => {
    const out = spliceTopLevelKey(MANIFEST, 'authors', 'authors:\n  - Lee');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('없는 키는 말미에 추가한다', () => {
    const out = spliceTopLevelKey('name: x\n', 'acknowledgements', 'acknowledgements: thanks');
    expect(out).toBe('name: x\nacknowledgements: thanks\n');
    expect(out.startsWith('name: x\n')).toBe(true);
  });

  it('개행으로 끝나지 않는 원문에 키를 추가해도 줄이 붙지 않는다', () => {
    const out = spliceTopLevelKey('name: x', 'registration', 'registration: y');
    expect(out).toBe('name: x\nregistration: y\n');
  });

  it('CRLF 원문에 추가할 때 CRLF를 유지한다', () => {
    const out = spliceTopLevelKey('name: x\r\n', 'registration', 'registration: y');
    expect(out).toBe('name: x\r\nregistration: y\r\n');
  });
});
