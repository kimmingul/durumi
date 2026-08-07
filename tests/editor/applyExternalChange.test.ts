import { describe, it, expect } from 'vitest';
import { EditorState, EditorSelection, type Transaction } from '@codemirror/state';
import { history, undo, undoDepth } from '@codemirror/commands';
import {
  applyExternalChange,
  buildReconcileTransaction,
  RECONCILE_ANNOTATION,
} from '../../src/editor/applyExternalChange';

/**
 * 실행자 검증. `EditorView` 없이 실제 `EditorState`로 구동한다 — 선택 매핑과
 * 실행 취소는 상태 계층의 동작이므로 jsdom 레이아웃이 필요 없다.
 *
 * 네 가지 보존 속성(캐럿·선택·스크롤·실행 취소)을 **각각** 단언한다.
 * 최종 문서 텍스트만 보는 검사는 전체 교체 구현도 통과시킨다.
 */

const LINES = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
const DOC = LINES.join('\n');

function makeEditor(doc: string, withHistory = false) {
  let state = EditorState.create({
    doc,
    extensions: withHistory ? [history()] : [],
  });
  return {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = tr.state;
    },
  };
}

/** 다중 선택을 허용한 편집기 — 앱 기본 설정에는 없다. */
function makeEditorMulti(doc: string) {
  let state = EditorState.create({
    doc,
    extensions: [EditorState.allowMultipleSelections.of(true)],
  });
  return {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = tr.state;
    },
  };
}

/** 문서에서 `text`가 시작하는 오프셋. */
const offsetOf = (doc: string, text: string): number => {
  const i = doc.indexOf(text);
  if (i < 0) throw new Error(`not found: ${text}`);
  return i;
};

describe('전체 교체가 아니다 — REQ-WS-025', () => {
  it('변경 범위가 문서 전체보다 훨씬 작다', () => {
    const next = DOC.replace('line 5', 'line 5 CHANGED');
    const state = EditorState.create({ doc: DOC });
    const spec = buildReconcileTransaction(state, next)!;

    // 삭제 길이 + 삽입 길이로 잰다. 순수 삽입은 삭제가 0이므로 삭제만 세면
    // 최소성 여부를 구분하지 못한다.
    let touched = 0;
    let changeCount = 0;
    state.update(spec).changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      touched += toA - fromA + inserted.length;
      changeCount += 1;
    });
    expect(changeCount).toBeGreaterThan(0);
    expect(touched).toBeLessThan(DOC.length / 10);
  });

  it('내용이 같으면 트랜잭션을 만들지 않는다', () => {
    expect(buildReconcileTransaction(EditorState.create({ doc: DOC }), DOC)).toBeNull();
  });

  it('applyExternalChange가 무변경일 때 false를 반환하고 dispatch하지 않는다', () => {
    const editor = makeEditor(DOC);
    let dispatched = 0;
    const spy = {
      get state() {
        return editor.state;
      },
      dispatch(tr: Transaction) {
        dispatched += 1;
        editor.dispatch(tr);
      },
    };
    expect(applyExternalChange(spy, DOC)).toBe(false);
    expect(dispatched).toBe(0);
  });

  it('적용 후 문서가 디스크 내용과 일치한다', () => {
    const editor = makeEditor(DOC);
    const next = DOC.replace('line 5', 'line 5 CHANGED');
    expect(applyExternalChange(editor, next)).toBe(true);
    expect(editor.state.doc.toString()).toBe(next);
  });
});

describe('보존 1 — 캐럿 (AC-WS-026)', () => {
  it('80번째 줄 캐럿이 5번째 줄 2줄 삽입 후에도 같은 텍스트 지점을 가리킨다', () => {
    const caret = offsetOf(DOC, 'line 80');
    const editor = makeEditor(DOC);
    editor.dispatch(editor.state.update({ selection: EditorSelection.cursor(caret) }));

    const withInsert = [...LINES];
    withInsert.splice(4, 0, 'new A', 'new B');
    const next = withInsert.join('\n');

    expect(applyExternalChange(editor, next)).toBe(true);

    const after = editor.state.selection.main.head;
    const line = editor.state.doc.lineAt(after);
    expect(line.text).toBe('line 80');
    expect(after).toBe(offsetOf(next, 'line 80'));
    expect(line.number).toBe(82); // 2줄이 위에 삽입됐다
  });

  it('변경 지점보다 앞의 캐럿은 움직이지 않는다', () => {
    const caret = offsetOf(DOC, 'line 2');
    const editor = makeEditor(DOC);
    editor.dispatch(editor.state.update({ selection: EditorSelection.cursor(caret) }));

    applyExternalChange(editor, DOC.replace('line 90', 'line 90 CHANGED'));
    expect(editor.state.selection.main.head).toBe(caret);
  });

  it('멀리 떨어진 두 지점이 바뀌어도 사이의 캐럿이 보존된다', () => {
    // 접두·접미 축약만으로는 두 지점이 하나의 큰 교체로 묶여 캐럿이 경계로
    // 밀려난다. 줄 단위 diff를 얹은 이유가 이 경우다.
    const caret = offsetOf(DOC, 'line 50');
    const editor = makeEditor(DOC);
    editor.dispatch(editor.state.update({ selection: EditorSelection.cursor(caret) }));

    const next = DOC.replace('line 1\n', 'CHANGED HEAD\n').replace('line 100', 'CHANGED TAIL');
    expect(applyExternalChange(editor, next)).toBe(true);

    const after = editor.state.selection.main.head;
    expect(editor.state.doc.lineAt(after).text).toBe('line 50');
  });
});

