import { describe, it, expect } from 'vitest';
import { MARKDOWN_EXTENSIONS, fileExtensionOf, fileKindOf } from '@shared/fileKind';

/**
 * REQ-PANEL-040 / AC-PANEL-040 의 `Then` 축.
 *
 * `And` 축(다이얼로그 필터와의 동일성)은 `electron/`을 로드해야 하므로
 * `tests/electron/filesDialogFilter.test.ts`에 따로 둔다 — 그쪽은 IPC 등록과
 * 다이얼로그 호출을 재현하는 electron 계층 검사이고, 이 파일은 순수 함수의
 * 계약만 고정한다.
 */

describe('마크다운 판정 — AC-PANEL-040 Then', () => {
  // 세 값을 **리터럴로** 적은 것은 의도다. `MARKDOWN_EXTENSIONS`를 참조해
  // 돌리면 집합이 좁아질 때 기대값도 함께 좁아져 아무것도 잡지 못한다.
  // REQ-PANEL-040의 "좁히지 않는다(shall not)"를 반증할 수 있는 형태는
  // 상수와 독립적으로 고정된 이 세 줄뿐이다.
  it.each(['a.md', 'a.markdown', 'a.txt'])('%s 를 마크다운으로 판정한다', (path) => {
    expect(fileKindOf(path)).toBe('markdown');
  });

  it('경로가 붙어도 판정이 같다 (POSIX·Windows 양쪽)', () => {
    expect(fileKindOf('/tmp/notes/a.md')).toBe('markdown');
    expect(fileKindOf('C:\\Users\\me\\a.markdown')).toBe('markdown');
  });
});

describe('보조 파일 판정 — REQ-PANEL-040', () => {
  it.each(['a.py', 'data.json', 'conf.yaml', 'refs.bib'])(
    '%s 를 보조로 판정한다',
    (path) => {
      expect(fileKindOf(path)).toBe('auxiliary');
    },
  );
});

describe('판정 계약의 경계 — 확장자가 모호한 입력', () => {
  // macOS 기본 파일시스템은 대소문자를 구분하지 않고, OS 열기 다이얼로그의
  // `extensions` 필터도 대소문자를 구분하지 않는다. 즉 `a.MD`는 마크다운
  // 필터를 **통과해서 들어온다**. 여기서 보조로 판정하면 사용자가 마크다운
  // 필터로 연 파일이 평문 패널로 열린다 — 그래서 소문자로 접는다.
  it.each(['a.MD', 'A.Markdown', 'a.TXT'])('%s — 대소문자를 구분하지 않는다', (path) => {
    expect(fileKindOf(path)).toBe('markdown');
  });

  // 확장자를 증명할 수 없는 입력은 보조로 떨어뜨린다. 마크다운으로 오판하면
  // 평문에 마크다운 데코레이션이 얹히지만, 반대 오판은 평문 편집기로 열릴
  // 뿐이라 손실이 작다.
  it.each([
    ['README', '확장자 없음'],
    ['.gitignore', 'dotfile — node:path.extname과 같이 확장자 없음으로 본다'],
    ['a.', '점으로 끝남'],
  ])('%s (%s) 를 보조로 판정한다', (path) => {
    expect(fileKindOf(path)).toBe('auxiliary');
  });

  // 디렉터리 이름에 점이 있는 경로. basename을 떼지 않고 전체 문자열에서
  // 마지막 점을 찾으면 `md/README`가 잡히는데, 그것은 집합에 없어 판정은
  // 우연히 맞고 추출은 틀린다 — 그래서 `fileExtensionOf`를 직접 고정한다.
  it('디렉터리 이름의 점을 확장자로 오인하지 않는다', () => {
    expect(fileKindOf('/tmp/notes.md/README')).toBe('auxiliary');
  });
});

describe('확장자 추출 계약 — fileExtensionOf', () => {
  it.each([
    ['/tmp/a.MD', 'md', '소문자로 접는다'],
    ['/tmp/notes.md/README', '', 'basename 밖의 점은 보지 않는다'],
    ['C:\\docs\\a.tar.gz', 'gz', '마지막 점 뒤만 취한다 (백슬래시 구분자)'],
    ['.gitignore', '', 'dotfile은 확장자가 없다'],
    ['a.', '', '점 뒤가 비면 확장자가 아니다'],
    ['README', '', '점이 없으면 빈 문자열'],
  ])('%s → %o (%s)', (path, expected) => {
    expect(fileExtensionOf(path)).toBe(expected);
  });
});

describe('마크다운 확장자 집합 — REQ-PANEL-040 shall not', () => {
  it('오늘 다이얼로그가 받는 세 확장자를 모두 담는다', () => {
    expect([...MARKDOWN_EXTENSIONS].sort()).toEqual(['markdown', 'md', 'txt']);
  });

  it('점 없이 소문자로 담긴다 (다이얼로그 filters.extensions 형식)', () => {
    for (const ext of MARKDOWN_EXTENSIONS) {
      expect(ext).toBe(ext.toLowerCase());
      expect(ext.startsWith('.')).toBe(false);
    }
  });
});
