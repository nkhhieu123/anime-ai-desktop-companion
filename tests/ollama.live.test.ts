import { describe, expect, it } from 'vitest';
import { OllamaProvider } from '../src/main/ai/ollama-provider';

/**
 * NEEDS A REAL OLLAMA. Skipped unless explicitly enabled, so `npm test` never
 * depends on it. Everything else in tests/ runs against a mock server.
 *
 *   OLLAMA_LIVE_MODEL=<an installed model> npm run test:live
 *
 * Optional: OLLAMA_LIVE_ENDPOINT (default http://127.0.0.1:11434).
 */
const model = process.env['OLLAMA_LIVE_MODEL'];
const endpoint = process.env['OLLAMA_LIVE_ENDPOINT'] ?? 'http://127.0.0.1:11434';

describe.skipIf(!model)('real Ollama', () => {
  const provider = new OllamaProvider(endpoint);

  it('answers the version endpoint', async () => {
    await expect(provider.getVersion()).resolves.toMatch(/\d/);
  });

  it('lists the configured model as installed', async () => {
    const models = await provider.listModels();
    expect(models.map((m) => m.name)).toContain(model);
  });

  it('streams a non-empty answer in Vietnamese', { timeout: 300_000 }, async () => {
    const parts: string[] = [];
    const stream = provider.streamChat({
      model: model!,
      messages: [{ role: 'user', content: 'Chào bạn. Trả lời thật ngắn bằng tiếng Việt.' }],
      timeoutMs: 280_000,
    });
    for await (const part of stream) parts.push(part);
    expect(parts.join('').trim().length).toBeGreaterThan(0);
  });

  it('can be cancelled mid-answer', { timeout: 300_000 }, async () => {
    const controller = new AbortController();
    const stream = provider.streamChat({
      model: model!,
      messages: [{ role: 'user', content: 'Write a very long story.' }],
      timeoutMs: 280_000,
      signal: controller.signal,
    });
    await expect(
      (async () => {
        for await (const part of stream) {
          void part;
          controller.abort();
        }
      })(),
    ).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('reports a model that is not downloaded', async () => {
    const stream = provider.streamChat({
      model: 'this-model-does-not-exist:latest',
      messages: [{ role: 'user', content: 'hi' }],
      timeoutMs: 30_000,
    });
    await expect(
      (async () => {
        for await (const part of stream) void part;
      })(),
    ).rejects.toMatchObject({ code: 'model-not-found' });
  });
});
