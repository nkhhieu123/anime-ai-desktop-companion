/**
 * IPC contract shared by main, preload and renderer.
 * Every channel is listed here; main rejects anything else.
 */
export const IPC = {
  avatarDragStart: 'avatar:drag-start',
  avatarDragMove: 'avatar:drag-move',
  avatarDragEnd: 'avatar:drag-end',
  avatarHide: 'avatar:hide',
  chatOpen: 'chat:open',
  chatClose: 'chat:close',
  chatSend: 'chat:send',
  appGetInfo: 'app:get-info',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** Which window is allowed to use a channel. */
export type WindowRole = 'avatar' | 'chat';

export const CHANNEL_ROLES: Record<IpcChannel, readonly WindowRole[]> = {
  [IPC.avatarDragStart]: ['avatar'],
  [IPC.avatarDragMove]: ['avatar'],
  [IPC.avatarDragEnd]: ['avatar'],
  [IPC.avatarHide]: ['avatar'],
  [IPC.chatOpen]: ['avatar'],
  [IPC.chatClose]: ['chat'],
  [IPC.chatSend]: ['chat'],
  [IPC.appGetInfo]: ['avatar', 'chat'],
};

export interface ScreenPoint {
  x: number;
  y: number;
}

export const CHAT_MESSAGE_MAX_LENGTH = 4000;

export interface ChatRequest {
  text: string;
}

export type ChatReply =
  | { ok: true; status: 'ai-not-connected'; text: string }
  | { ok: false; error: 'invalid-input' | 'internal' };

export interface AppInfo {
  version: string;
  platform: string;
  electron: string;
}

/** The API exposed on `window.companion` by the preload script. */
export interface CompanionApi {
  avatar: {
    dragStart(point: ScreenPoint): void;
    dragMove(point: ScreenPoint): void;
    dragEnd(): void;
    hide(): void;
    openChat(): void;
  };
  chat: {
    send(request: ChatRequest): Promise<ChatReply>;
    close(): void;
  };
  app: {
    getInfo(): Promise<AppInfo | null>;
  };
}
