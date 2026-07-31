import { describe, it, expect } from 'vitest';
import { needsHeadingSpace } from '../../src/editor/headingHint';

/**
 * CommonMark 는 ATX 제목에 `#` 뒤 공백을 요구한다. `#foo` 는 제목이 아니라
 * 문단이며, 이는 `#hashtag` / `#1234` / `C#` 이 의도치 않게 제목이 되는 것을
 * 막기 위한 표준 규칙이다(Durumi 가 정한 것이 아니다 — @lezer/markdown 기본
 * 파서 동작이며 `tests/editor/` 의 파서 프로브로 확인했다).
 *
 * 다만 입력 중에는 왜 제목이 안 되는지 알기 어렵다. 이 판정기는 상태바에
 * 안내를 띄울 시점을 정한다 — 문서는 절대 수정하지 않는다.
 */

describe('needsHeadingSpace — 안내가 필요한 경우', () => {
  it.each(['#foo', '##bar', '###baz', '####a', '#####a', '######a'])(
    '%s — 공백만 넣으면 제목이 된다',
    (line) => {
      expect(needsHeadingSpace(line)).toBe(true);
    },
  );

  it('한글 바로 입력도 대상이다 (실제 신고 사례)', () => {
    expect(needsHeadingSpace('#제목')).toBe(true);
  });

  it('선행 공백 3칸까지는 여전히 제목 후보다', () => {
    expect(needsHeadingSpace(' #foo')).toBe(true);
    expect(needsHeadingSpace('  #foo')).toBe(true);
    expect(needsHeadingSpace('   #foo')).toBe(true);
  });
});

describe('needsHeadingSpace — 안내하지 않는 경우', () => {
  it('이미 올바른 제목이면 안내하지 않는다', () => {
    expect(needsHeadingSpace('# foo')).toBe(false);
    expect(needsHeadingSpace('###   spaced')).toBe(false);
  });

  it('# 만 있는 줄은 그 자체로 유효한 빈 제목이다', () => {
    expect(needsHeadingSpace('#')).toBe(false);
    expect(needsHeadingSpace('###')).toBe(false);
  });

  it('# 이 7개 이상이면 공백을 넣어도 제목이 아니다', () => {
    expect(needsHeadingSpace('#######foo')).toBe(false);
    expect(needsHeadingSpace('########foo')).toBe(false);
  });

  it('선행 공백 4칸 이상은 들여쓰기 코드블록이다', () => {
    expect(needsHeadingSpace('    #foo')).toBe(false);
    expect(needsHeadingSpace('\t#foo')).toBe(false);
  });

  it('# 으로 시작하지 않는 줄', () => {
    expect(needsHeadingSpace('foo')).toBe(false);
    expect(needsHeadingSpace('')).toBe(false);
    expect(needsHeadingSpace('a#foo')).toBe(false);
  });

  it('닫는 시퀀스가 붙은 정상 제목', () => {
    expect(needsHeadingSpace('# foo #')).toBe(false);
  });
});
