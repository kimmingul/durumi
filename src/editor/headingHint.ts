import { syntaxTree } from '@codemirror/language';
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import { currentEditMode } from './editMode';

/**
 * "`#` 뒤에 공백을 넣으면 제목이 됩니다" 안내의 판정 로직.
 *
 * CommonMark 는 ATX 제목에 `#` 뒤 공백을 요구한다 — `#foo` 는 문단이다.
 * 이는 `#hashtag` / `#1234` / `C#` 이 의도치 않게 제목이 되는 것을 막는
 * 표준 규칙이라 Durumi 가 바꿀 대상이 아니다. 대신 왜 제목이 안 되는지
 * 알기 어려운 문제만 안내로 푼다.
 *
 * [HARD] 이 모듈은 문서를 절대 수정하지 않는다. 판정만 하고 결과를 스토어에
 * 넘긴다. `#한글` 을 입력하는 순간은 IME 조합이 진행 중인 시점이라,
 * 문서 변경이나 에디터 DOM 데코레이션은 `docs/DOCUMENT_MODE_PRINCIPLES.md`
 * §0 우선순위(소스 무결성 → IME 안전)를 정면으로 위반한다. 안내는 상태바
 * (에디터 DOM 밖)에서만 렌더한다.
 */

/** CommonMark 가 제목 앞에 허용하는 최대 선행 공백. 4칸부터는 코드블록. */
const MAX_INDENT = 3;
/** ATX 제목의 최대 `#` 개수. 7개부터는 공백을 넣어도 제목이 아니다. */
const MAX_LEVEL = 6;

/** `^( {0,3})(#+)(.?)` — 선행 공백 한도를 상수에서 가져와 조립한다. */
const ATX_PROBE = new RegExp(`^( {0,${MAX_INDENT}})(#+)(.?)`);

/**
 * 이 줄이 "공백만 넣으면 제목이 되는" 상태인지 판정한다.
 * 이미 올바른 제목이거나, 공백을 넣어도 제목이 될 수 없는 줄은 false.
 */
export function needsHeadingSpace(lineText: string): boolean {
  const m = ATX_PROBE.exec(lineText);
  if (!m) return false;
  const [, , hashes = '', next = ''] = m;
  if (hashes.length > MAX_LEVEL) return false;
  // `#` 뒤가 줄 끝이거나 공백이면 이미 유효한 제목이다.
  if (next === '' || next === ' ' || next === '\t') return false;
  return true;
}

/** 캐럿이 코드블록·프론트매터 안에 있으면 안내하지 않는다(그곳의 `#` 은 주석 등). */
function inCodeContext(view: EditorView, pos: number): boolean {
  let node = syntaxTree(view.state).resolveInner(pos, -1);
  while (node.parent) {
    if (
      node.name === 'FencedCode' ||
      node.name === 'CodeBlock' ||
      node.name === 'CodeText' ||
      node.name === 'FrontMatter'
    ) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

/** 현재 캐럿 위치 기준으로 안내가 필요한지 판정한다. */
export function shouldShowHeadingHint(view: EditorView): boolean {
  // Live(typora) 모드 전용. Document 모드는 `#` 를 자동 이스케이프해 상황이
  // 다르고, Source 모드는 원본을 그대로 편집하는 것이 목적이다.
  if (currentEditMode(view.state) !== 'typora') return false;
  const { head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  if (!needsHeadingSpace(line.text)) return false;
  return !inCodeContext(view, line.from);
}

/**
 * 판정 결과가 **바뀔 때만** 콜백을 호출하는 ViewPlugin.
 * 매 키 입력마다 리렌더하지 않도록 상태 전이에서만 알린다.
 */
export function headingHintPlugin(onChange: (show: boolean) => void) {
  return ViewPlugin.define((view: EditorView) => {
    let last = shouldShowHeadingHint(view);
    onChange(last);
    return {
      update(u: ViewUpdate) {
        if (!u.docChanged && !u.selectionSet && !u.transactions.some((t) => t.reconfigured)) return;
        const next = shouldShowHeadingHint(u.view);
        if (next !== last) {
          last = next;
          onChange(next);
        }
      },
      destroy() {
        if (last) onChange(false);
      },
    };
  });
}
