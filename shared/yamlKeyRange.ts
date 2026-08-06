/**
 * YAML 최상위 키의 **바이트 범위 산출**과 그 범위만 교체하는 스플라이스.
 * 순수 함수 — main/renderer/테스트 어디서나 쓴다.
 *
 * 존재 이유(REQ-WS-003): 매니페스트를 파싱→재직렬화하면 사용자 주석, 키 순서,
 * 들여쓰기 스타일, 앱이 모르는 키가 전부 사라진다. `shared/frontMatter.ts`가
 * 이미 쓰고 있는 발상 — "파싱은 위치를 알아내는 데 쓰고, 쓰기는 그 위치만
 * 건드린다" — 을 키 단위로 좁힌 것이다. `frontMatterRange`는 front matter
 * **블록 전체** 범위를 주므로 이 목적에는 입도가 맞지 않아 새로 만들었다.
 *
 * 의도적 한계: 열-0에서 시작하는 최상위 키만 다룬다. 중첩 매핑 안의 키는
 * 대상이 아니며(들여쓰기가 있으므로 연속 줄로 취급), 흐름 스타일
 * (`{a: 1, b: 2}`)로 쓰인 최상위 매핑도 지원하지 않는다. 매니페스트와 front
 * matter 어느 쪽도 그런 형태로 출하되지 않는다.
 */

export interface KeyRange {
  /** 키 줄의 시작 오프셋. */
  from: number;
  /** 키 블록의 마지막 비어 있지 않은 줄 끝(개행 포함) 오프셋. */
  to: number;
}

interface Line {
  /** 개행을 제외한 줄 내용. */
  text: string;
  start: number;
  /** 개행을 포함한 끝 오프셋. */
  end: number;
  blank: boolean;
}

const KEY_LINE_RE =
  /^(?:([A-Za-z_][A-Za-z0-9_.-]*)|"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)')[ \t]*:(?:[ \t]|$)/;

function splitLines(source: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  while (start <= source.length) {
    let nl = source.indexOf('\n', start);
    if (nl === -1) {
      if (start === source.length) break;
      nl = source.length - 1;
      const text = source.slice(start);
      lines.push({ text, start, end: source.length, blank: text.trim() === '' });
      break;
    }
    const raw = source.slice(start, nl);
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    lines.push({ text, start, end: nl + 1, blank: text.trim() === '' });
    start = nl + 1;
  }
  return lines;
}

/** 열-0 키 줄이면 키 이름을, 아니면 null을 반환한다. */
function topLevelKeyOf(text: string): string | null {
  const m = text.match(KEY_LINE_RE);
  if (!m) return null;
  if (m[1] !== undefined) return m[1];
  if (m[2] !== undefined) return m[2].replace(/\\(.)/g, '$1');
  if (m[3] !== undefined) return m[3].replace(/''/g, "'");
  return null;
}

/** 키 블록을 끝내는 줄인가 — 다음 최상위 키, 열-0 주석, 문서 마커. */
function isBlockTerminator(text: string): boolean {
  if (text.startsWith('#')) return true;
  if (/^(?:---|\.\.\.)(?:\s|$)/.test(text)) return true;
  return topLevelKeyOf(text) !== null;
}

/**
 * `yamlText` 안에서 최상위 `key`가 차지하는 범위를 반환한다. 없으면 null.
 * 블록 뒤의 빈 줄과 열-0 주석은 범위 밖에 남는다 — 갱신이 사용자의 여백과
 * 주석을 삼키지 않게 하기 위함이다.
 */
export function findTopLevelKeyRange(yamlText: string, key: string): KeyRange | null {
  const lines = splitLines(yamlText);
  const i = lines.findIndex((l) => topLevelKeyOf(l.text) === key);
  if (i === -1) return null;

  let lastNonBlank = i;
  for (let j = i + 1; j < lines.length; j += 1) {
    const line = lines[j]!;
    if (!line.blank && isBlockTerminator(line.text)) break;
    if (!line.blank) lastNonBlank = j;
  }
  return { from: lines[i]!.start, to: lines[lastNonBlank]!.end };
}

/** 원문이 쓰는 줄바꿈. CRLF가 한 번이라도 보이면 CRLF로 본다. */
function lineEndingOf(source: string): string {
  return source.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * 최상위 `key`의 블록만 `replacement`로 교체한다. `replacement`는 키 줄을
 * 포함한 블록 전체 텍스트이며 말미 개행은 붙이지 않는다 (예:
 * `'authors:\n  - Kim\n  - Lee'`).
 *
 * 키가 없으면 말미에 덧붙인다. 그 밖의 바이트는 한 글자도 바뀌지 않는다.
 */
export function spliceTopLevelKey(
  yamlText: string,
  key: string,
  replacement: string,
): string {
  const eol = lineEndingOf(yamlText);
  const normalized = eol === '\r\n' ? replacement.replace(/\r?\n/g, eol) : replacement;

  const range = findTopLevelKeyRange(yamlText, key);
  if (range) {
    const tail = yamlText.slice(range.from, range.to);
    // 원문 블록이 개행으로 끝났으면 그 형태를 유지한다.
    const suffix = tail.endsWith('\n') ? eol : '';
    return yamlText.slice(0, range.from) + normalized + suffix + yamlText.slice(range.to);
  }

  if (yamlText === '') return normalized + eol;
  const prefix = yamlText.endsWith('\n') ? yamlText : yamlText + eol;
  return prefix + normalized + eol;
}
