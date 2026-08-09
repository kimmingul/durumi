/**
 * 경로 동일성 — 두 경로가 같은 파일을 가리키는가 (SPEC-V03-WORKSPACE-002 REQ-PANEL-051).
 *
 * ## 왜 순수 함수로 떼어 두는가
 *
 * 확정된 외부 변경은 **그 경로에 해당하는 문서로만** 라우팅되어야 한다. 그런데
 * 경로 문자열의 동일성은 플랫폼마다 다르다 — Windows는 `\`와 `/`를 같게 보고
 * 대소문자를 구분하지 않으며, POSIX는 둘 다 구분한다. 이 판정을 라우팅 코드
 * 안에 흩어 두면 Windows 규칙이 **실행되는 곳에서만** 검증 가능해지는데, 이
 * 저장소에는 Windows e2e가 없다(C-7).
 *
 * 그래서 판정을 순수 함수로 떼고 플랫폼을 **인자로 주입**받는다. darwin에서 도는
 * 유닛이 두 플랫폼의 규칙을 그대로 재현한다 — SPEC-1이 재검사 로직에 쓴 수단과
 * 같다.
 *
 * ## 왜 `process.platform`을 읽지 않는가
 *
 * 이 모듈은 렌더러에서도 쓰인다. contextIsolation 아래의 렌더러에는 `process`가
 * 없으므로 호스트를 물으면 렌더러에서 깨진다. 대신 **경로 자신의 모양**에서
 * 판독한다. 부수 효과가 더 중요하다: main이 보낸 경로와 렌더러가 연 경로가
 * 같은 규칙으로 접히므로, 어느 쪽 프로세스가 판정하든 결과가 같다.
 *
 * ## 정규화하지 않는 것
 *
 * `.`/`..` 축약, 심볼릭 링크 해소, 상대 경로의 절대화는 **하지 않는다.**
 * `electron/pathGuard.ts`가 `fs.realpath`를 의도적으로 호출하지 않으므로
 * (모든 guarded 호출에 비동기 디스크 접근을 붙이지 않기 위한 기록된 수용 위험)
 * 앱은 바이트 수준 파일 동일성 탐지를 주장하지 않는다. 여기서 링크를 해소하면
 * 그 주장을 이 계층에서만 하게 되어 계층 간 판정이 갈린다.
 */

export type PathPlatform = 'posix' | 'windows';

/** `C:\…` 또는 `C:/…`. 드라이브 문자가 곧 Windows 절대 경로의 표식이다. */
const DRIVE_ABSOLUTE = /^[A-Za-z]:[\\/]/;
/** `\\server\share\…` — UNC 경로. */
const UNC_PREFIX = /^\\\\/;

/**
 * 경로 모양에서 플랫폼을 판독한다.
 *
 * 판별 근거를 드라이브 문자와 UNC 접두사로 좁힌 이유: `\` 하나만으로 판별하면
 * POSIX에서 `\`를 이름에 담은 파일이 Windows 규칙으로 접혀 대소문자가 무너진다.
 * 이 앱이 다루는 경로는 pathGuard를 통과한 **절대 경로**이므로 두 접두사로 충분하다.
 */
export function platformOfPath(path: string): PathPlatform {
  return DRIVE_ABSOLUTE.test(path) || UNC_PREFIX.test(path) ? 'windows' : 'posix';
}

/**
 * 그 플랫폼의 규칙으로 접은 대조 키.
 *
 * POSIX는 **그대로 둔다.** 접는 것 자체가 위험이기 때문이다 — `/w/a.md`와
 * `/w/A.md`는 서로 다른 파일이고, 같은 키를 주면 열지도 않은 문서의 확정 변경이
 * 현재 버퍼로 라우팅된다.
 */
export function pathKeyOn(platform: PathPlatform, path: string): string {
  if (platform === 'posix') return path;
  return path.replace(/\//g, '\\').toLowerCase();
}

/** 경로 모양에서 플랫폼을 판독해 접은 대조 키. */
export function pathKey(path: string): string {
  return pathKeyOn(platformOfPath(path), path);
}

/**
 * 주입된 플랫폼 규칙으로 두 경로를 대조한다 — AC-PANEL-051b의 판정 대상.
 *
 * 경로가 없는 문서(untitled)는 어떤 경로와도 같지 않다. `null === null`을 참으로
 * 두면 저장된 적 없는 두 문서가 서로 같은 문서로 취급된다.
 */
export function samePathOn(platform: PathPlatform, a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  return pathKeyOn(platform, a) === pathKeyOn(platform, b);
}

/** 각 경로의 모양에서 플랫폼을 판독해 대조한다. */
export function samePath(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  return pathKey(a) === pathKey(b);
}
