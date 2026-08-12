/**
 * 파일 종류 판정 — 확장자로 마크다운 원고와 보조 파일을 가른다
 * (SPEC-V03-WORKSPACE-002 REQ-PANEL-040). 순수 함수이며 의존성이 없다.
 *
 * ## `MARKDOWN_EXTENSIONS`가 왜 여기 있는가
 *
 * 마크다운 집합의 출하값은 열기 다이얼로그 필터(`electron/ipc/files.ts`)이고
 * REQ-PANEL-040은 그 집합을 **좁히지 않는다**. 그런데 `shared/`는 composite
 * 경계(`tsconfig.web.json`) 때문에 `electron/`을 import할 수 없다(TS6307).
 * SPEC-1이 `REFERENCE_DIR_NAME`에서 같은 벽을 만나 **방향을 뒤집어** 해결했고
 * (`shared/projectFolders.ts` 헤더), 여기서도 같은 형태를 쓴다 — 집합을
 * `shared/`에 정의하고 다이얼로그가 그것을 읽는다. 두 값의 동일성 단언은
 * 비-composite인 `tsconfig.test.json`에서만 성립하므로 `tests/` 계층에 둔다
 * (`plan.md` §B.2).
 *
 * ## 왜 순수 함수인가
 *
 * main(다이얼로그 필터·저장 분기)과 renderer(패널 조립)가 **같은 판정**을
 * 봐야 한다. 어느 한쪽에 두면 다른 쪽이 사본을 갖게 되고, 사본은 갈라진다.
 *
 * `node:path`는 쓰지 않는다 — `shared/`에는 node 타입이 없고, 이 모듈은
 * contextIsolation 아래의 렌더러에서도 로드된다.
 */

/**
 * 마크다운 원고인가 보조 파일인가.
 *
 * 언어 문법(REQ-PANEL-041)은 이 축에 얹지 않는다. 문법 조달은
 * `@codemirror/language-data`가 **파일명**으로 직접 조회하는 별개 질문이고,
 * 종류 판정에 언어를 끼워 넣으면 이 함수가 그 패키지에 묶인다 — 그러면
 * 렌더러 전용이 되어 main이 못 쓴다.
 */
export type FileKind = 'markdown' | 'auxiliary';

/**
 * 마크다운으로 판정되는 확장자 — **점 없이 소문자**. Electron
 * `FileFilter.extensions`가 요구하는 형식 그대로다.
 *
 * `electron/ipc/files.ts`의 열기 다이얼로그가 이 값을 읽는다. REQ-PANEL-040의
 * "좁히지 않는다(shall not)"는 두 곳이 갈라지지 않을 때만 성립하므로, 값의
 * 출처는 여기 하나다.
 */
export const MARKDOWN_EXTENSIONS: readonly string[] = ['md', 'markdown', 'txt'];

/**
 * 경로에서 파일명만 떼어낸다. 구분자는 `/`와 `\` 둘 다 받는다 — 이 모듈은
 * 플랫폼을 묻지 않는다(`shared/pathIdentity.ts`와 같은 이유).
 *
 * 확장자 판정(`fileExtensionOf`)과 언어 문법 조회(`extensionLayers.ts`의
 * `grammarDescriptionFor`)가 **같은 경계**를 봐야 하므로 여기 한 번만 정의한다.
 * 사본을 두면 한쪽만 `\`를 처리하는 식으로 갈라진다.
 */
export function fileBasenameOf(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
}

/**
 * 경로의 확장자를 **점 없이 소문자로** 돌려준다. 확장자가 없으면 빈 문자열.
 *
 * `node:path.extname`과 같은 경계를 쓴다: dotfile(`.gitignore`)과 점으로
 * 끝나는 이름(`a.`)은 확장자가 **없다**. basename을 먼저 떼야
 * `/notes.md/README`의 점을 확장자로 오인하지 않는다.
 */
export function fileExtensionOf(path: string): string {
  const base = fileBasenameOf(path);
  const dot = base.lastIndexOf('.');
  // dot === 0 은 dotfile, dot === base.length - 1 은 점으로 끝나는 이름.
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

// @MX:NOTE: [AUTO] 확장자 대소문자를 접는 것은 OS 다이얼로그 동작을 따른 것이다.
// macOS 기본 FS는 대소문자를 구분하지 않고 `filters.extensions` 매칭도 그러하므로
// `a.MD`는 마크다운 필터를 통과해 들어온다 — 여기서 보조로 판정하면 마크다운
// 필터로 연 파일이 평문 패널로 열린다.
/**
 * 파일 종류를 판정한다 (REQ-PANEL-040). 확장자를 증명할 수 없는 입력은
 * 보조로 떨어뜨린다 — 마크다운 오판은 평문에 데코레이션을 얹지만 그 반대는
 * 평문 편집기로 열릴 뿐이라 손실이 작다.
 */
export function fileKindOf(path: string): FileKind {
  return MARKDOWN_EXTENSIONS.includes(fileExtensionOf(path)) ? 'markdown' : 'auxiliary';
}
