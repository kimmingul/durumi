import { noticeFor, type NoticeAction, type ReconciliationNotice } from '@shared/reconciliation';
import { useReconciliationStore } from '../store/reconciliationStore';
import { t } from '../i18n/t';
import './ReconciliationSurface.css';

/**
 * 조정 알림의 **유일한** 렌더러.
 *
 * 표면 종류는 `banner`와 `status` 둘뿐이며(`NOTICE_PRESENTATIONS`) 그 union에
 * `modal`이 없으므로, 여기서 모달을 만들려면 먼저 shared의 타입을 넓혀야 한다.
 * 이 컴포넌트는 포커스를 옮기지 않는다 — 자동 포커스 속성도, 프로그램적
 * 포커스 호출도 쓰지 않고 `aria-live="polite"`로만 알린다. 조합 중 포커스를
 * 빼앗으면 한글 IME가 깨진다(REQ-WS-049).
 *
 * 조정 상태는 **문서별**이므로(SPEC-V03-WORKSPACE-002 M0) 어느 문서의 알림인지를
 * `path`로 받는다. 경로가 없거나 그 문서가 열려 있지 않으면 아무것도 렌더하지
 * 않는다.
 */

const MESSAGE_KEY: Record<ReconciliationNotice['status'], string> = {
  'held-composition': 'reconcile.pending',
  'held-notify': 'reconcile.external',
  'held-approval': 'reconcile.awaitingApproval',
  missing: 'reconcile.missing',
  'decode-error': 'reconcile.decodeError',
};

const ACTION_KEY: Record<NoticeAction, string> = {
  'view-diff': 'reconcile.action.viewDiff',
  'load-from-disk': 'reconcile.action.loadFromDisk',
  dismiss: 'reconcile.action.dismiss',
};

const ACTION_EVENT: Record<NoticeAction, 'user-view-diff' | 'user-load-from-disk' | 'user-dismiss'> = {
  'view-diff': 'user-view-diff',
  'load-from-disk': 'user-load-from-disk',
  dismiss: 'user-dismiss',
};

export interface ReconciliationSurfaceProps {
  /** 이 표면이 알림을 표시할 문서의 경로. */
  path: string | null;
}

export function ReconciliationSurface({ path }: ReconciliationSurfaceProps): JSX.Element | null {
  // `states.get(path)`를 직접 쓰지 않는다 — Map의 키는 경로 문자열이 아니라
  // 경로 대조 키이고(REQ-PANEL-051), 접는 규칙은 스토어가 소유한다.
  const state = useReconciliationStore((s) => s.stateFor(path));
  const dispatchFor = useReconciliationStore((s) => s.dispatchFor);

  const notice = state ? noticeFor(state) : null;
  if (!notice || path === null) return null;

  const message = t(MESSAGE_KEY[notice.status]);

  return (
    <div
      className={`reconcile-surface reconcile-surface--${notice.presentation}`}
      data-reconcile-surface={notice.presentation}
      data-reconcile-status={notice.status}
      role="status"
      aria-live="polite"
    >
      <span className="reconcile-surface__message">{message}</span>
      {notice.detail ? <span className="reconcile-surface__detail">{notice.detail}</span> : null}
      {notice.actions.length > 0 ? (
        <span className="reconcile-surface__actions">
          {notice.actions.map((action) => (
            <button
              key={action}
              type="button"
              data-action={action}
              onClick={() => dispatchFor(path, { type: ACTION_EVENT[action] })}
            >
              {t(ACTION_KEY[action])}
            </button>
          ))}
        </span>
      ) : null}
    </div>
  );
}
