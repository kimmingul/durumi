import { describe, it, expect } from 'vitest';
import { EditorState, type Transaction } from '@codemirror/state';
import { applyExternalChange, buildReconcileTransaction } from '../../src/editor/applyExternalChange';

/**
 * REQ-WS-033 — 조정은 바이트를 정규화하지 않는다.
 *
 * 각 검사는 "실수로 일어나기 쉬운 정규화" 하나씩을 막는다. 최종 텍스트만 보는
 * 검사는 이들 중 어느 것도 잡지 못한다 — 정규화된 결과도 "내용은 맞기" 때문이다.
 *
 * 줄바꿈에 대한 실측 (이 절의 설계 근거):
 *   - CodeMirror의 문서 좌표는 줄바꿈을 **언제나 1 위치**로 센다.
 *     `lineSeparator`를 `\r\n`으로 설정해도 `'x\r\ny'`의 `doc.length`는 3이다.
 *   - `doc.toString()`은 언제나 LF로 join하고, `sliceDoc()`만 설정된 구분자를
 *     반영한다. 둘의 오프셋 공간이 다르므로 diff는 **문서 좌표**에서 해야 한다.
 *   - 이 앱은 `lineSeparator`를 설정하지 않으므로 CRLF 파일은 **열리는 시점에**
 *     LF로 접힌다 — 조정 계층보다 앞선 단계다.
 *
 * 따라서 이 절은 조정 계층이 책임질 수 있는 것만 단언한다: 없던 바이트를
 * 만들지 않을 것, 전체 재작성으로 물러서지 않을 것, 좌표를 어긋내지 않을 것.
 * 전 구간 CRLF 보존이 왜 이 계층 밖인지는 마지막 `[기록]` 검사에 남긴다.
 */

function crlfEditor(doc: string) {
  let state = EditorState.create({
    doc,
    extensions: [EditorState.lineSeparator.of('\r\n')],
  });
  return {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = tr.state;
    },
    /** 설정된 줄바꿈을 반영한 문서 바이트. */
    text: () => state.sliceDoc(),
  };
}

function lfEditor(doc: string) {
  let state = EditorState.create({ doc });
  return {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = tr.state;
    },
    text: () => state.sliceDoc(),
  };
}

describe('줄바꿈 — AC-WS-035 (부분: 편집기 문서 모델의 한계 기록)', () => {
  it('CRLF 디스크 내용이 문서 표현과 같으면 트랜잭션을 만들지 않는다', () => {
    // 편집기는 CRLF 파일을 열 때 이미 LF로 접는다. 조정 계층이 그 사실을
    // 무시하고 CRLF 문자열과 비교하면 모든 줄 끝이 다르다고 판정해 문서를
    // 통째로 재작성한다 — 캐럿이 죽는다.
    const editor = lfEditor('a\nb\nc');
    expect(buildReconcileTransaction(editor.state, 'a\r\nb\r\nc')).toBeNull();
  });

  it('CRLF 입력이 고립된 \\r을 문서에 남기지 않는다 (손상 방지)', () => {
    // 회귀 근거: 문서 좌표로 접지 않고 CRLF 오프셋을 그대로 쓰면
    // `a\\r\\nCHANGED\\r\\r\\nc` 처럼 없던 바이트가 생긴다 — 실측된 손상이다.
    const editor = lfEditor('a\nb\nc');
    applyExternalChange(editor, 'a\r\nCHANGED\r\nc');
    const out = editor.text();
    expect(out.includes('\r')).toBe(false);
    expect(out).toBe('a\nCHANGED\nc');
  });

  it('CRLF 입력에서 바뀐 줄만 교체된다 (전체 재작성이 아니다)', () => {
    const editor = lfEditor('a\nb\nc');
    const spec = buildReconcileTransaction(editor.state, 'a\r\nCHANGED\r\nc')!;
    let touched = 0;
    editor.state.update(spec).changes.iterChanges((fromA, toA) => {
      touched += toA - fromA;
    });
    expect(touched).toBeLessThan(editor.state.doc.length);
  });

  it('LF 문서는 LF 그대로 유지된다', () => {
    const editor = lfEditor('a\nb\nc');
    applyExternalChange(editor, 'a\nB\nc');
    expect(editor.text()).toBe('a\nB\nc');
    expect(editor.text().includes('\r')).toBe(false);
  });

  it('lineSeparator가 설정된 상태에서도 좌표가 어긋나지 않는다', () => {
    // CodeMirror의 문서 좌표는 구분자 설정과 무관하게 줄바꿈을 1 위치로 센다
    // (실측: 'x\r\ny'의 doc.length === 3). 오프셋이 어긋나면 CodeMirror가
    // `Invalid change range`로 던진다 — 이 검사가 그 경로를 막는다.
    const editor = crlfEditor('a\r\nb\r\nc');
    expect(() => applyExternalChange(editor, 'a\r\nCHANGED\r\nc')).not.toThrow();
    expect(editor.text()).toBe('a\r\nCHANGED\r\nc');
  });

  it('[기록] CRLF 파일은 열리는 시점에 LF로 접힌다 — 조정 계층의 정규화가 아니다', () => {
    // 이 앱은 lineSeparator를 설정하지 않는다(grep 0건). 따라서 AC-WS-035가
    // 요구하는 "열기 → 조정 → 저장" 전 구간 CRLF 보존은 조정 계층만으로
    // 달성할 수 없다. 편집기가 파일별 줄바꿈을 감지해 lineSeparator를
    // 구성하고 저장 시 재직렬화해야 한다 — 편집기 구조 변경이다.
    // 아래는 현재 동작의 특성화이며, 고쳐진 것으로 오독되지 않게 남긴다.
    const loaded = EditorState.create({ doc: 'a\r\nb' });
    expect(loaded.sliceDoc()).toBe('a\nb');
    expect(loaded.doc.length).toBe(3);
  });
});

