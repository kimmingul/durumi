import { keymap, type EditorView } from '@codemirror/view';
import { Prec, type Extension } from '@codemirror/state';
import { applyInlineFormat } from './pendingInlineFormat';
import { setHeading } from './setHeading';
import { insertTable } from './insertTable';
import { insertCodeBlock } from './insertCodeBlock';
import { toggleTask } from './toggleTask';
import { tableNextCell, tablePrevCell, tableExitDown, tableInsertRowBelow } from './table';
import { wrapComment } from './wrapComment';
import { dispatchPanelEvent } from '../panelEvents';

/**
 * 메모 탭 토글 (`Mod-Shift-m`).
 *
 * DOM 이벤트로 올리는 이유는 그대로다 — 어느 표면에 포커스가 있든 셸이 받도록
 * 하고, 에디터 모듈이 React 스토어를 import하지 않게 유지한다. 바뀐 것은 **발신
 * 패널을 싣는다**는 것뿐이다(REQ-PANEL-034).
 *
 * 인라인 화살표 함수에서 이름 붙은 커맨드로 꺼낸 이유: 키 시뮬레이션 없이도
 * 이 경로를 직접 검사할 수 있어야 한다.
 */
export function memoPanelToggleCommand(view: EditorView): boolean {
  dispatchPanelEvent(view, 'durumi:memo-panel-toggle');
  return true;
}

export function markdownKeymap(): Extension {
  const tableKeys = Prec.high(
    keymap.of([
      { key: 'Tab', run: tableNextCell },
      { key: 'Shift-Tab', run: tablePrevCell },
      { key: 'Enter', run: tableExitDown },
      { key: 'Mod-Enter', run: tableInsertRowBelow },
    ]),
  );
  const mdKeys = keymap.of([
    { key: 'Mod-b', run: (view) => applyInlineFormat(view, 'bold'), preventDefault: true },
    { key: 'Mod-i', run: (view) => applyInlineFormat(view, 'italic'), preventDefault: true },
    { key: 'Mod-Shift-k', run: (view) => applyInlineFormat(view, 'code'), preventDefault: true },
    { key: 'Mod-Shift-x', run: (view) => applyInlineFormat(view, 'strike'), preventDefault: true },
    { key: 'Mod-Alt-m', run: wrapComment, preventDefault: true },
    { key: 'Mod-Shift-m', run: memoPanelToggleCommand, preventDefault: true },
    { key: 'Mod-Shift-t', run: insertTable, preventDefault: true },
    { key: 'Mod-Shift-c', run: insertCodeBlock, preventDefault: true },
    { key: 'Mod-Enter', run: toggleTask, preventDefault: true },
    {
      key: 'Mod-k',
      run: (view) => {
        const { from, to } = view.state.selection.main;
        const text = view.state.sliceDoc(from, to);
        const insert = `[${text}]()`;
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + insert.length - 1 },
        });
        return true;
      },
      preventDefault: true,
    },
    { key: 'Mod-1', run: (view) => setHeading(view, 1) },
    { key: 'Mod-2', run: (view) => setHeading(view, 2) },
    { key: 'Mod-3', run: (view) => setHeading(view, 3) },
    { key: 'Mod-4', run: (view) => setHeading(view, 4) },
    { key: 'Mod-5', run: (view) => setHeading(view, 5) },
    { key: 'Mod-6', run: (view) => setHeading(view, 6) },
  ]);
  return [tableKeys, mdKeys];
}
