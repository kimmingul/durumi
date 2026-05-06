import type { BrowserWindow, IpcMain } from 'electron';

/**
 * Routes window close through the renderer so it can prompt Save/Discard/Cancel
 * for dirty documents. The first close attempt is intercepted; the renderer
 * replies with a boolean and we either destroy or leave the window alone.
 *
 * Without this, the renderer's beforeunload handler can only cancel the close
 * (silently), which made Cmd+W on a dirty buffer appear to do nothing.
 */
export function attachCloseGuard(win: BrowserWindow, ipc: IpcMain): void {
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

    ipc.once(channel, (_evt, allow: unknown) => {
      pending = false;
      if (allow === true && !win.isDestroyed()) {
        forceClose = true;
        win.close();
      }
    });

    win.webContents.send('app:requestClose', reqId);
  });

  win.once('closed', () => {
    // No further responses are meaningful; ipcMain.once would self-clean on
    // reply, but if the window dies first we drop the listener manually.
    // (Channel name is unique per request, so leftover listeners are bounded.)
  });
}

let counter = 0;
function nextReqId(): number {
  counter = (counter + 1) | 0;
  return counter;
}
