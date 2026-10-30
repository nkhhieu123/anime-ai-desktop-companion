import { parseLoopbackEndpoint, type ModelInfo } from '@shared/ai';
import { LLMError, type LLMChatRequest, type LLMProvider } from './llm-provider';

const METADATA_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_CHARS = 200_000;
const MAX_LINE_CHARS = 1_000_000;
const MAX_DETAIL_CHARS = 300;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimDetail(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text ? text.slice(0, MAX_DETAIL_CHARS) : undefined;
}

/** Local server: https://github.com/ollama/ollama/blob/main/docs/api.md */
export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama';
  private readonly endpoint: string;

  constructor(endpoint: string) {
    const parsed = parseLoopbackEndpoint(endpoint);
    if (!parsed) throw new Error('Ollama endpoint must be a loopback http URL');
    this.endpoint = parsed;
  }

  async getVersion(signal?: AbortSignal): Promise<string> {
    const body = await this.getJson('/api/version', signal);
    if (!isRecord(body) || typeof body.version !== 'string') {
      throw new LLMError('bad-response', 'unexpected /api/version body');
    }
    return body.version;
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const body = await this.getJson('/api/tags', signal);
    if (!isRecord(body) || !Array.isArray(body.models)) {
      throw new LLMError('bad-response', 'unexpected /api/tags body');
    }
    const models: ModelInfo[] = [];
    for (const entry of body.models) {
      if (isRecord(entry) && typeof entry.name === 'string') {
        models.push({
          name: entry.name,
          sizeBytes: typeof entry.size === 'number' ? entry.size : null,
        });
      }
    }
    return models;
  }

  async *streamChat(request: LLMChatRequest): AsyncGenerator<string> {
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const armTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, request.timeoutMs);
    };
    const onCallerAbort = () => controller.abort();
    if (request.signal?.aborted) throw new LLMError('cancelled', 'cancelled before start');
    request.signal?.addEventListener('abort', onCallerAbort, { once: true });

    const toLLMError = (error: unknown): LLMError => {
      if (error instanceof LLMError) return error;
      if (timedOut) return new LLMError('timeout', `no data for ${request.timeoutMs} ms`);
      if (request.signal?.aborted) return new LLMError('cancelled', 'cancelled');
      return new LLMError('connection', `cannot reach Ollama: ${String(error)}`);
    };

    try {
      armTimer();
      const response = await fetch(`${this.endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: request.model, messages: request.messages, stream: true }),
        signal: controller.signal,
        // Loopback only: a local server must not be able to bounce the prompt elsewhere.
        redirect: 'error',
      });

      if (!response.ok) throw await this.httpError(response);
      if (!response.body) throw new LLMError('bad-response', 'response has no body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let total = 0;
      let hasText = false;
      let finished = false;

      try {
        while (!finished) {
          armTimer();
          const { done, value } = await reader.read();
          // `stream: true` keeps a multi-byte character split across chunks intact.
          buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
          if (buffer.length > MAX_LINE_CHARS) {
            throw new LLMError('bad-response', 'oversized line in stream');
          }

          const lines = buffer.split('\n');
          buffer = done ? '' : (lines.pop() ?? '');

          for (const line of lines) {
            if (!line.trim()) continue;
            const chunk = parseStreamLine(line);
            if (chunk.text) {
              total += chunk.text.length;
              if (total > MAX_RESPONSE_CHARS) {
                throw new LLMError('response-too-long', 'response exceeded the size limit');
              }
              if (chunk.text.trim()) hasText = true;
              yield chunk.text;
              armTimer();
            }
            if (chunk.done) finished = true;
          }

          if (done && !finished) {
            throw new LLMError('bad-response', 'stream ended before the model finished');
          }
        }
      } finally {
        // Also runs when the consumer stops iterating: stops generation on the server.
        await reader.cancel().catch(() => undefined);
      }

      if (!hasText) throw new LLMError('empty-response', 'the model returned no text');
    } catch (error) {
      throw toLLMError(error);
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener('abort', onCallerAbort);
      controller.abort();
    }
  }

  private async getJson(path: string, signal?: AbortSignal): Promise<unknown> {
    const timeout = AbortSignal.timeout(METADATA_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const response = await fetch(`${this.endpoint}${path}`, {
        signal: combined,
        redirect: 'error',
      });
      if (!response.ok) throw await this.httpError(response);
      return await response.json();
    } catch (error) {
      if (error instanceof LLMError) throw error;
      if (timeout.aborted) throw new LLMError('timeout', `no answer from ${path}`);
      if (signal?.aborted) throw new LLMError('cancelled', 'cancelled');
      if (error instanceof SyntaxError) throw new LLMError('bad-response', `invalid JSON from ${path}`);
      throw new LLMError('connection', `cannot reach Ollama: ${String(error)}`);
    }
  }

  private async httpError(response: Response): Promise<LLMError> {
    let detail: string | undefined;
    try {
      const text = await response.text();
      try {
        const body: unknown = JSON.parse(text);
        detail = trimDetail(isRecord(body) ? body.error : undefined);
      } catch {
        detail = trimDetail(text);
      }
    } catch {
      // The status code alone still tells us enough.
    }
    if (response.status === 404) {
      return new LLMError('model-not-found', 'model is not installed', detail);
    }
    return new LLMError('provider-error', `Ollama answered HTTP ${response.status}`, detail);
  }
}

function parseStreamLine(line: string): { text: string; done: boolean } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new LLMError('bad-response', 'invalid JSON in stream');
  }
  if (!isRecord(parsed)) throw new LLMError('bad-response', 'unexpected chunk in stream');
  if (parsed.error !== undefined) {
    throw new LLMError('provider-error', 'Ollama reported an error', trimDetail(parsed.error));
  }
  const message = parsed.message;
  const text = isRecord(message) && typeof message.content === 'string' ? message.content : '';
  return { text, done: parsed.done === true };
}
