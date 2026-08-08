import { describe, it, expect } from 'vitest';
import { computeMinimalChanges, type MinimalChange } from '../../src/editor/minimalDiff';

/**
 * 최소 차이 산출 — 순수 함수. CodeMirror에 의존하지 않는다.
 * 적용·캐럿 보존은 `tests/editor/applyExternalChange.test.ts`가 본다.
 */

/** 변경 목록을 실제로 적용해 결과 문자열을 만든다 (산출물의 정합성 확인용). */
function applyAll(source: string, changes: readonly MinimalChange[]): string {
  let out = '';
  let cursor = 0;
  for (const c of changes) {
    out += source.slice(cursor, c.from) + c.insert;
    cursor = c.to;
  }
  return out + source.slice(cursor);
}

/** 변경이 덮는 총 문자 수 — "최소"의 척도. */
const spanOf = (changes: readonly MinimalChange[]): number =>
  changes.reduce((n, c) => n + (c.to - c.from), 0);

describe('공통 접두·접미 축약 — REQ-WS-025', () => {
  it('같은 내용이면 변경이 없다', () => {
    expect(computeMinimalChanges('same', 'same')).toEqual([]);
  });

  it('가운데 한 곳만 바뀌면 그 범위만 교체한다', () => {
    const a = 'head MIDDLE tail';
    const b = 'head CHANGED tail';
    const changes = computeMinimalChanges(a, b);
    expect(changes).toHaveLength(1);
    expect(a.slice(changes[0]!.from, changes[0]!.to)).toBe('MIDDLE');
    expect(changes[0]!.insert).toBe('CHANGED');
    expect(applyAll(a, changes)).toBe(b);
  });

  it('순수 삽입은 빈 범위에 삽입한다', () => {
    const a = 'ab';
    const b = 'aXb';
    const changes = computeMinimalChanges(a, b);
    expect(changes).toEqual([{ from: 1, to: 1, insert: 'X' }]);
  });

  it('순수 삭제는 빈 문자열로 교체한다', () => {
    const changes = computeMinimalChanges('aXb', 'ab');
    expect(changes).toEqual([{ from: 1, to: 2, insert: '' }]);
  });

  it('전체 교체는 문서 전체 범위 한 건이다', () => {
    const changes = computeMinimalChanges('abc', 'xyz');
    expect(changes).toEqual([{ from: 0, to: 3, insert: 'xyz' }]);
  });

  it('빈 문서에서 시작해도 동작한다', () => {
    expect(applyAll('', computeMinimalChanges('', 'new'))).toBe('new');
    expect(applyAll('old', computeMinimalChanges('old', ''))).toBe('');
  });

  it('반복 문자열에서도 결과가 정확하다', () => {
    const a = 'aaaa';
    const b = 'aaaaa';
    expect(applyAll(a, computeMinimalChanges(a, b))).toBe(b);
  });
});

describe('서로게이트 쌍을 쪼개지 않는다', () => {
  it('이모지 경계에서 잘린 코드 유닛을 만들지 않는다', () => {
    const a = 'x🙂y';
    const b = 'x🙃y';
    const changes = computeMinimalChanges(a, b);
    const result = applyAll(a, changes);
    expect(result).toBe(b);
    // 결과에 고립 서로게이트가 없어야 한다.
    expect([...result].length).toBe([...b].length);
    for (const c of changes) {
      expect(isSurrogateBoundarySafe(a, c.from)).toBe(true);
      expect(isSurrogateBoundarySafe(a, c.to)).toBe(true);
    }
  });

  it('접미 경계에서도 서로게이트 쌍을 쪼개지 않는다', () => {
    // 상위 서로게이트만 다르고 하위가 같은 쌍 — 접미 스캔이 하위 서로게이트를
    // 먼저 먹어 경계가 쌍 한가운데에 선다. 물러서지 않으면 고립 서로게이트가
    // 남아 문서가 깨진다.
    const a = 'X\uD83D\uDE42';
    const b = 'X\uD83C\uDE42';
    const changes = computeMinimalChanges(a, b);
    const result = applyAll(a, changes);
    expect(result).toBe(b);
    expect([...result].length).toBe([...b].length);
    for (const c of changes) {
      expect(isSurrogateBoundarySafe(a, c.from)).toBe(true);
      expect(isSurrogateBoundarySafe(a, c.to)).toBe(true);
    }
  });

  it('이모지 삽입도 안전하다', () => {
    const a = 'ab';
    const b = 'a🙂b';
    expect(applyAll(a, computeMinimalChanges(a, b))).toBe(b);
  });
});

