import { randomUUID } from 'node:crypto';
import {
  parseAiSettingsPatch,
  type AiErrorCode,
  type AiSettings,
  type AiSettingsPatchResult,
  type ChatEvent,
  type ConnectionReport,
  type ConversationMessage,
} from '@shared/ai';
import { buildPrompt, trimStored } from './conversation';
import { LLMError, type LLMProvider } from './llm-provider';
import { buildSystemPrompt } from './system-prompt';
import type { ConversationStore, SettingsStore } from './stores';
import { log } from '../log';

export interface AiServiceDeps {
  settingsStore: SettingsStore;
  conversationStore: ConversationStore;
  createProvider(endpoint: string): LLMProvider;
  uiLocale: string;
  /** Where chat events go; set by whoever owns the chat window. */
  emit(event: ChatEvent): void;
}

export type SendResult =
  | { ok: true; requestId: string }
  | { ok: false; error: 'busy' | 'too-long' };

/**
 * Orchestrates one conversation. Model output only ever flows to `emit` and
 * to the history as text; no code path here acts on what it says.
 */
export class AiService {
  private settings!: AiSettings;
  private history: ConversationMessage[] = [];
  private active: { requestId: string; controller: AbortController; finished: Promise<void> } | null = null;

  constructor(private readonly deps: AiServiceDeps) {}

  async init(): Promise<void> {
    this.settings = await this.deps.settingsStore.load();
    // Only read what was deliberately saved: the file is ignored while saving is off.
    this.history = this.settings.persistConversations ? await this.deps.conversationStore.load() : [];
  }

  getSettings(): AiSettings {
    return { ...this.settings };
  }

  getHistory(): ConversationMessage[] {
    return this.history.map((message) => ({ ...message }));
  }

  async updateSettings(input: unknown): Promise<AiSettingsPatchResult> {
    const parsed = parseAiSettingsPatch(input);
    if (!parsed.ok) return parsed;
    const wasPersisting = this.settings.persistConversations;
    const next = { ...this.settings, ...parsed.patch };
    // Save first: if this throws, the running settings still match the file.
    await this.deps.settingsStore.save(next);
    this.settings = next;
    if (wasPersisting && !this.settings.persistConversations) {
      await this.deps.conversationStore.clear();
    } else if (!wasPersisting && this.settings.persistConversations) {
      await this.deps.conversationStore.save(this.history);
    }
    return parsed;
  }

  async clearHistory(): Promise<void> {
    this.cancelAll();
    await this.active?.finished;
    this.history = [];
    await this.deps.conversationStore.clear();
  }

  async checkConnection(): Promise<ConnectionReport> {
    const provider = this.deps.createProvider(this.settings.endpoint);
    try {
      const version = await provider.getVersion();
      const models = await provider.listModels();
      return {
        status: 'ok',
        version,
        models,
        selectedModelInstalled: models.some((model) => model.name === this.settings.model),
      };
    } catch (error) {
      const code = error instanceof LLMError ? error.code : 'connection';
      if (code === 'timeout') return { status: 'timeout' };
      if (code === 'connection') return { status: 'unreachable' };
      return { status: 'bad-response', detail: error instanceof LLMError ? error.detail : undefined };
    }
  }

  /** Returns at once; the answer arrives through `emit`. */
  send(text: string): SendResult {
    if (this.active) return { ok: false, error: 'busy' };
    if (text.length > this.settings.maxInputChars) return { ok: false, error: 'too-long' };

    const requestId = randomUUID();
    const controller = new AbortController();
    const finished = this.run(requestId, text, controller.signal)
      .catch((error: unknown) => log.error('chat request failed', { error: String(error) }))
      .finally(() => {
        this.active = null;
      });
    this.active = { requestId, controller, finished };
    return { ok: true, requestId };
  }

  cancel(requestId: string): void {
    if (this.active?.requestId === requestId) this.active.controller.abort();
  }

  cancelAll(): void {
    this.active?.controller.abort();
  }

  private async run(requestId: string, userText: string, signal: AbortSignal): Promise<void> {
    const { emit } = this.deps;
    const fail = (code: AiErrorCode, detail?: string) =>
      emit({ requestId, type: 'error', code, ...(detail ? { detail } : {}) });

    // Yield first, so `active` is set before anything can finish.
    await Promise.resolve();

    const { model, endpoint, timeoutMs, maxHistoryMessages, responseLanguage } = this.settings;
    if (!model) return fail('no-model');

    const startedAt = new Date().toISOString();
    const messages = buildPrompt({
      systemPrompt: buildSystemPrompt(responseLanguage, this.deps.uiLocale),
      history: this.history,
      userText,
      maxHistoryMessages,
    });

    let answer = '';
    try {
      const stream = this.deps.createProvider(endpoint).streamChat({ model, messages, timeoutMs, signal });
      for await (const text of stream) {
        answer += text;
        emit({ requestId, type: 'delta', text });
      }
    } catch (error) {
      const llmError = error instanceof LLMError ? error : new LLMError('provider-error', String(error));
      if (llmError.code !== 'cancelled') {
        // A failed turn stays out of the history, so a retry does not repeat it.
        log.warn('chat request failed', { code: llmError.code });
        return fail(llmError.code, llmError.detail);
      }
      if (!answer.trim()) return emit({ requestId, type: 'cancelled', saveFailed: false });
      const saveFailed = await this.commit(userText, startedAt, answer, true);
      return emit({ requestId, type: 'cancelled', saveFailed });
    }

    const saveFailed = await this.commit(userText, startedAt, answer, false);
    emit({ requestId, type: 'done', saveFailed });
  }

  /** Adds a finished turn to the history. Returns true if saving it failed. */
  private async commit(
    userText: string,
    at: string,
    answer: string,
    cancelled: boolean,
  ): Promise<boolean> {
    this.history = trimStored([
      ...this.history,
      { role: 'user', content: userText, at },
      {
        role: 'assistant',
        content: answer,
        at: new Date().toISOString(),
        ...(cancelled ? { cancelled: true } : {}),
      },
    ]);
    if (!this.settings.persistConversations) return false;
    try {
      await this.deps.conversationStore.save(this.history);
      return false;
    } catch (error) {
      log.error('could not save conversation', { error: String(error) });
      return true;
    }
  }
}
