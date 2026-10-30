import type { ConversationMessage } from '@shared/ai';
import type { LLMMessage } from './llm-provider';

/** Upper bound on past text per request, whatever the message limit is. */
export const MAX_HISTORY_CHARS = 48_000;
/** Upper bound on what is kept in memory or on disk. */
export const MAX_STORED_MESSAGES = 500;

export interface PromptOptions {
  systemPrompt: string;
  history: readonly ConversationMessage[];
  userText: string;
  maxHistoryMessages: number;
}

/** The newest messages that fit both limits, always starting on a user message. */
export function selectHistory(
  history: readonly ConversationMessage[],
  maxMessages: number,
  maxChars = MAX_HISTORY_CHARS,
): ConversationMessage[] {
  const selected: ConversationMessage[] = [];
  let chars = 0;
  for (let i = history.length - 1; i >= 0 && selected.length < maxMessages; i--) {
    const message = history[i]!;
    chars += message.content.length;
    if (chars > maxChars) break;
    selected.unshift(message);
  }
  while (selected[0] && selected[0].role !== 'user') selected.shift();
  return selected;
}

/**
 * Builds the messages for the model. Each piece of text keeps its own role:
 * the system prompt is the only system message, and text from the user or a
 * past answer can never become one, whatever it says.
 */
export function buildPrompt(options: PromptOptions): LLMMessage[] {
  const past = selectHistory(options.history, options.maxHistoryMessages);
  return [
    { role: 'system', content: options.systemPrompt },
    ...past.map(({ role, content }) => ({ role, content })),
    { role: 'user', content: options.userText },
  ];
}

export function trimStored(messages: readonly ConversationMessage[]): ConversationMessage[] {
  return messages.slice(-MAX_STORED_MESSAGES);
}
