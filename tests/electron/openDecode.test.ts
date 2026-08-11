import { describe, it, expect } from 'vitest';
import { decodeUtf8StrictKeepingBom } from '../../electron/openDecode';

/**
 * SPEC-V03-WORKSPACE-002 M5 단계2 — 열기 경로 엄격 디코드의 **순수 축**.
 *
 * 대상 AC: AC-PANEL-046 (`And` 버퍼에 U+FFFD가 담기지 않는다).
 *
 * ## 이 파일이 고정하는 것
 *
 * 두 가지다. (1) 잘못된 UTF-8은 `null`이 된다 — 대체 문자로 때우지 않는다.
 * (2) **U+FEFF(BOM)는 보존된다** — 이것이 함정이고, 아래에 근거를 남긴다.
 *
 * ## BOM: 왜 `ignoreBOM: true`가 필수인가 (실측)
 *
 * `TextDecoder`의 `ignoreBOM` 기본값은 `false`이고, 그 이름과 반대로 **기본이
 * BOM을 먹는다**. 반면 오늘 열기 경로가 쓰는 `Buffer.toString('utf8')`은 BOM을
 * 문자열에 남긴다. 같은 바이트 `EF BB BF 61`에 대한 실측이다:
 *
 * ```
 *   Buffer.toString('utf8')                            → "<U+FEFF>a"  (보존)
 *   new TextDecoder('utf-8').decode(..)                → "a"          (제거)
 *   new TextDecoder('utf-8',{ignoreBOM:true}).decode() → "<U+FEFF>a"  (보존)
 * ```
 *
 * 즉 `{ fatal: true }`만 켜고 옮기면 BOM 있는 보조 파일의 첫 문자가 조용히
 * 사라지고, **열기→저장 왕복에서 3바이트가 증발한다**. M6의 AC-PANEL-043이
 * BOM을 바이트 무결성 대상으로 명시하므로 그 실패는 M6에서 터지되 원인은
 * 여기 묻힌다. 그래서 이 단언을 M6보다 먼저 박아 둔다.
 *
 * `electron/externalWatch.ts`의 `decodeUtf8Strict`를 재사용하지 않은 이유가
 * 정확히 이것이다 — 그 함수는 `{ fatal: true }`만 쓴다. 조정 경로의 BOM 동작을
 * 바꾸는 것은 이 SPEC의 범위 밖이라 그 함수는 손대지 않았다.
 *
 * ## "디코드 불가"의 경계 (실측)
 *
 * `fatal: true`가 거부하는 것은 **형식이 잘못된 UTF-8 바이트열**뿐이다.
 * 바이너리 판별 휴리스틱은 넣지 않았다 — REQ-PANEL-046은 "디코드 불가"를
 * 말하며, 휴리스틱은 유효 UTF-8인 정상 `.csv`를 거부할 수 있다(REQ-PANEL-045
 * 위반). 그 선택이 통과시키는 것과 막는 것을 아래가 그대로 단언한다.
 *
 * ## 왜 제어문자를 이스케이프가 아니라 상수로 쓰는가
 *
 * U+FEFF와 U+0000을 소스에 그대로 적으면 **보이지 않는 바이트**가 되어 리뷰와
 * grep에서 사라진다. 이름 붙인 상수는 그 자리에 무엇이 있는지 읽히게 한다.
 */

/** U+FEFF — 바이트로는 `EF BB BF`. */
const BOM = String.fromCharCode(0xfeff);
/** U+0000 — 유효 UTF-8이지만 바이너리의 강한 신호. */
const NUL = String.fromCharCode(0);

const bytes = (...b: number[]): Uint8Array => Uint8Array.from(b);

describe('decodeUtf8StrictKeepingBom — BOM 보존 (M6 AC-PANEL-043 선행 고정)', () => {
  it('선행 BOM을 문자열에 남긴다 — TextDecoder 기본값(제거)을 따르지 않는다', () => {
    const decoded = decodeUtf8StrictKeepingBom(bytes(0xef, 0xbb, 0xbf, 0x61));

    expect(decoded).toBe(`${BOM}a`);
  });

  it("오늘의 `Buffer.toString('utf8')`과 같은 문자열을 낸다 — 열기 동작이 바뀌지 않는다", () => {
    const raw = Buffer.from([0xef, 0xbb, 0xbf, 0xed, 0x95, 0x9c]); // BOM + '한'

    expect(decodeUtf8StrictKeepingBom(raw)).toBe(raw.toString('utf8'));
  });

  it('BOM만 있는 파일도 BOM을 남긴다', () => {
    expect(decodeUtf8StrictKeepingBom(bytes(0xef, 0xbb, 0xbf))).toBe(BOM);
  });
});

describe('decodeUtf8StrictKeepingBom — 형식이 잘못된 UTF-8은 null (AC-PANEL-046 And)', () => {
  // 각 항목은 `Buffer.toString('utf8')`이 U+FFFD를 만들어 내는 바이트열이다.
  const illFormed: Array<[string, number[]]> = [
    ['고립 서로게이트 ED A0 80', [0xed, 0xa0, 0x80]],
    ['잘린 2바이트 선두 C3', [0xc3]],
    ['과장 인코딩 C0 80', [0xc0, 0x80]],
    ['맨 연속 바이트 80', [0x80]],
    ['Latin-1 cafe (E9)', [0x63, 0x61, 0x66, 0xe9]],
    ['UTF-16LE BOM FF FE', [0xff, 0xfe, 0x00]],
  ];

  it.each(illFormed)('%s → null', (_name, raw) => {
    expect(decodeUtf8StrictKeepingBom(Uint8Array.from(raw))).toBeNull();
  });

  it('거부되는 바이트열은 모두 lossy 디코드에서 U+FFFD를 만들던 것들이다', () => {
    // 이 단언이 위 표의 전제를 지킨다: 목록에 U+FFFD를 만들지 않는(=사실은
    // 유효한) 바이트열이 섞여 들어오면 여기서 걸린다.
    for (const [name, raw] of illFormed) {
      expect(Buffer.from(raw).toString('utf8').includes('�'), name).toBe(true);
    }
  });
});

describe('decodeUtf8StrictKeepingBom — 통과시키는 경계 (휴리스틱 없음)', () => {
  it('빈 파일은 빈 문자열이다 — 실패가 아니다', () => {
    expect(decodeUtf8StrictKeepingBom(bytes())).toBe('');
  });

  it('NUL 바이트는 통과한다 — 유효 UTF-8이므로 바이너리 판별을 하지 않는다', () => {
    // 의도적 한계다. NUL은 바이너리의 강한 신호지만 형식상 유효 UTF-8이고,
    // 이것을 막으려면 "디코드 가능성"이 아닌 휴리스틱이 필요하다.
    expect(decodeUtf8StrictKeepingBom(bytes(0x61, 0x00, 0x62))).toBe(`a${NUL}b`);
  });

  it('비ASCII 정상 문서는 그대로 통과한다', () => {
    const raw = Buffer.from('한글 混在 cafe\n', 'utf8');

    expect(decodeUtf8StrictKeepingBom(raw)).toBe('한글 混在 cafe\n');
  });
});
