/**
 * 최소 차이 산출 (REQ-WS-025). 순수 함수 — CodeMirror에 의존하지 않는다.
 *
 * ## 왜 접두·접미 축약만으로는 부족한가 (측정된 근거)
 *
 * `plan.md` §B.4는 값싼 방법(공통 접두·접미 축약)을 먼저 시도하고 부족할 때만
 * 확장하라고 지정했다. 먼저 그것만 구현해 측정했더니, 문서의 **양 끝** 6자만
 * 바뀐 400자 문서에서 **397자짜리 단일 교체**가 나왔다 — 가운데 변하지 않은
 * 50줄이 통째로 교체 범위에 들어갔다.
 *
 * 이는 정확성 문제가 아니라 REQ-WS-026 위반이다: 그 가운데에 있던 캐럿은
 * 교체 범위 **안쪽**이 되어 경계로 밀려난다. "변경되지 않은 텍스트에 대해
 * 문서상 같은 위치"라는 요구를 어긴다.
 *
 * 그래서 줄 단위 LCS를 얹었다. 단일 지점 변경(AC-WS-026의 시나리오)은 축약만으로
 * 이미 정확했으므로, 확장은 **다지점 변경**을 위한 것이다.
 *
 * ## 비용 상한
 *
 * LCS는 O(m·n)이다. 공통 접두·접미 **줄**을 먼저 걷어내 m·n을 실제 차이 블록으로
 * 좁히고, 그래도 상한을 넘으면 단일 교체로 물러선다 — 문서 전체 재작성 같은
 * 경우 캐럿 보존이 애초에 의미가 없으므로 잃는 것이 없다.
 */

export interface MinimalChange {
  from: number;
  to: number;
  insert: string;
}

/** LCS 표의 셀 수 상한. 넘으면 단일 교체로 물러선다. */
export const MAX_DIFF_CELLS = 1_000_000;

/** `index`가 서로게이트 쌍 한가운데인가. */
function splitsSurrogatePair(s: string, index: number): boolean {
  if (index <= 0 || index >= s.length) return false;
  const prev = s.charCodeAt(index - 1);
  const cur = s.charCodeAt(index);
  return prev >= 0xd800 && prev <= 0xdbff && cur >= 0xdc00 && cur <= 0xdfff;
}

/**
 * 두 문자열의 공통 접두·접미를 잘라낸 단일 교체 범위(상대 오프셋).
 * 같으면 null.
 */
function charSpan(current: string, next: string): { start: number; endCurrent: number; endNext: number } | null {
  if (current === next) return null;

  const max = Math.min(current.length, next.length);
  let start = 0;
  while (start < max && current.charCodeAt(start) === next.charCodeAt(start)) start += 1;
  if (splitsSurrogatePair(current, start) || splitsSurrogatePair(next, start)) start -= 1;

  let endCurrent = current.length;
  let endNext = next.length;
  while (
    endCurrent > start &&
    endNext > start &&
    current.charCodeAt(endCurrent - 1) === next.charCodeAt(endNext - 1)
  ) {
    endCurrent -= 1;
    endNext -= 1;
  }
  if (splitsSurrogatePair(current, endCurrent) || splitsSurrogatePair(next, endNext)) {
    endCurrent += 1;
    endNext += 1;
  }
  return { start, endCurrent, endNext };
}

interface Line {
  /** 줄바꿈을 포함한 줄 내용. */
  text: string;
  start: number;
  end: number;
}

function splitLines(source: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (;;) {
    const nl = source.indexOf('\n', start);
    if (nl === -1) {
      lines.push({ text: source.slice(start), start, end: source.length });
      return lines;
    }
    lines.push({ text: source.slice(start, nl + 1), start, end: nl + 1 });
    start = nl + 1;
  }
}

/** 한 덩어리 교체를 문자 단위로 더 좁힌다. 좁힐 것이 없으면 그대로. */
function refine(current: string, from: number, to: number, insert: string): MinimalChange | null {
  const span = charSpan(current.slice(from, to), insert);
  if (span === null) return null; // 실제로는 같은 내용이었다
  return {
    from: from + span.start,
    to: from + span.endCurrent,
    insert: insert.slice(span.start, span.endNext),
  };
}

