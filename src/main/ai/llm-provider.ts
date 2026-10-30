import type { AiErrorCode, ModelInfo } from '@shared/ai';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMChatRequest {
  model: string;
  messages: LLMMessage[];
  /** Longest wait for the next chunk, including the first. */
  timeoutMs: number;
  signal?: AbortSignal;
}

export type LLMErrorCode = Exclude<AiErrorCode, 'no-model'> | 'cancelled';

export class LLMError extends Error {
  constructor(
    readonly code: LLMErrorCode,
    message: string,
    /** Text from the server, safe to show as plain text only. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/**
 * What the AI core needs from a model backend. Output is plain text: nothing
 * a provider yields is ever interpreted as an instruction by the app.
 */
export interface LLMProvider {
  readonly id: string;
  getVersion(signal?: AbortSignal): Promise<string>;
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
  /** Yields text chunks; throws LLMError on failure, including cancellation. */
  streamChat(request: LLMChatRequest): AsyncIterable<string>;
}
