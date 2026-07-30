import { version } from '../package.json';

/**
 * 아웃바운드 HTTP User-Agent의 단일 진실 원천.
 *
 * 이전에는 `bibliographyFetch.ts` / `aiClient.ts` / `referenceDownload.ts`가
 * 각자 버전 리터럴('0.1.6' / '0.1.8' / '0.1.7')을 하드코딩해, 어느 것도
 * 갱신되지 않은 채 Crossref·PubMed·ORCID·LLM 엔드포인트에 잘못된 버전을
 * 보내고 있었다. 갱신 메커니즘 자체가 없었던 것이 원인이다.
 *
 * `app.getVersion()`을 쓰지 않는 이유: 위 세 모듈은 electron을 import하지
 * 않는 순수 모듈이고(`fetchImpl` 주입만으로 테스트됨), electron 의존을
 * 들이면 기존 테스트가 전부 electron 모킹을 요구하게 된다. `package.json`을
 * 직접 읽으면 순수성을 지키면서 동일한 단일 원천을 얻는다. 패키징된 앱에도
 * `package.json`이 포함된다(`electron-builder.yml` files).
 *
 * 기본(default) import가 아니라 named import를 쓰는 이유: rollup의 JSON 플러그인은
 * top-level 키별 named export를 만들어 주므로 `version`만 뽑아 쓰면 나머지
 * 매니페스트(dependencies·devDependencies·scripts)가 번들에서 tree-shake된다.
 * 기본 import는 매니페스트 전체를 main 번들에 인라인한다.
 *
 * 회귀 방지: `tests/electron/userAgent.test.ts`.
 */

/** `package.json`의 version. 릴리스 시 `pnpm version`이 갱신한다. */
export const APP_VERSION: string = version;

const REPO_URL = 'https://github.com/kimmingul/durumi';

/**
 * 표준 User-Agent를 만든다.
 *
 * @param email Crossref polite pool / Unpaywall용 연락 이메일. 있으면
 *   ` mailto:<email>`이 덧붙는다. null·undefined·빈 문자열은 생략한다.
 */
export function durumiUserAgent(email?: string | null): string {
  const base = `Durumi/${APP_VERSION} (${REPO_URL})`;
  return email ? `${base} mailto:${email}` : base;
}