describe('보존 2 — 선택 영역 (AC-WS-026)', () => {
  it('선택 범위가 같은 텍스트를 계속 감싼다', () => {
    const from = offsetOf(DOC, 'line 70');
    const to = from + 'line 70'.length;
    const editor = makeEditor(DOC);
    editor.dispatch(editor.state.update({ selection: EditorSelection.range(from, to) }));

    const withInsert = [...LINES];
    withInsert.splice(4, 0, 'new A');
    const next = withInsert.join('\n');
    applyExternalChange(editor, next);

    const sel = editor.state.selection.main;
    expect(editor.state.doc.sliceString(sel.from, sel.to)).toBe('line 70');
  });

  it('다중 선택도 모두 매핑된다', () => {
    // 이 앱은 현재 allowMultipleSelections를 켜지 않는다(grep 0건) — 켜지 않으면
    // CodeMirror가 주 범위로 접는다. 실행자가 선택 개수에 무관함을 고정해 두어,
    // 나중에 켜더라도 매핑이 깨지지 않게 한다.
    const a = offsetOf(DOC, 'line 30');
    const b = offsetOf(DOC, 'line 60');
    const editor = makeEditorMulti(DOC);
    editor.dispatch(
      editor.state.update({
        selection: EditorSelection.create([
          EditorSelection.range(a, a + 7),
          EditorSelection.range(b, b + 7),
        ]),
      }),
    );

    const withInsert = [...LINES];
    withInsert.splice(4, 0, 'new A');
    applyExternalChange(editor, withInsert.join('\n'));

    const ranges = editor.state.selection.ranges;
    expect(ranges).toHaveLength(2);
    expect(editor.state.doc.sliceString(ranges[0]!.from, ranges[0]!.to)).toBe('line 30');
    expect(editor.state.doc.sliceString(ranges[1]!.from, ranges[1]!.to)).toBe('line 60');
  });

  it('변경 영역 내부의 캐럿은 경계로 이동하고 문서 밖으로 나가지 않는다 (AC-WS-027)', () => {
    const doc = 'head REPLACE-ME tail';
    const inside = doc.indexOf('REPLACE-ME') + 4;
    const editor = makeEditor(doc);
    editor.dispatch(editor.state.update({ selection: EditorSelection.cursor(inside) }));

    const next = 'head SHORT tail';
    applyExternalChange(editor, next);

    const head = editor.state.selection.main.head;
    expect(head).toBeGreaterThanOrEqual(0);
    expect(head).toBeLessThanOrEqual(editor.state.doc.length);
    // 교체 범위의 경계 안쪽에 놓인다.
    const changeFrom = next.indexOf('SHORT');
    expect(head).toBeGreaterThanOrEqual(changeFrom);
    expect(head).toBeLessThanOrEqual(changeFrom + 'SHORT'.length);
  });
});

describe('보존 3 — 스크롤 위치', () => {
  it('트랜잭션이 스크롤을 요청하지 않는다', () => {
    // jsdom에는 레이아웃이 없어 실제 스크롤을 잴 수 없다. 대신 스크롤이
    // 움직이는 유일한 경로 — 트랜잭션의 scrollIntoView 요청 — 이 없음을 고정한다.
    // CodeMirror는 요청이 없으면 스크롤 위치를 유지한다.
    const state = EditorState.create({ doc: DOC });
    const spec = buildReconcileTransaction(state, DOC.replace('line 5', 'X'))!;
    expect(spec.scrollIntoView).toBeFalsy();
    expect(spec.effects).toBeUndefined();
  });

  it('선택을 명시적으로 지정하지 않는다 (매핑에 맡긴다)', () => {
    // selection을 직접 넣으면 CodeMirror가 캐럿을 화면에 끌어오려 스크롤할 수
    // 있고, 매핑보다 나쁜 결과를 준다.
    const state = EditorState.create({ doc: DOC });
    const spec = buildReconcileTransaction(state, DOC.replace('line 5', 'X'))!;
    expect(spec.selection).toBeUndefined();
  });
});