/** 줄 배열의 LCS 길이 표. */
function lcsTable(a: readonly Line[], b: readonly Line[]): Uint32Array {
  const w = b.length + 1;
  const table = new Uint32Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * w + j] =
        a[i]!.text === b[j]!.text
          ? table[(i + 1) * w + (j + 1)]! + 1
          : Math.max(table[(i + 1) * w + j]!, table[i * w + (j + 1)]!);
    }
  }
  return table;
}

// @MX:ANCHOR: [AUTO] 최소 변경 산출의 출력 계약 — 오름차순·비중첩·서로게이트 안전
// @MX:REASON: 호출자(applyExternalChange)가 이 세 불변식을 전제로 CodeMirror
//   ChangeSpec 배열에 그대로 넘긴다. 어긋나면 문서가 조용히 깨지거나 캐럿
//   매핑이 무의미해진다.
/**
 * `current`를 `next`로 바꾸는 최소 변경 목록. 오름차순이며 서로 겹치지 않는다.
 * 같으면 빈 배열.
 */
export function computeMinimalChanges(current: string, next: string): MinimalChange[] {
  if (current === next) return [];

  const aLines = splitLines(current);
  const bLines = splitLines(next);

  // 공통 접두·접미 줄을 걷어낸다 — LCS를 실제 차이 블록으로 좁히는 단계다.
  let pfx = 0;
  const maxPfx = Math.min(aLines.length, bLines.length);
  while (pfx < maxPfx && aLines[pfx]!.text === bLines[pfx]!.text) pfx += 1;

  let sfx = 0;
  while (
    sfx < maxPfx - pfx &&
    aLines[aLines.length - 1 - sfx]!.text === bLines[bLines.length - 1 - sfx]!.text
  ) {
    sfx += 1;
  }

  const aMid = aLines.slice(pfx, aLines.length - sfx);
  const bMid = bLines.slice(pfx, bLines.length - sfx);

  const midFrom = aMid.length > 0 ? aMid[0]!.start : (aLines[pfx]?.start ?? current.length);
  const midTo = aMid.length > 0 ? aMid[aMid.length - 1]!.end : midFrom;
  const midInsert = bMid.map((l) => l.text).join('');

  // 한쪽이 비었으면 순수 삽입·삭제다 — LCS가 필요 없다.
  if (aMid.length === 0 || bMid.length === 0) {
    const change = refine(current, midFrom, midTo, midInsert);
    return change ? [change] : [];
  }

  // 상한을 넘으면 단일 교체로 물러선다.
  if (aMid.length * bMid.length > MAX_DIFF_CELLS) {
    const change = refine(current, midFrom, midTo, midInsert);
    return change ? [change] : [];
  }

  const w = bMid.length + 1;
  const table = lcsTable(aMid, bMid);

  const changes: MinimalChange[] = [];
  let i = 0;
  let j = 0;
  while (i < aMid.length || j < bMid.length) {
    if (i < aMid.length && j < bMid.length && aMid[i]!.text === bMid[j]!.text) {
      i += 1;
      j += 1;
      continue;
    }
    // 일치하지 않는 구간을 한 덩어리로 모은다.
    const runFrom = i < aMid.length ? aMid[i]!.start : midTo;
    let runTo = runFrom;
    let inserted = '';
    while (i < aMid.length || j < bMid.length) {
      if (i < aMid.length && j < bMid.length && aMid[i]!.text === bMid[j]!.text) break;
      const takeA =
        j >= bMid.length ||
        (i < aMid.length && table[(i + 1) * w + j]! >= table[i * w + (j + 1)]!);
      if (takeA && i < aMid.length) {
        runTo = aMid[i]!.end;
        i += 1;
      } else if (j < bMid.length) {
        inserted += bMid[j]!.text;
        j += 1;
      }
    }
    const change = refine(current, runFrom, runTo, inserted);
    if (change) changes.push(change);
  }

  return changes;
}
