/**
 * Phase 3.2 — floating action toolbar that appears on table-cell hover.
 *
 * Six buttons positioned around the hovered cell:
 *  - +↑ row above   (top-left)
 *  - +↓ row below   (bottom-left)
 *  - +← col left    (left edge)
 *  - +→ col right   (right edge)
 *  - 🗑 row         (top-right, delete row)
 *  - 🗑 col         (bottom-right, delete column)
 *
 * The component itself is positioned absolutely by its parent (a portal
 * inside the EditorView contentDOM) — this component only renders the
 * inner button grid. Its parent reads the cell's `getBoundingClientRect`
 * and positions us via inline `style.transform`.
 *
 * Buttons emit logical actions via the `onAction` callback. Edge-guard
 * disabling (e.g. delete-only-row, delete-only-col) is reflected via the
 * `canRemoveRow` / `canRemoveCol` props — a disabled button still
 * renders but cannot be clicked.
 */
import type { ReactElement } from 'react';
import { t } from '../i18n/t';

export type TableCellAction =
  | 'rowAbove'
  | 'rowBelow'
  | 'colLeft'
  | 'colRight'
  | 'rowDelete'
  | 'colDelete';

interface Props {
  /** Whether the delete-row button should be enabled. */
  canRemoveRow: boolean;
  /** Whether the delete-col button should be enabled. */
  canRemoveCol: boolean;
  /** Whether row-above is enabled (false for header). */
  canAddRowAbove: boolean;
  onAction: (action: TableCellAction) => void;
}

const SIZE = 18;

function iconRowAbove(): ReactElement {
  // arrow up + horizontal line
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 4v10" />
      <path d="M8 8l4-4 4 4" />
      <path d="M4 18h16" />
    </svg>
  );
}

function iconRowBelow(): ReactElement {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 6h16" />
      <path d="M12 10v10" />
      <path d="M8 16l4 4 4-4" />
    </svg>
  );
}

function iconColLeft(): ReactElement {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M18 4v16" />
      <path d="M10 12H4" />
      <path d="M8 8l-4 4 4 4" />
    </svg>
  );
}

function iconColRight(): ReactElement {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M6 4v16" />
      <path d="M14 12h6" />
      <path d="M16 8l4 4-4 4" />
    </svg>
  );
}

function iconTrash(): ReactElement {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

interface BtnProps {
  testId: string;
  ariaKey: string;
  enabled: boolean;
  onClick: () => void;
  className: string;
  children: ReactElement;
}

function ActionBtn({ testId, ariaKey, enabled, onClick, className, children }: BtnProps): ReactElement {
  const label = t(ariaKey);
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      disabled={!enabled}
      className={'cm-table-action-btn ' + className + (enabled ? '' : ' cm-table-action-btn-disabled')}
      // Prevent the mousedown from blurring the cell — focus must stay
      // for the post-action focus-restore queue to do the right thing.
      onMouseDown={(e) => {
        e.preventDefault();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!enabled) return;
        onClick();
      }}
    >
      {children}
    </button>
  );
}

export function TableCellActions({
  canRemoveRow,
  canRemoveCol,
  canAddRowAbove,
  onAction,
}: Props): ReactElement {
  return (
    <div className="cm-table-cell-actions" role="group" aria-label="Table cell actions">
      <ActionBtn
        testId="table-action-row-above"
        ariaKey="table.action.rowAbove"
        enabled={canAddRowAbove}
        onClick={() => onAction('rowAbove')}
        className="cm-table-action-row-above"
      >
        {iconRowAbove()}
      </ActionBtn>
      <ActionBtn
        testId="table-action-row-below"
        ariaKey="table.action.rowBelow"
        enabled={true}
        onClick={() => onAction('rowBelow')}
        className="cm-table-action-row-below"
      >
        {iconRowBelow()}
      </ActionBtn>
      <ActionBtn
        testId="table-action-col-left"
        ariaKey="table.action.colLeft"
        enabled={true}
        onClick={() => onAction('colLeft')}
        className="cm-table-action-col-left"
      >
        {iconColLeft()}
      </ActionBtn>
      <ActionBtn
        testId="table-action-col-right"
        ariaKey="table.action.colRight"
        enabled={true}
        onClick={() => onAction('colRight')}
        className="cm-table-action-col-right"
      >
        {iconColRight()}
      </ActionBtn>
      <ActionBtn
        testId="table-action-row-delete"
        ariaKey="table.action.rowDelete"
        enabled={canRemoveRow}
        onClick={() => onAction('rowDelete')}
        className="cm-table-action-row-delete"
      >
        {iconTrash()}
      </ActionBtn>
      <ActionBtn
        testId="table-action-col-delete"
        ariaKey="table.action.colDelete"
        enabled={canRemoveCol}
        onClick={() => onAction('colDelete')}
        className="cm-table-action-col-delete"
      >
        {iconTrash()}
      </ActionBtn>
    </div>
  );
}

export default TableCellActions;
