import { describe, it, expect } from 'vitest';
import {
  FOLDER_ROLES,
  DEFAULT_PROJECT_FOLDERS,
  REFERENCE_DIR_NAME,
  resolveProjectFolders,
} from '@shared/projectFolders';
// AC-WS-053: 두 트리에 걸친 동일성 단언은 테스트 계층에 둔다.
// `shared/`는 composite 경계(tsconfig.web.json) 때문에 `electron/`을 import할
// 수 없지만, `tsconfig.test.json`은 비-composite + node 타입이라 가능하다.
import { REFERENCE_DIR_NAME as ELECTRON_REFERENCE_DIR_NAME } from '../../electron/referenceFs';

describe('기본 폴더 규약 — REQ-WS-009 / AC-WS-053', () => {
  it('정확히 다섯 개의 역할을 정의한다', () => {
    expect([...FOLDER_ROLES].sort()).toEqual(
      ['data', 'figures', 'manuscript', 'reference', 'scripts'].sort(),
    );
    expect(FOLDER_ROLES).toHaveLength(5);
  });

  it('재정의가 없으면 다섯 개 기본 경로를 반환한다', () => {
    expect(resolveProjectFolders(undefined)).toEqual({
      data: 'data',
      scripts: 'scripts',
      figures: 'figures',
      manuscript: 'manuscript',
      reference: 'reference',
    });
  });

  it('reference 폴더명이 electron/referenceFs.ts의 REFERENCE_DIR_NAME과 문자열 동일하다', () => {
    expect(DEFAULT_PROJECT_FOLDERS.reference).toBe(ELECTRON_REFERENCE_DIR_NAME);
    expect(REFERENCE_DIR_NAME).toBe(ELECTRON_REFERENCE_DIR_NAME);
    expect(ELECTRON_REFERENCE_DIR_NAME).toBe('reference');
  });
});

describe('folders 재정의 — REQ-WS-010', () => {
  it('재정의된 경로를 사용한다 (AC-WS-008)', () => {
    const r = resolveProjectFolders({ figures: 'output/fig' });
    expect(r.figures).toBe('output/fig');
    expect(r.data).toBe('data');
  });

  it('루트 밖을 가리키는 재정의는 무시하고 기본값으로 되돌아간다 (AC-WS-009)', () => {
    expect(resolveProjectFolders({ data: '../elsewhere' }).data).toBe('data');
    expect(resolveProjectFolders({ data: 'a/../../b' }).data).toBe('data');
  });

  it('절대 경로 재정의는 무시한다', () => {
    expect(resolveProjectFolders({ data: '/var/tmp' }).data).toBe('data');
    expect(resolveProjectFolders({ data: 'C:/tmp' }).data).toBe('data');
    expect(resolveProjectFolders({ data: 'C:\\tmp' }).data).toBe('data');
  });

  it('문자열이 아니거나 빈 값인 재정의는 무시한다', () => {
    expect(resolveProjectFolders({ data: 42 }).data).toBe('data');
    expect(resolveProjectFolders({ data: '' }).data).toBe('data');
    expect(resolveProjectFolders({ data: '   ' }).data).toBe('data');
    expect(resolveProjectFolders({ data: '.' }).data).toBe('data');
  });

  it('folders 값 자체가 매핑이 아니면 전부 기본값이다', () => {
    expect(resolveProjectFolders('nope')).toEqual(DEFAULT_PROJECT_FOLDERS);
    expect(resolveProjectFolders(['a'])).toEqual(DEFAULT_PROJECT_FOLDERS);
    expect(resolveProjectFolders(null)).toEqual(DEFAULT_PROJECT_FOLDERS);
  });

  it('알 수 없는 역할 키는 결과에 나타나지 않는다', () => {
    const r = resolveProjectFolders({ notARole: 'x' });
    expect(r).toEqual(DEFAULT_PROJECT_FOLDERS);
    expect(Object.keys(r)).toHaveLength(5);
  });

  it('말미 슬래시와 ./ 접두를 정규화한다', () => {
    expect(resolveProjectFolders({ figures: './output/fig/' }).figures).toBe('output/fig');
  });

  it('역할과 이름이 어긋나도 역할 기준으로 해석한다 (AC-WS-066 전제)', () => {
    // folders.data: archive + folders.manuscript: data
    // → data 역할은 archive/, manuscript 역할은 data/.
    const r = resolveProjectFolders({ data: 'archive', manuscript: 'data' });
    expect(r.data).toBe('archive');
    expect(r.manuscript).toBe('data');
  });
});
