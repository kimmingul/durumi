import { keymap } from '@codemirror/view';
import { Prec, type Extension } from '@codemirror/state';
import { toggleWrap } from './toggleWrap';
import { setHeading } from './setHeading';
import { insertTable } from './insertTable';
import { insertCodeBlock } from './insertCodeBlock';
import { toggleTask } from './toggleTask';
import { tableNextCell, tablePrevCell, tableExitDown, tableInsertRowBelow } from './table';

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
    { key: 'Mod-b', run: (view) => toggleWrap(view, '**'), preventDefault: true },
    { key: 'Mod-i', run: (view) => toggleWrap(view, '*'), preventDefault: true },
    { key: 'Mod-Shift-k', run: (view) => toggleWrap(view, '`'), preventDefault: true },
    { key: 'Mod-Shift-x', run: (view) => toggleWrap(view, '~~'), preventDefault: true },
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
