import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron';
import type { IpcChannel, WindowRole } from '@shared/ipc';
import { authorizeSender } from '../security/sender';
import { log } from '../log';

export interface RouterDeps {
  roleOf(contents: WebContents): WindowRole | null;
  isTrustedUrl(url: string): boolean;
}

type Event = IpcMainEvent | IpcMainInvokeEvent;

/**
 * Every IPC handler goes through here: the sender must be the main frame of
 * a known app window, loaded from a trusted URL, and allowed to use the
 * channel. Rejected messages are logged and dropped.
 */
export class IpcRouter {
  private readonly channels: IpcChannel[] = [];

  constructor(private readonly deps: RouterDeps) {}

  private check(channel: IpcChannel, event: Event): WindowRole | null {
    const frame = event.senderFrame;
    const decision = authorizeSender(
      {
        channel,
        role: this.deps.roleOf(event.sender),
        frameUrl: frame?.url ?? null,
        isMainFrame: !!frame && frame.parent === null,
      },
      this.deps.isTrustedUrl,
    );
    if (!decision.allowed) {
      log.warn('rejected ipc', { channel, reason: decision.reason });
      return null;
    }
    return decision.role;
  }

  /** Fire-and-forget channel (ipcRenderer.send). */
  on(channel: IpcChannel, handler: (role: WindowRole, args: unknown[]) => void): void {
    this.channels.push(channel);
    ipcMain.on(channel, (event, ...args: unknown[]) => {
      const role = this.check(channel, event);
      if (!role) return;
      try {
        handler(role, args);
      } catch (error) {
        log.error('ipc handler failed', { channel, error: String(error) });
      }
    });
  }

  /** Request/response channel (ipcRenderer.invoke). */
  handle<T>(
    channel: IpcChannel,
    handler: (role: WindowRole, args: unknown[]) => Promise<T> | T,
    rejected: T,
  ): void {
    this.channels.push(channel);
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      const role = this.check(channel, event);
      if (!role) return rejected;
      return handler(role, args);
    });
  }

  dispose(): void {
    for (const channel of this.channels) {
      ipcMain.removeAllListeners(channel);
      ipcMain.removeHandler(channel);
    }
    this.channels.length = 0;
  }
}