describe('후행 공백·들여쓰기를 건드리지 않는다 — AC-WS-036', () => {
  it('바뀌지 않은 줄의 후행 공백이 남는다', () => {
    const src = 'keep me   \nchange me\n';
    const editor = lfEditor(src);
    applyExternalChange(editor, 'keep me   \nCHANGED\n');
    expect(editor.text()).toBe('keep me   \nCHANGED\n');
    expect(editor.text().startsWith('keep me   \n')).toBe(true);
  });

  it('탭 들여쓰기를 공백으로 바꾸지 않는다', () => {
    const src = '\tdef f():\n\t\treturn 1\n';
    const editor = lfEditor(src);
    applyExternalChange(editor, '\tdef f():\n\t\treturn 2\n');
    expect(editor.text()).toBe('\tdef f():\n\t\treturn 2\n');
    expect(editor.text().includes('    ')).toBe(false);
  });

  it('외부가 보낸 후행 공백을 제거하지 않는다', () => {
    const editor = lfEditor('a\n');
    applyExternalChange(editor, 'a   \n');
    expect(editor.text()).toBe('a   \n');
  });
});

describe('말미 개행을 더하거나 빼지 않는다 — REQ-WS-033', () => {
  it('말미 개행이 없는 문서에 개행이 생기지 않는다', () => {
    const editor = lfEditor('no trailing newline');
    applyExternalChange(editor, 'no trailing NEWLINE');
    expect(editor.text()).toBe('no trailing NEWLINE');
    expect(editor.text().endsWith('\n')).toBe(false);
  });

  it('말미 개행이 있는 문서에서 개행이 사라지지 않는다', () => {
    const editor = lfEditor('has trailing\n');
    applyExternalChange(editor, 'HAS trailing\n');
    expect(editor.text()).toBe('HAS trailing\n');
  });

  it('외부가 말미 개행을 제거하면 그대로 반영한다', () => {
    const editor = lfEditor('a\n');
    applyExternalChange(editor, 'a');
    expect(editor.text()).toBe('a');
  });

  it('외부가 말미 개행을 추가하면 그대로 반영한다', () => {
    const editor = lfEditor('a');
    applyExternalChange(editor, 'a\n');
    expect(editor.text()).toBe('a\n');
  });
});

describe('인코딩·비ASCII를 재작성하지 않는다 — AC-WS-036', () => {
  it('한글과 이모지가 바이트 단위로 보존된다', () => {
    const src = '제목\n본문 내용 🙂\n';
    const editor = lfEditor(src);
    applyExternalChange(editor, '제목\n바뀐 내용 🙂\n');
    const out = editor.text();
    expect(out).toBe('제목\n바뀐 내용 🙂\n');
    expect([...out].length).toBe([...'제목\n바뀐 내용 🙂\n'].length);
  });

  it('BOM을 제거하지 않는다', () => {
    const src = '﻿title\nbody\n';
    const editor = lfEditor(src);
    applyExternalChange(editor, '﻿title\nBODY\n');
    expect(editor.text()).toBe('﻿title\nBODY\n');
    expect(editor.text().charCodeAt(0)).toBe(0xfeff);
  });

  it('BOM 없는 문서에 BOM을 붙이지 않는다', () => {
    const editor = lfEditor('title\n');
    applyExternalChange(editor, 'TITLE\n');
    expect(editor.text().charCodeAt(0)).not.toBe(0xfeff);
  });

  it('결합 문자를 분해·합성하지 않는다', () => {
    // NFC 'é'(U+00E9)와 NFD 'e'+U+0301은 서로 다른 바이트다. 어느 쪽으로도
    // 정규화하면 사용자가 쓰지 않은 변경이 디스크에 남는다.
    const nfd = 'café\n';
    const editor = lfEditor(nfd);
    applyExternalChange(editor, 'café latte\n');
    expect(editor.text()).toBe('café latte\n');
    expect(editor.text().includes('́')).toBe(true);
    expect(editor.text().includes('é')).toBe(false);
  });

  it('제로폭 문자를 제거하지 않는다', () => {
    const editor = lfEditor('a​b\n');
    applyExternalChange(editor, 'a​B\n');
    expect(editor.text()).toBe('a​B\n');
  });
});
