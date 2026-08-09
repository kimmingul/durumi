import { describe, it, expect } from 'vitest';
import {
  pathKey,
  pathKeyOn,
  platformOfPath,
  samePath,
  samePathOn,
  type PathPlatform,
} from '@shared/pathIdentity';

/**
 * SPEC-V03-WORKSPACE-002 M3 — 경로 대조의 **플랫폼 차이 흡수**.
 *
 * 대상 AC: AC-PANEL-051b ↔ REQ-PANEL-051, C-7.
 *
 * ## 왜 유닛에서 양 플랫폼을 재현하는가
 *
 * Windows e2e가 없다(C-7). 그래서 대조 로직을 **주입 가능한 순수 함수**로
 * 떼어내고 플랫폼을 인자로 받는다 — 그러면 darwin에서 도는 이 유닛이 Windows
 * 규칙을 그대로 재현한다. SPEC-1이 재검사 로직에 쓴 수단과 같다.
 *
 * ## 왜 `process.platform`을 읽지 않는가
 *
 * 이 모듈은 렌더러에서도 쓰인다. contextIsolation 아래의 렌더러에는 `process`가
 * 없으므로 호스트를 물으면 렌더러에서 깨진다. 대신 **경로 자신의 모양**에서
 * 판독한다 — 드라이브 문자(`C:\`, `C:/`)나 UNC 접두사(`\\`)면 Windows다.
 * 부수 효과로 main이 보낸 경로와 렌더러가 연 경로가 같은 규칙으로 접힌다.
 */

// ---------------------------------------------------------------------------
// 표 A — 같은 논리 관계는 두 플랫폼에서 같은 판정을 낸다
// ---------------------------------------------------------------------------

interface Relation {
  /** 두 경로가 맺는 논리 관계. */
  readonly what: string;
  readonly expected: boolean;
  /** 그 관계를 macOS 표기로 쓴 쌍 (`/`, 대소문자 구분). */
  readonly macos: readonly [string, string];
  /** 같은 관계를 Windows 표기로 쓴 쌍 (`\`, 드라이브 문자, 대소문자 무구분). */
  readonly windows: readonly [string, string];
}

const RELATIONS: Relation[] = [
  {
    what: '같은 파일을 같은 표기로 가리킨다',
    expected: true,
    macos: ['/w/proj/a.md', '/w/proj/a.md'],
    windows: ['C:\\w\\proj\\a.md', 'C:\\w\\proj\\a.md'],
  },
  {
    what: '같은 파일을 그 플랫폼이 동일시하는 다른 표기로 가리킨다',
    expected: true,
    // macOS에서 동일시되는 다른 표기는 없다 — 구분자도 대소문자도 유일하다.
    // 관계는 같으므로 같은 쌍을 쓴다. 판정이 같아야 한다는 것이 요점이다.
    macos: ['/w/proj/a.md', '/w/proj/a.md'],
    windows: ['C:\\w\\proj\\a.md', 'c:/W/Proj/A.MD'],
  },
  {
    what: '서로 다른 파일을 가리킨다',
    expected: false,
    macos: ['/w/proj/a.md', '/w/proj/b.md'],
    windows: ['C:\\w\\proj\\a.md', 'C:\\w\\proj\\b.md'],
  },
  {
    what: '같은 이름이 서로 다른 디렉터리에 있다',
    expected: false,
    macos: ['/w/one/a.md', '/w/two/a.md'],
    windows: ['C:\\w\\one\\a.md', 'C:\\w\\two\\a.md'],
  },
  {
    what: '한쪽이 다른 쪽의 접두사일 뿐이다',
    expected: false,
    macos: ['/w/a.md', '/w/a.md.bak'],
    windows: ['C:\\w\\a.md', 'C:\\w\\a.md.bak'],
  },
];

describe('AC-PANEL-051b — 같은 관계는 두 플랫폼에서 같은 판정을 낸다', () => {
  for (const rel of RELATIONS) {
    it(`${rel.what} → 두 플랫폼 모두 ${rel.expected}`, () => {
      const onMac = samePathOn('posix', ...rel.macos);
      const onWin = samePathOn('windows', ...rel.windows);

      expect(onMac, `macOS 표기 판정이 어긋났다: ${rel.macos.join(' vs ')}`).toBe(rel.expected);
      expect(onWin, `Windows 표기 판정이 어긋났다: ${rel.windows.join(' vs ')}`).toBe(rel.expected);
      expect(onWin, '두 플랫폼의 판정이 갈렸다').toBe(onMac);
    });
  }
});

