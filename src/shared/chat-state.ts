import type { AiErrorCode, ChatEvent, ConversationMessage } from './ai';
import type { ChatReply } from './ipc';

/**
 * The chat window's state as a pure reducer. Model text is only ever stored
 * here as a string for display.
 */
export type NoticeCode = AiErrorCode | Extract<ChatReply, { ok: false }>['error'] | 'save-failed';

export type UiMessage =
  | {
      kind: 'text';
      id: number;
      author: 'user' | 'companion';
      text: string;
      at: string;
      /** Only set on answers. */
      requestId?: string;
      status?: 'streaming' | 'cancelled' | 'failed';
    }
  | { kind: 'notice'; id: number; code: NoticeCode; detail?: string; model?: string; at: string };

export interface ChatState {
  messages: UiMessage[];
  /** True from sending until the answer ends. */
  busy: boolean;
  activeRequestId: string | null;
  /** Events can overtake the reply to `send`, so a late `started` must not re-activate. */
  lastFinishedRequestId: string | null;
  /** Model the current request was sent to, for the "not downloaded" hint. */
  activeModel: string;
  nextId: number;
}

export const INITIAL_CHAT_STATE: ChatState = {
  messages: [],
  busy: false,
  activeRequestId: null,
  lastFinishedRequestId: null,
  activeModel: '',
  nextId: 1,
};

export type ChatAction =
  | { type: 'load-history'; history: ConversationMessage[] }
  | { type: 'send'; text: string; at: string; model: string }
  | { type: 'started'; requestId: string }
  | { type: 'rejected'; code: NoticeCode; at: string }
  | { type: 'event'; event: ChatEvent; at: string }
  | { type: 'reset' };

function notice(
  state: ChatState,
  code: NoticeCode,
  at: string,
  extra: { detail?: string; model?: string } = {},
): ChatState {
  return {
    ...state,
    nextId: state.nextId + 1,
    messages: [...state.messages, { kind: 'notice', id: state.nextId, code, at, ...extra }],
  };
}

function applyDelta(state: ChatState, requestId: string, text: string, at: string): ChatState {
  const index = state.messages.findIndex((m) => m.kind === 'text' && m.requestId === requestId);
  if (index === -1) {
    return {
      ...state,
      activeRequestId: requestId,
      nextId: state.nextId + 1,
      messages: [
        ...state.messages,
        { kind: 'text', id: state.nextId, author: 'companion', text, at, requestId, status: 'streaming' },
      ],
    };
  }
  const messages = state.messages.slice();
  const current = messages[index] as Extract<UiMessage, { kind: 'text' }>;
  messages[index] = { ...current, text: current.text + text };
  return { ...state, messages };
}

function finish(state: ChatState, requestId: string, status?: 'cancelled' | 'failed'): ChatState {
  const messages = state.messages.map((m) => {
    if (m.kind !== 'text' || m.requestId !== requestId) return m;
    const next = { ...m };
    delete next.status;
    return status ? { ...next, status } : next;
  });
  return {
    ...state,
    messages,
    busy: false,
    activeRequestId: null,
    lastFinishedRequestId: requestId,
  };
}

function applyEvent(state: ChatState, event: ChatEvent, at: string): ChatState {
  const { requestId } = event;
  switch (event.type) {
    case 'delta':
      return applyDelta(state, requestId, event.text, at);
    case 'done': {
      const next = finish(state, requestId);
      return event.saveFailed ? notice(next, 'save-failed', at) : next;
    }
    case 'cancelled': {
      const next = finish(state, requestId, 'cancelled');
      return event.saveFailed ? notice(next, 'save-failed', at) : next;
    }
    case 'error':
      return notice(finish(state, requestId, 'failed'), event.code, at, {
        ...(event.detail ? { detail: event.detail } : {}),
        ...(event.code === 'model-not-found' ? { model: state.activeModel } : {}),
      });
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'load-history':
      return {
        ...INITIAL_CHAT_STATE,
        nextId: action.history.length + 1,
        messages: action.history.map((m, index) => ({
          kind: 'text',
          id: index + 1,
          author: m.role === 'user' ? 'user' : 'companion',
          text: m.content,
          at: m.at,
          ...(m.cancelled ? { status: 'cancelled' as const } : {}),
        })),
      };
    case 'send':
      return {
        ...state,
        busy: true,
        activeModel: action.model,
        nextId: state.nextId + 1,
        messages: [
          ...state.messages,
          { kind: 'text', id: state.nextId, author: 'user', text: action.text, at: action.at },
        ],
      };
    case 'started':
      if (action.requestId === state.lastFinishedRequestId) return state;
      return { ...state, activeRequestId: action.requestId };
    case 'rejected':
      return notice({ ...state, busy: false }, action.code, action.at);
    case 'event':
      return applyEvent(state, action.event, action.at);
    case 'reset':
      return { ...INITIAL_CHAT_STATE, nextId: state.nextId };
  }
}
