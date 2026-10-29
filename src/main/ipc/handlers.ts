import { app } from 'electron';
import { IPC, type AppInfo, type ChatReply } from '@shared/ipc';
import { isEmptyPayload, parseChatRequest, parseScreenPoint } from '@shared/validation';
import type { WindowManager } from '../windows/window-manager';
import type { IpcRouter } from './router';
import { log } from '../log';

export function registerIpcHandlers(router: IpcRouter, windows: WindowManager): void {
  router.on(IPC.avatarDragStart, (_role, args) => {
    const point = parseScreenPoint(args[0]);
    if (point && args.length === 1) windows.dragStart(point);
  });

  router.on(IPC.avatarDragMove, (_role, args) => {
    const point = parseScreenPoint(args[0]);
    if (point && args.length === 1) windows.dragMove(point);
  });

  router.on(IPC.avatarDragEnd, (_role, args) => {
    if (isEmptyPayload(args)) windows.dragEnd();
  });

  router.on(IPC.avatarHide, (_role, args) => {
    if (isEmptyPayload(args)) windows.hideAvatar();
  });

  router.on(IPC.chatOpen, (_role, args) => {
    if (isEmptyPayload(args)) void windows.openChat();
  });

  router.on(IPC.chatClose, (_role, args) => {
    if (isEmptyPayload(args)) windows.closeChat();
  });

  router.handle<ChatReply>(
    IPC.chatSend,
    (_role, args) => {
      const request = args.length === 1 ? parseChatRequest(args[0]) : null;
      if (!request) return { ok: false, error: 'invalid-input' };
      log.info('chat message received', { length: request.text.length });
      // Stage 3 wires this to the local LLM. Until then, report the real status.
      return { ok: true, status: 'ai-not-connected', text: '' };
    },
    { ok: false, error: 'internal' },
  );

  router.handle<AppInfo | null>(
    IPC.appGetInfo,
    (_role, args) => {
      if (!isEmptyPayload(args)) return null;
      return {
        version: app.getVersion(),
        platform: process.platform,
        electron: process.versions.electron ?? 'unknown',
      };
    },
    null,
  );
}