function isSurrogateBoundarySafe(s: string, index: number): boolean {
  if (index <= 0 || index >= s.length) return true;
  const prev = s.charCodeAt(index - 1);
  return !(prev >= 0xd800 && prev <= 0xdbff);
}

describe('여러 곳이 바뀌면 각각을 따로 교체한다 — REQ-WS-026의 전제', () => {
  it('멀리 떨어진 두 지점 사이의 텍스트를 건드리지 않는다', () => {
    // 접두·접미 축약만으로는 두 지점을 하나의 큰 replace로 묶어 사이의
    // 변하지 않은 텍스트까지 덮는다. 그러면 그 안에 있던 캐럿이 경계로
    // 밀려나 REQ-WS-026("변경되지 않은 텍스트에 대해 같은 위치")을 어긴다.
    const a = ['AAA', 'keep-1', 'keep-2', 'keep-3', 'BBB'].join('\n');
    const b = ['XXX', 'keep-1', 'keep-2', 'keep-3', 'YYY'].join('\n');
    const changes = computeMinimalChanges(a, b);

    expect(applyAll(a, changes)).toBe(b);
    expect(changes.length).toBeGreaterThanOrEqual(2);

    // 사이의 보존 구간이 어떤 변경 범위에도 포함되지 않는다.
    const keepStart = a.indexOf('keep-1');
    const keepEnd = a.indexOf('keep-3') + 'keep-3'.length;
    for (const c of changes) {
      const overlaps = c.from < keepEnd && c.to > keepStart;
      expect(overlaps, `변경 [${c.from},${c.to})가 보존 구간을 덮는다`).toBe(false);
    }
  });

  it('덮는 총 범위가 전체 교체보다 훨씬 작다', () => {
    const a = ['AAA', ...Array.from({ length: 50 }, (_, i) => `line-${i}`), 'BBB'].join('\n');
    const b = ['XXX', ...Array.from({ length: 50 }, (_, i) => `line-${i}`), 'YYY'].join('\n');
    const changes = computeMinimalChanges(a, b);
    expect(applyAll(a, changes)).toBe(b);
    expect(spanOf(changes)).toBeLessThan(a.length / 10);
  });

  it('변경 목록은 오름차순이며 겹치지 않는다', () => {
    const a = ['A', 'x', 'B', 'y', 'C'].join('\n');
    const b = ['1', 'x', '2', 'y', '3'].join('\n');
    const changes = computeMinimalChanges(a, b);
    expect(applyAll(a, changes)).toBe(b);
    for (let i = 1; i < changes.length; i++) {
      expect(changes[i]!.from).toBeGreaterThanOrEqual(changes[i - 1]!.to);
    }
  });

  it('줄 삽입은 삽입 지점만 건드린다', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
    const a = lines.join('\n');
    const withInsert = [...lines];
    withInsert.splice(4, 0, 'new A', 'new B');
    const b = withInsert.join('\n');

    const changes = computeMinimalChanges(a, b);
    expect(applyAll(a, changes)).toBe(b);
    // 80번째 줄 근처는 어떤 변경에도 포함되지 않아야 한다.
    const line80 = a.indexOf('line 80');
    for (const c of changes) {
      expect(c.from <= line80 && c.to > line80).toBe(false);
    }
  });
});

describe('대규모 재작성은 단일 교체로 물러선다', () => {
  it('차이 블록이 상한을 넘으면 한 건으로 축약한다', () => {
    const a = Array.from({ length: 5000 }, (_, i) => `old ${i}`).join('\n');
    const b = Array.from({ length: 5000 }, (_, i) => `new ${i}`).join('\n');
    const changes = computeMinimalChanges(a, b);
    expect(applyAll(a, changes)).toBe(b);
    expect(changes).toHaveLength(1);
  });

  it('상한 축약 경로도 결과가 정확하다', () => {
    const a = 'prefix\n' + Array.from({ length: 3000 }, (_, i) => `o${i}`).join('\n') + '\nsuffix';
    const b = 'prefix\n' + Array.from({ length: 3000 }, (_, i) => `n${i}`).join('\n') + '\nsuffix';
    expect(applyAll(a, computeMinimalChanges(a, b))).toBe(b);
  });
});
