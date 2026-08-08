import { Annotation, type EditorState, type Transaction, type TransactionSpec } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import { computeMinimalChanges } from './minimalDiff';

/**
 * 외부 변경을 버퍼에 적용하는 실행자 (REQ-WS-025, 026).
 *
 * M2의 조정 상태 기계가 방출하는 `apply-to-buffer` effect를 실제 문서 변경으로
 * 옮기는 지점이다.
 *
 * ## 최소 차이가 목적이 아니라 수단이다
 *
 * 문서 전체를 교체해도 **내용**은 맞다. 틀리는 것은 사용자가 실제로 알아채는
 * 네 가지다 — 캐럿이 문서 맨 앞으로 튀고, 선택이 사라지고, 화면이 딴 데로
 * 스크롤되고, 실행 취소 한 번이 작업을 통째로 날린다. 최소 차이는 그 넷을
 * 살리기 위한 수단이며, REQ-WS-025가 "이는 …하게 하기 위함이다"라고 적은 이유다.
 *
 * 네 가지가 지켜지는 방식:
 *
 * | 속성 | 방식 |
 * |---|---|
 * | 캐럿·선택 | `selection`을 **지정하지 않는다**. CodeMirror가 변경을 통해 매핑한다 |
 * | 스크롤 | `scrollIntoView`를 **요청하지 않는다**. 요청이 없으면 위치가 유지된다 |
 * | 실행 취소 | `isolateHistory: 'full'` — 아래 참조 |
 *
 * ## 실행 취소를 어떻게 다루는가 (결정과 근거)
 *
 * 세 선택지가 있었다:
 *
 *  1. `addToHistory: false` — 조정이 이력에 남지 않는다. 사용자가 Cmd+Z를
 *     누르면 자기 편집이 되돌아간다. 그러나 **조정은 되돌릴 수 없다** —
 *     문서가 바뀌었는데 사용자가 이전 상태로 갈 수단이 없다.
 *  2. 기본값(이력에 추가, 병합 허용) — 조정이 직전 타이핑과 **같은 항목으로
 *     병합될 수 있다**(history의 newGroupDelay 창 안이면). 그러면 Cmd+Z 한 번이
 *     사용자의 타이핑까지 함께 날린다. 명백한 결함이다.
 *  3. **`isolateHistory: 'full'`** — 이력에 남되 앞뒤로 경계를 세워 어떤
 *     항목과도 병합되지 않는다.
 *
 * 3을 택했다. 조정은 문서를 바꾸는 실제 변경이므로 되돌릴 수 있어야 하고
 * (`DOCUMENT_MODE_PRINCIPLES.md` §0의 소스 무결성 우선), 동시에 사용자의
 * 편집과 한 덩어리가 되어서는 안 된다. 결과적으로 Cmd+Z 한 번은 조정만,
 * 두 번째가 사용자의 편집을 되돌린다.
 *
 * 되돌린 결과가 디스크와 달라지는 것은 정의된 상태다 — 미저장 편집이 있는
 * 상태이며 REQ-WS-027의 배너가 이미 담당한다.
 */

/**
 * 디스크 내용을 CodeMirror 문서 좌표 공간으로 접는다.
 *
 * 기본 설정에서 CodeMirror는 `\r\n`·`\r`·`\n`을 모두 줄바꿈으로 보고 문서에
 * 1 위치로 담는다. `lineSeparator`가 설정된 경우에는 그 문자열만 줄바꿈이다.
 */
export function toDocumentSpace(content: string, lineBreak: string): string {
  return lineBreak === '\n'
    ? content.replace(/\r\n?/g, '\n')
    : content.split(lineBreak).join('\n');
}

/** 이 트랜잭션이 외부 변경 조정에서 왔음을 표시한다. */
export const RECONCILE_ANNOTATION = Annotation.define<boolean>();

/** `EditorView`가 만족하는 최소 인터페이스. 테스트가 뷰 없이 구동할 수 있게 한다. */
export interface DispatchTarget {
  readonly state: EditorState;
  dispatch(tr: Transaction): void;
}

/**
 * 조정 트랜잭션 명세. 내용이 이미 같으면 null.
 *
 * `selection`도 `scrollIntoView`도 넣지 않는 것이 의도다 — 넣는 순간 캐럿
 * 매핑과 스크롤 유지를 CodeMirror에서 빼앗아 온다.
 */
export function buildReconcileTransaction(
  state: EditorState,
  nextContent: string,
): TransactionSpec | null {
  // 디스크 내용을 **문서 좌표 공간**으로 접은 뒤 비교한다.
  //
  // CodeMirror의 문서 좌표는 줄바꿈을 **언제나 1 위치**로 센다 — `lineSeparator`를
  // `\r\n`으로 설정해도 `'x\r\ny'`의 `doc.length`는 3이다(실측). 구분자는 출력
  // 시 직렬화에만 쓰인다. 따라서 CRLF 문자열의 오프셋으로 변경 범위를 만들면
  // 문서 좌표와 어긋나 `Invalid change range`가 나거나, 삽입된 `\r`이 문서의
  // 줄바꿈과 겹쳐 `\r\r\n`이라는 없던 바이트를 만든다 — REQ-WS-033이 금지하는
  // 정규화를 넘어선 파일 손상이다.
  //
  // 접는 것 자체는 조정 계층이 만든 정규화가 아니다: 이 편집기는
  // `lineSeparator`를 설정하지 않으므로 CRLF 파일은 **열리는 시점에** 이미
  // LF로 접힌다. 조정은 그 표현에 충실할 뿐이다(§SPEC 긴장 참조).
  const changes = computeMinimalChanges(
    state.doc.toString(),
    toDocumentSpace(nextContent, state.lineBreak),
  );
  if (changes.length === 0) return null;

  return {
    changes,
    annotations: [RECONCILE_ANNOTATION.of(true), isolateHistory.of('full')],
  };
}

/**
 * 외부 변경을 적용한다. 실제로 바뀐 것이 있으면 true.
 */
export function applyExternalChange(target: DispatchTarget, nextContent: string): boolean {
  const spec = buildReconcileTransaction(target.state, nextContent);
  if (!spec) return false;
  target.dispatch(target.state.update(spec));
  return true;
}

/**
 * 조정 스토어의 `apply-to-buffer` effect를 이 실행자에 연결한다.
 *
 * M2 이후 그 effect는 등록된 실행자가 없어 조용히 버려지고 있었다. 이 배선이
 * 그 구멍을 메운다. `open-diff`는 SPEC-4의 표면이므로 여기서는 무시한다 —
 * 처리하지 않는 것과 잘못 처리하는 것은 다르다.
 *
 * main→렌더러로 확정 이벤트를 나르는 IPC 채널은 여전히 M8 소관이다. 이 함수는
 * 렌더러 안쪽만 잇는다.
 */
export function registerReconciliationExecutor(
  target: DispatchTarget,
  setEffectHandler: (handler: ((effect: { kind: string; content: string }) => void) | null) => void,
): () => void {
  setEffectHandler((effect) => {
    if (effect.kind !== 'apply-to-buffer') return;
    applyExternalChange(target, effect.content);
  });
  return () => setEffectHandler(null);
}