describe('보존 4 — 실행 취소 이력 (AC-WS-028)', () => {
  it('조정 이전 편집에 대한 실행 취소가 여전히 가능하다', () => {
    const editor = makeEditor('start\n', true);
    // 사용자 편집
    editor.dispatch(editor.state.update({ changes: { from: 5, insert: ' typed' } }));
    expect(editor.state.doc.toString()).toBe('start typed\n');
    const depthAfterTyping = undoDepth(editor.state);
    expect(depthAfterTyping).toBe(1);

    // 외부 변경 조정
    applyExternalChange(editor, 'start typed\nexternal\n');
    expect(editor.state.doc.toString()).toBe('start typed\nexternal\n');

    // 조정은 자기 자신의 실행 취소 항목을 갖는다 — 사용자 편집과 병합되지 않는다.
    expect(undoDepth(editor.state)).toBe(depthAfterTyping + 1);

    // 첫 실행 취소: 조정만 되돌린다 (사용자 편집은 남는다)
    undo(editor);
    expect(editor.state.doc.toString()).toBe('start typed\n');

    // 두 번째 실행 취소: 사용자 편집을 되돌린다
    undo(editor);
    expect(editor.state.doc.toString()).toBe('start\n');
  });

  it('타이핑 직후의 조정이 같은 실행 취소 항목으로 병합되지 않는다', () => {
    // 병합되면 Cmd+Z 한 번이 사용자의 타이핑까지 함께 날린다 — 이 검사가
    // isolateHistory('full')의 존재 이유다.
    const editor = makeEditor('a\n', true);
    editor.dispatch(editor.state.update({ changes: { from: 1, insert: 'bc' } }));
    applyExternalChange(editor, 'abc\nX\n');

    undo(editor);
    expect(editor.state.doc.toString(), '조정만 되돌아가야 한다').toBe('abc\n');
  });

  it('조정 자체도 되돌릴 수 있다 (조용히 취소 불가가 아니다)', () => {
    const editor = makeEditor('a\n', true);
    applyExternalChange(editor, 'a\nexternal\n');
    expect(undoDepth(editor.state)).toBe(1);
    undo(editor);
    expect(editor.state.doc.toString()).toBe('a\n');
  });
});

describe('조정 트랜잭션의 표식', () => {
  it('조정 유래임을 주석으로 남긴다', () => {
    const state = EditorState.create({ doc: 'a' });
    const tr = state.update(buildReconcileTransaction(state, 'b')!);
    expect(tr.annotation(RECONCILE_ANNOTATION)).toBe(true);
  });

  it('사용자 입력으로 위장하지 않는다', () => {
    const state = EditorState.create({ doc: 'a' });
    const spec = buildReconcileTransaction(state, 'b')!;
    expect(spec.userEvent).toBeUndefined();
  });
});

describe('조정 스토어 배선 — M2의 apply-to-buffer 실행자', () => {
  it('apply-to-buffer effect가 실제 문서 변경으로 이어진다', async () => {
    const { useReconciliationStore } = await import('../../src/store/reconciliationStore');
    const { registerReconciliationExecutor } = await import('../../src/editor/applyExternalChange');
    useReconciliationStore.getState().reset();

    const editor = makeEditor('before\n');
    const detach = registerReconciliationExecutor(
      editor,
      useReconciliationStore.getState().setEffectHandler,
    );

    useReconciliationStore.getState().dispatch({
      type: 'external-change',
      change: { path: '/w/a.md', content: 'after\n', mtimeMs: 1, size: 6 },
    });

    expect(editor.state.doc.toString()).toBe('after\n');
    detach();
    useReconciliationStore.getState().reset();
  });

  it('open-diff effect는 문서를 건드리지 않는다', async () => {
    const { useReconciliationStore } = await import('../../src/store/reconciliationStore');
    const { registerReconciliationExecutor } = await import('../../src/editor/applyExternalChange');
    useReconciliationStore.getState().reset();

    const editor = makeEditor('keep\n');
    const detach = registerReconciliationExecutor(
      editor,
      useReconciliationStore.getState().setEffectHandler,
    );

    const store = useReconciliationStore.getState();
    store.dispatch({ type: 'dirty-changed', isDirty: true });
    store.dispatch({
      type: 'external-change',
      change: { path: '/w/a.md', content: 'disk\n', mtimeMs: 1, size: 5 },
    });
    store.dispatch({ type: 'user-view-diff' });

    expect(editor.state.doc.toString()).toBe('keep\n');
    detach();
    useReconciliationStore.getState().reset();
  });
});