// ---------------------------------------------------------------------------
// 표 B — 흡수되는 차이 자체
// ---------------------------------------------------------------------------

describe('AC-PANEL-051b — 흡수하는 차이는 플랫폼마다 다르다', () => {
  it('구분자 차이는 Windows에서만 흡수된다', () => {
    expect(samePathOn('windows', 'C:\\w\\a.md', 'C:/w/a.md')).toBe(true);
    // POSIX에서 `\`는 파일 이름에 쓸 수 있는 평범한 문자다. 흡수하면 서로 다른
    // 두 파일을 같다고 판정한다.
    expect(samePathOn('posix', '/w/a.md', '/w\\a.md')).toBe(false);
  });

  it('대소문자 차이는 Windows에서만 흡수된다', () => {
    expect(samePathOn('windows', 'C:\\w\\a.md', 'C:\\W\\A.MD')).toBe(true);
    // macOS의 기본 볼륨은 대소문자를 보존하며, 대소문자만 다른 두 이름을 같다고
    // 판정하면 열지도 않은 문서로 확정 변경이 라우팅된다.
    expect(samePathOn('posix', '/w/a.md', '/w/A.md')).toBe(false);
  });

  it('드라이브 문자의 대소문자도 흡수된다', () => {
    expect(samePathOn('windows', 'c:\\w\\a.md', 'C:\\w\\a.md')).toBe(true);
  });

  it('서로 다른 드라이브는 흡수되지 않는다', () => {
    expect(samePathOn('windows', 'C:\\w\\a.md', 'D:\\w\\a.md')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 플랫폼 판독 — 호스트를 묻지 않고 경로 모양에서 얻는다
// ---------------------------------------------------------------------------

describe('platformOfPath — 경로 모양이 플랫폼을 말한다', () => {
  const cases: Array<[string, PathPlatform]> = [
    ['C:\\w\\a.md', 'windows'],
    ['c:/w/a.md', 'windows'],
    ['\\\\server\\share\\a.md', 'windows'],
    ['/w/a.md', 'posix'],
    ['/Users/min/Projects/durumi/a.md', 'posix'],
    ['relative/a.md', 'posix'],
  ];

  for (const [path, expected] of cases) {
    it(`${path} → ${expected}`, () => {
      expect(platformOfPath(path)).toBe(expected);
    });
  }
});

describe('pathKey — 대조 키', () => {
  it('POSIX 경로는 그대로 둔다', () => {
    // 정규화가 곧 위험이다: POSIX에서 접거나 낮추면 서로 다른 파일이 한 키를
    // 공유하고, 조정이 엉뚱한 버퍼로 간다.
    expect(pathKey('/w/A.md')).toBe('/w/A.md');
    expect(pathKeyOn('posix', '/w/A.md')).toBe('/w/A.md');
  });

  it('Windows 경로는 구분자와 대소문자를 접는다', () => {
    expect(pathKey('C:/W/A.MD')).toBe('c:\\w\\a.md');
    expect(pathKeyOn('windows', 'C:/W/A.MD')).toBe('c:\\w\\a.md');
  });

  it('같은 파일의 두 표기는 같은 키를, 다른 파일은 다른 키를 낸다', () => {
    expect(pathKey('C:\\w\\a.md')).toBe(pathKey('c:/W/A.MD'));
    expect(pathKey('/w/a.md')).not.toBe(pathKey('/w/A.md'));
  });
});

describe('samePath — 경로 모양으로 판정한다', () => {
  it('경로가 없으면 같지 않다 — null은 문서를 가리키지 않는다', () => {
    expect(samePath(null, '/w/a.md')).toBe(false);
    expect(samePath('/w/a.md', null)).toBe(false);
    expect(samePath(null, null)).toBe(false);
    expect(samePathOn('windows', null, 'C:\\w\\a.md')).toBe(false);
  });

  it('POSIX 경로와 Windows 경로는 서로 다른 문서다', () => {
    expect(samePath('/w/a.md', 'C:\\w\\a.md')).toBe(false);
  });

  it('플랫폼을 주입하지 않아도 각 표기의 규칙이 적용된다', () => {
    expect(samePath('C:\\w\\a.md', 'c:/W/A.MD')).toBe(true);
    expect(samePath('/w/a.md', '/w/A.md')).toBe(false);
  });
});
