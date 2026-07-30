import { showToast } from '../store/toastStore';
import { t } from '../i18n/t';

/**
 * 가드되지 않은 promise 거부를 사용자에게 보이게 만든다.
 *
 * main 프로세스 핸들러 상당수는 `{ ok: false, ... }` 결과 객체를 돌려주지만
 * `assertAllowedPath`처럼 throw하는 것도 있다. 그 경우 `ipcRenderer.invoke`가
 * 거부되는데, 렌더러에는 이를 잡는 공통 지점이 없어(가드되지 않은 await가
 * 여럿) 실패가 조용히 사라졌다. 여기서 마지막 그물을 친다.
 *
 * 토스트 인프라(`toastStore`)는 이미 있었으나 실제 에러 경로에서는 단 한
 * 곳(`useAiPalette`)에서만 쓰였다 — 나머지는 `window.alert` 또는 무음 삼킴.
 */

/** 같은 실패가 반복될 때 토스트가 쌓이지 않도록 하는 창(ms). */
const DEDUPE_WINDOW_MS = 3_000;

function messageOf(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === 'string') return reason;
  if (reason && typeof reason === 'object' && 'message' in reason) {
    const m = (reason as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

/**
 * 전역 에러 그물을 설치한다. 반환된 함수를 호출하면 제거된다.
 * 앱 시작 시 한 번만 호출한다 (`src/main.tsx`).
 */
export function installGlobalErrorSurface(): () => void {
  let lastMessage: string | null = null;
  let lastAt = 0;

  const onRejection = (ev: Event): void => {
    const reason = (ev as Event & { reason?: unknown }).reason;
    const message = messageOf(reason);
    // Date.now()는 테스트에서도 안전하다 — 단조 비교에만 쓴다.
    const now = Date.now();
    if (message === lastMessage && now - lastAt < DEDUPE_WINDOW_MS) return;
    lastMessage = message;
    lastAt = now;
    showToast({ message: t('app.error.unhandled', { message }) });
  };

  window.addEventListener('unhandledrejection', onRejection);
  return () => window.removeEventListener('unhandledrejection', onRejection);
}
