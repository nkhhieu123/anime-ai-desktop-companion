import {
  AI_LIMITS,
  type AiSettings,
  type ChatEvent,
  type ConnectionReport,
  type ConversationMessage,
} from './ai';

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
  chatCancel: 'chat:cancel',
  chatGetHistory: 'chat:get-history',
  chatClear: 'chat:clear',
  aiGetSettings: 'ai:get-settings',
  aiUpdateSettings: 'ai:update-settings',
  aiCheckConnection: 'ai:check-connection',
  appGetInfo: 'app:get-info',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** Main to renderer only; renderers can listen but never send on it. */
export const CHAT_EVENT_CHANNEL = 'chat:event';

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
  [IPC.chatCancel]: ['chat'],
  [IPC.chatGetHistory]: ['chat'],
  [IPC.chatClear]: ['chat'],
  [IPC.aiGetSettings]: ['chat'],
  [IPC.aiUpdateSettings]: ['chat'],
  [IPC.aiCheckConnection]: ['chat'],
  [IPC.appGetInfo]: ['avatar', 'chat'],
};

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Hard cap for any IPC message; the user's own, lower limit lives in AiSettings. */
export const CHAT_MESSAGE_MAX_LENGTH = AI_LIMITS.maxInputChars.max;

export interface ChatRequest {
  text: string;
}

/** The answer itself arrives as ChatEvents with this requestId. */
export type ChatReply =
  | { ok: true; requestId: string }
  | { ok: false; error: 'invalid-input' | 'busy' | 'too-long' | 'internal' };

export type AiSettingsUpdate =
  | { ok: true; settings: AiSettings }
  | { ok: false; field: string };

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
    cancel(requestId: string): void;
    getHistory(): Promise<ConversationMessage[]>;
    clear(): Promise<void>;
    /** Returns the function that stops listening. */
    onEvent(listener: (event: ChatEvent) => void): () => void;
    close(): void;
  };
  ai: {
    getSettings(): Promise<AiSettings | null>;
    updateSettings(patch: Partial<AiSettings>): Promise<AiSettingsUpdate>;
    checkConnection(): Promise<ConnectionReport>;
  };
  app: {
    getInfo(): Promise<AppInfo | null>;
  };
}
