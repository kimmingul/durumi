import type { BrowserWindow, IpcMain } from 'electron';

export interface CloseGuardOptions {
  /** Called when the renderer denies, times out, or never responds. */
  onCancel?: () => void;
  /**
   * If the renderer doesn't respond within this many ms, treat the close as
   * cancelled so the window doesn't get permanently stuck in `pending`.
   * Defaults to 30s (covers a slow user reading a Save? dialog).
   */
  timeoutMs?: number;
}

/**
 * Routes window close through the renderer so it can prompt Save/Discard/Cancel
 * for dirty documents. The first close attempt is intercepted; the renderer
 * replies with a boolean and we either destroy or leave the window alone.
 *
 * Without this, the renderer's beforeunload handler can only cancel the close
 * (silently), which made Cmd+W on a dirty buffer appear to do nothing.
 *
 * Resilience: a timeout fires onCancel if the renderer never replies (e.g.
 * close issued before React mounted the handler, or webContents hung), so the
 * window doesn't end up stuck in a pending state with all subsequent close
 * attempts no-op'd.
 */
export function attachCloseGuard(
  win: BrowserWindow,
  ipc: IpcMain,
  opts: CloseGuardOptions = {},
): void {
  const { onCancel, timeoutMs = 30_000 } = opts;
  let forceClose = false;
  let pending = false;

  win.on('close', (e) => {
    if (forceClose) return;
    e.preventDefault();
    if (pending) return;
    if (win.webContents.isDestroyed()) return;

    pending = true;
    const reqId = nextReqId();
    const channel = `app:closeResponse:${reqId}`;
    let settled = false;

    const settle = (allow: boolean) => {
      if (settled) return;
      settled = true;
      pending = false;
      clearTimeout(timer);
      ipc.removeListener(channel, listener);
      if (allow && !win.isDestroyed()) {
        forceClose = true;
        win.close();
      } else {
        onCancel?.();
      }
    };

    const listener = (_evt: unknown, allow: unknown) => settle(allow === true);
    const timer = setTimeout(() => settle(false), timeoutMs);

    ipc.once(channel, listener);
    win.webContents.send('app:requestClose', reqId);
  });
}

let counter = 0;
function nextReqId(): number {
  counter = (counter + 1) | 0;
  return counter;
}
