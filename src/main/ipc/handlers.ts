import { app } from 'electron';
import type { AiSettings, ConnectionReport, ConversationMessage } from '@shared/ai';
import { IPC, type AiSettingsUpdate, type AppInfo, type ChatReply } from '@shared/ipc';
import { isEmptyPayload, parseChatRequest, parseRequestId, parseScreenPoint } from '@shared/validation';
import type { AiService } from '../ai/ai-service';
import type { WindowManager } from '../windows/window-manager';
import type { IpcRouter } from './router';

export function registerIpcHandlers(
  router: IpcRouter,
  windows: WindowManager,
  ai: AiService,
): void {
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
      // Message text is deliberately never logged.
      return ai.send(request.text);
    },
    { ok: false, error: 'internal' },
  );

  router.on(IPC.chatCancel, (_role, args) => {
    const requestId = args.length === 1 ? parseRequestId(args[0]) : null;
    if (requestId) ai.cancel(requestId);
  });

  router.handle<ConversationMessage[]>(
    IPC.chatGetHistory,
    (_role, args) => (isEmptyPayload(args) ? ai.getHistory() : []),
    [],
  );

  router.handle<void>(
    IPC.chatClear,
    async (_role, args) => {
      if (isEmptyPayload(args)) await ai.clearHistory();
    },
    undefined,
  );

  router.handle<AiSettings | null>(
    IPC.aiGetSettings,
    (_role, args) => (isEmptyPayload(args) ? ai.getSettings() : null),
    null,
  );

  router.handle<AiSettingsUpdate>(
    IPC.aiUpdateSettings,
    async (_role, args) => {
      const result = await ai.updateSettings(args.length === 1 ? args[0] : null);
      return result.ok ? { ok: true, settings: ai.getSettings() } : result;
    },
    { ok: false, field: '*' },
  );

  router.handle<ConnectionReport>(
    IPC.aiCheckConnection,
    (_role, args) => (isEmptyPayload(args) ? ai.checkConnection() : { status: 'bad-response' }),
    { status: 'bad-response' },
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
