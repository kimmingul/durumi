import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { attachCloseGuard } from '../../electron/closeGuard';

type IpcReplyHandler = (event: unknown, ...args: unknown[]) => void;

class FakeIpcMain {
  private once_handlers = new Map<string, IpcReplyHandler>();
  once(channel: string, listener: IpcReplyHandler) {
    this.once_handlers.set(channel, listener);
    return this;
  }
  removeListener(channel: string, _listener: IpcReplyHandler) {
    this.once_handlers.delete(channel);
    return this;
  }
  reply(channel: string, ...args: unknown[]) {
    const h = this.once_handlers.get(channel);
    if (!h) throw new Error(`no handler for ${channel}`);
    this.once_handlers.delete(channel);
    h({}, ...args);
  }
  hasHandler(channel: string) {
    return this.once_handlers.has(channel);
  }
}

interface SentMessage {
  channel: string;
  reqId: number;
}

class FakeBrowserWindow extends EventEmitter {
  destroyed = false;
  closeCalls = 0;
  sent: SentMessage[] = [];
  webContents = {
    isDestroyed: () => this.destroyed,
    send: (channel: string, reqId: number) => {
      this.sent.push({ channel, reqId });
    },
  };
  isDestroyed() { return this.destroyed; }
  // close() simulates the OS firing a 'close' event again (forceClose path).
  close() {
    this.closeCalls++;
    const e = makeEvent();
    this.emit('close', e);
    if (!e.defaultPrevented) this.destroyed = true;
  }
}

function makeEvent() {
  let prevented = false;
  return {
    preventDefault() { prevented = true; },
    get defaultPrevented() { return prevented; },
  };
}

function attach(opts: Parameters<typeof attachCloseGuard>[2] = {}) {
  const win = new FakeBrowserWindow();
  const ipc = new FakeIpcMain();
  attachCloseGuard(win as never, ipc as never, opts);
  return { win, ipc };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('attachCloseGuard', () => {
  it('preventDefaults the first close and forwards a request to the renderer', () => {
    const { win } = attach();
    const e = makeEvent();
    win.emit('close', e);
    expect(e.defaultPrevented).toBe(true);
    expect(win.sent).toHaveLength(1);
    expect(win.sent[0]?.channel).toBe('app:requestClose');
    expect(win.destroyed).toBe(false);
  });

  it('closes the window when the renderer allows', () => {
    const { win, ipc } = attach();
    win.emit('close', makeEvent());
    const reqId = win.sent[0]!.reqId;
    ipc.reply(`app:closeResponse:${reqId}`, true);
    // close() re-fires the close event; in the second pass forceClose is set.
    expect(win.closeCalls).toBe(1);
    expect(win.destroyed).toBe(true);
  });

  it('keeps the window open when the renderer denies', () => {
    const { win, ipc } = attach();
    win.emit('close', makeEvent());
    const reqId = win.sent[0]!.reqId;
    ipc.reply(`app:closeResponse:${reqId}`, false);
    expect(win.closeCalls).toBe(0);
    expect(win.destroyed).toBe(false);
  });

  it('coalesces overlapping close attempts into a single renderer round-trip', () => {
    const { win } = attach();
    win.emit('close', makeEvent());
    win.emit('close', makeEvent());
    win.emit('close', makeEvent());
    expect(win.sent).toHaveLength(1);
  });

  it('asks again after a denial', () => {
    const { win, ipc } = attach();
    win.emit('close', makeEvent());
    const firstReq = win.sent[0]!.reqId;
    ipc.reply(`app:closeResponse:${firstReq}`, false);
    win.emit('close', makeEvent());
    expect(win.sent).toHaveLength(2);
    expect(win.sent[1]!.reqId).not.toBe(firstReq);
  });

  it('does nothing when webContents is already destroyed', () => {
    const { win } = attach();
    win.destroyed = true;
    const e = makeEvent();
    win.emit('close', e);
    expect(e.defaultPrevented).toBe(true);
    expect(win.sent).toHaveLength(0);
  });

  it('invokes onCancel when the renderer denies', () => {
    const onCancel = vi.fn();
    const { win, ipc } = attach({ onCancel });
    win.emit('close', makeEvent());
    const reqId = win.sent[0]!.reqId;
    ipc.reply(`app:closeResponse:${reqId}`, false);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('times out and cancels when the renderer never responds', () => {
    const onCancel = vi.fn();
    const { win } = attach({ onCancel, timeoutMs: 1000 });
    win.emit('close', makeEvent());
    expect(onCancel).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onCancel).toHaveBeenCalledTimes(1);
    // After a timeout the next close attempt must be allowed to proceed —
    // otherwise the window stays permanently stuck.
    win.emit('close', makeEvent());
    expect(win.sent).toHaveLength(2);
  });

  it('does not fire onCancel when the renderer allows the close', () => {
    const onCancel = vi.fn();
    const { win, ipc } = attach({ onCancel });
    win.emit('close', makeEvent());
    const reqId = win.sent[0]!.reqId;
    ipc.reply(`app:closeResponse:${reqId}`, true);
    expect(onCancel).not.toHaveBeenCalled();
    expect(win.destroyed).toBe(true);
  });

  it('clears the timeout once the renderer replies', () => {
    const onCancel = vi.fn();
    const { win, ipc } = attach({ onCancel, timeoutMs: 1000 });
    win.emit('close', makeEvent());
    const reqId = win.sent[0]!.reqId;
    ipc.reply(`app:closeResponse:${reqId}`, false);
    expect(onCancel).toHaveBeenCalledTimes(1);
    // Advancing past the timeout must NOT fire onCancel again.
    vi.advanceTimersByTime(2000);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
