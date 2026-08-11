import { DECODE_FAILED_CODE } from '@shared/ipc-contract';

/**
 * 열기 경로의 엄격 UTF-8 디코드 (SPEC-V03-WORKSPACE-002 REQ-PANEL-046).
 *
 * 오늘 열기 경로는 `fs.readFile(path, 'utf8')`로 읽는다. Node의 `utf8` 디코딩은
 * **잘못된 바이트를 U+FFFD로 대체한다** — 바이너리를 열면 대체 문자로 가득한
 * 버퍼가 만들어지고, 그 버퍼를 저장하면 원본이 파괴된다. SPEC-1이 조정 경로에서
 * 같은 문제를 `decodeUtf8Strict`(`electron/externalWatch.ts`)로 막았고, 열기
 * 경로에도 같은 자세가 필요하다 — 조정을 막아 놓고 열기로 뚫리면 방어가 없다.
 *
 * ## 왜 `externalWatch.ts`의 `decodeUtf8Strict`를 재사용하지 않는가
 *
 * 그 함수는 `new TextDecoder('utf-8', { fatal: true })`를 쓴다. `ignoreBOM`의
 * 기본값은 `false`이고, 그 이름과 반대로 **기본이 BOM을 먹는다**. 실측:
 *
 * ```
 * 바이트 EF BB BF 61 ("<BOM>a")
 *   Buffer.toString('utf8')                              → "<U+FEFF>a"  (보존)
 *   new TextDecoder('utf-8').decode(..)                  → "a"          (제거)
 *   new TextDecoder('utf-8',{ignoreBOM:true}).decode(..) → "<U+FEFF>a"  (보존)
 * ```
 *
 * 즉 그 함수를 그대로 가져오면 BOM 있는 보조 파일의 첫 문자가 조용히 사라지고,
 * 열기→저장 왕복에서 3바이트가 증발한다 — M6 AC-PANEL-043(BOM 포함 바이트
 * 무결성)이 거기서 깨진다. 조정 경로의 BOM 동작을 바꾸는 것은 이 SPEC의 범위
 * 밖이므로 그 함수는 손대지 않고, 열기 경로용 디코더를 여기 따로 둔다.
 *
 * ## "디코드 불가"의 경계
 *
 * `fatal: true`가 거부하는 것은 **형식이 잘못된 UTF-8 바이트열**뿐이다 —
 * 고립 서로게이트, 과장 인코딩, 잘린 시퀀스, 맨 연속 바이트, 그리고 UTF-16이나
 * Latin-1로 인코딩된 텍스트. 통과시키는 것: 내장 `NUL`(유효 UTF-8이다)과 임의
 * 크기의 파일.
 *
 * 바이너리 판별 휴리스틱은 **의도적으로 넣지 않았다**. REQ-PANEL-046이 말하는
 * 것은 "디코드 불가"이고, 휴리스틱은 유효 UTF-8인 정상 `.csv`를 거부해
 * REQ-PANEL-045(평문 폴백)를 어길 수 있다. 그 대가로 유효 UTF-8인 바이너리는
 * 열린다.
 */

/**
 * 유효한 UTF-8이면 문자열, 아니면 `null`. 대체 문자로 때우지 않는다.
 *
 * `ignoreBOM: true`는 선택이 아니라 **오늘 동작과의 동일성 조건**이다 —
 * 위 실측 블록과 `tests/electron/openDecode.test.ts` 참조.
 */
export function decodeUtf8StrictKeepingBom(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * 열기 거부를 렌더러가 알아볼 수 있는 형태로 만든다.
 *
 * 경로를 메시지에 싣는 이유: 렌더러의 다이얼로그 열기(`file:open`)는 사용자가
 * 고른 경로를 모르므로, 사유 토스트에 파일명을 실으려면 오류가 그것을 날라야
 * 한다. 판정 자체는 `@shared/ipc-contract`의 `decodeFailedPathOf`가 한다.
 */
export function decodeFailedError(path: string): Error {
  return new Error(`${DECODE_FAILED_CODE}: ${path}`);
}
