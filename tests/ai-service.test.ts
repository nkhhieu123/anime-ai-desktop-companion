import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChatEvent } from '@shared/ai';
import { AiService } from '../src/main/ai/ai-service';
import { OllamaProvider } from '../src/main/ai/ollama-provider';
import { createConversationStore, createSettingsStore, type ConversationStore } from '../src/main/ai/stores';
import { chunkLine, startMockOllama, streamText, type MockOllama } from '../src/main/testing/mock-ollama';

/** Service + real stores + real provider against the mock server. */
let mock: MockOllama;
let dir: string;
let events: ChatEvent[];

function createService(conversationStore: ConversationStore = createConversationStore(dir)) {
  return new AiService({
    settingsStore: createSettingsStore(dir),
    conversationStore,
    createProvider: (endpoint) => new OllamaProvider(endpoint),
    uiLocale: 'vi-VN',
    emit: (event) => events.push(event),
  });
}

async function readyService(settings: Record<string, unknown> = {}) {
  const service = createService();
  await service.init();
  await service.updateSettings({ endpoint: mock.endpoint, model: 'mock-model:latest', ...settings });
  return service;
}

const finished = () =>
  expect.poll(() => events.some((e) => e.type !== 'delta')).toBe(true);

const sendAndWait = async (service: AiService, text: string) => {
  events = [];
  const result = service.send(text);
  expect(result.ok).toBe(true);
  await finished();
  return result;
};

beforeEach(async () => {
  mock = await startMockOllama();
  dir = await mkdtemp(join(tmpdir(), 'companion-ai-'));
  events = [];
});

afterEach(async () => {
  await mock.close();
  await rm(dir, { recursive: true, force: true });
});

describe('send', () => {
  it('streams deltas, then done, and records the turn', async () => {
    mock.chat = streamText('Xin ', 'chào');
    const service = await readyService();
    await sendAndWait(service, 'Chào bạn');

    expect(events.map((e) => e.type)).toEqual(['delta', 'delta', 'done']);
    expect(service.getHistory().map((m) => [m.role, m.content])).toEqual([
      ['user', 'Chào bạn'],
      ['assistant', 'Xin chào'],
    ]);
  });

  it('sends the system prompt separately and history with the next turn', async () => {
    const service = await readyService();
    await sendAndWait(service, 'first');
    await sendAndWait(service, 'second');

    const roles = mock.requests[1]!.messages.map((m) => m.role);
    expect(roles).toEqual(['system', 'user', 'assistant', 'user']);
    expect(mock.requests[1]!.messages[0]!.content).not.toContain('first');
    expect(mock.requests[1]!.messages.at(-1)!.content).toBe('second');
  });

  it('honours the history limit', async () => {
    const service = await readyService({ maxHistoryMessages: 0 });
    await sendAndWait(service, 'first');
    await sendAndWait(service, 'second');
    expect(mock.requests[1]!.messages.map((m) => m.content).slice(1)).toEqual(['second']);
  });

  it('enforces the input limit', async () => {
    const service = await readyService({ maxInputChars: 100 });
    expect(service.send('x'.repeat(101))).toEqual({ ok: false, error: 'too-long' });
    expect(mock.requests).toHaveLength(0);
  });

  it('refuses a second request while one is running', async () => {
    mock.chat = () => new Promise(() => undefined);
    const service = await readyService();
    const first = service.send('one');
    expect(first.ok).toBe(true);
    expect(service.send('two')).toEqual({ ok: false, error: 'busy' });
    service.cancelAll();
    await finished();
  });

  it('accepts a new request after the previous one ended', async () => {
    const service = await readyService();
    await sendAndWait(service, 'one');
    await expect.poll(() => service.send('two').ok).toBe(true);
  });

  it('reports no-model when none is selected, without calling the server', async () => {
    const service = createService();
    await service.init();
    await service.updateSettings({ endpoint: mock.endpoint });
    await sendAndWait(service, 'hi');
    expect(events).toEqual([expect.objectContaining({ type: 'error', code: 'no-model' })]);
    expect(mock.requests).toHaveLength(0);
  });

  it('treats a model answer as text: a fake tool call only reaches the event stream', async () => {
    const fake = '{"tool":"open_app","app_id":"cmd"} `rm -rf /` <script>x</script>';
    mock.chat = streamText(fake);
    const service = await readyService();
    await sendAndWait(service, 'hi');
    expect(events[0]).toMatchObject({ type: 'delta', text: fake });
    expect(events[1]).toMatchObject({ type: 'done' });
    expect(service.getHistory().at(-1)?.content).toBe(fake);
  });
});

describe('errors stay out of the history', () => {
  it.each([
    [
      'model-not-found',
      (res: Parameters<MockOllama['chat']>[0]) => {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "model 'x' not found" }));
      },
    ],
    ['empty-response', streamText()],
    [
      'provider-error',
      (res: Parameters<MockOllama['chat']>[0]) => {
        res.writeHead(500);
        res.end('{"error":"boom"}');
      },
    ],
  ] as const)('%s', async (code, chat) => {
    mock.chat = chat;
    const service = await readyService();
    await sendAndWait(service, 'hi');
    expect(events.at(-1)).toMatchObject({ type: 'error', code });
    expect(service.getHistory()).toEqual([]);
  });

  it('connection refused', async () => {
    const service = await readyService();
    await mock.close();
    await sendAndWait(service, 'hi');
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'connection' });
  });

  it('timeout', async () => {
    mock.chat = () => new Promise(() => undefined);
    await readyService();
    // 50 ms is below the settings minimum on purpose, to keep this test fast.
    const provider = new OllamaProvider(mock.endpoint);
    const short = new AiService({
      settingsStore: createSettingsStore(dir),
      conversationStore: createConversationStore(dir),
      createProvider: () => ({
        id: 'short',
        getVersion: () => provider.getVersion(),
        listModels: () => provider.listModels(),
        streamChat: (request) => provider.streamChat({ ...request, timeoutMs: 50 }),
      }),
      uiLocale: 'en-US',
      emit: (event) => events.push(event),
    });
    await short.init();
    await sendAndWait(short, 'hi');
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'timeout' });
    expect(short.getHistory()).toEqual([]);
  });
});

describe('cancel', () => {
  it('keeps the partial answer, marked as cancelled', async () => {
    mock.chat = (res) => {
      res.writeHead(200);
      res.write(chunkLine('partial'));
    };
    const service = await readyService();
    const result = service.send('hi');
    await expect.poll(() => events.some((e) => e.type === 'delta')).toBe(true);
    service.cancel((result as { requestId: string }).requestId);
    await finished();

    expect(events.at(-1)).toMatchObject({ type: 'cancelled' });
    expect(service.getHistory().at(-1)).toMatchObject({ content: 'partial', cancelled: true });
    await expect.poll(() => mock.clientDisconnected).toBe(true);
  });

  it('records nothing when cancelled before any text', async () => {
    mock.chat = () => new Promise(() => undefined);
    const service = await readyService();
    service.send('hi');
    service.cancelAll();
    await finished();
    expect(events.at(-1)).toMatchObject({ type: 'cancelled' });
    expect(service.getHistory()).toEqual([]);
  });

  it('ignores a wrong request id', async () => {
    mock.chat = streamText('done');
    const service = await readyService();
    service.send('hi');
    service.cancel('another-id');
    await finished();
    expect(events.at(-1)).toMatchObject({ type: 'done' });
  });
});

describe('persistence is opt-in', () => {
  const conversationFile = () => join(dir, 'conversation.json');

  it('writes nothing about the conversation by default', async () => {
    const service = await readyService();
    await sendAndWait(service, 'bí mật');
    await expect(readdir(dir)).resolves.toEqual(['ai-settings.json']);
    const settings = await readFile(join(dir, 'ai-settings.json'), 'utf8');
    expect(settings).not.toContain('bí mật');
  });

  it('saves once enabled and restores after a restart', async () => {
    const service = await readyService({ persistConversations: true });
    await sendAndWait(service, 'nhớ nhé');
    expect(await readFile(conversationFile(), 'utf8')).toContain('nhớ nhé');

    const restarted = createService();
    await restarted.init();
    expect(restarted.getHistory().map((m) => m.content)).toEqual(['nhớ nhé', 'ok']);
  });

  it('enabling it saves the current conversation', async () => {
    const service = await readyService();
    await sendAndWait(service, 'before');
    await service.updateSettings({ persistConversations: true });
    expect(await readFile(conversationFile(), 'utf8')).toContain('before');
  });

  it('disabling it deletes the saved conversation but keeps the session', async () => {
    const service = await readyService({ persistConversations: true });
    await sendAndWait(service, 'xoá đi');
    await service.updateSettings({ persistConversations: false });
    await expect(readdir(dir)).resolves.toEqual(['ai-settings.json']);
    expect(service.getHistory()).toHaveLength(2);
  });

  it('does not load a leftover file while saving is off', async () => {
    await createConversationStore(dir).save([{ role: 'user', content: 'old', at: new Date().toISOString() }]);
    const service = createService();
    await service.init();
    expect(service.getHistory()).toEqual([]);
  });

  it('clearHistory wipes memory and disk, and stops a running answer', async () => {
    const service = await readyService({ persistConversations: true });
    await sendAndWait(service, 'one');
    mock.chat = () => new Promise(() => undefined);
    service.send('two');
    await service.clearHistory();
    expect(service.getHistory()).toEqual([]);
    await expect(readdir(dir)).resolves.toEqual(['ai-settings.json']);
  });

  it('reports a failed save without losing the answer', async () => {
    const store = createConversationStore(dir);
    let diskFull = false;
    const service = createService({
      ...store,
      save: (messages) => (diskFull ? Promise.reject(new Error('disk full')) : store.save(messages)),
    });
    await service.init();
    await service.updateSettings({
      endpoint: mock.endpoint,
      model: 'mock-model:latest',
      persistConversations: true,
    });
    diskFull = true;
    await sendAndWait(service, 'hi');
    expect(events.at(-1)).toMatchObject({ type: 'done', saveFailed: true });
    expect(service.getHistory()).toHaveLength(2);
  });
});

describe('settings', () => {
  it('keeps the old values when saving fails', async () => {
    const service = new AiService({
      settingsStore: {
        load: createSettingsStore(dir).load,
        save: () => Promise.reject(new Error('disk full')),
      },
      conversationStore: createConversationStore(dir),
      createProvider: (endpoint) => new OllamaProvider(endpoint),
      uiLocale: 'en-US',
      emit: () => undefined,
    });
    await service.init();
    await expect(service.updateSettings({ model: 'x:1' })).rejects.toThrow('disk full');
    expect(service.getSettings().model).toBe('');
  });

  it('rejects invalid input and leaves everything unchanged', async () => {
    const service = await readyService();
    const before = service.getSettings();
    await expect(service.updateSettings({ endpoint: 'http://example.com' })).resolves.toEqual({
      ok: false,
      field: 'endpoint',
    });
    expect(service.getSettings()).toEqual(before);
  });

  it('survive a restart', async () => {
    await readyService({ responseLanguage: 'vi-VN' });
    const restarted = createService();
    await restarted.init();
    expect(restarted.getSettings()).toMatchObject({ model: 'mock-model:latest', responseLanguage: 'vi-VN' });
  });
});

describe('checkConnection', () => {
  it('reports version, models and whether the selection is installed', async () => {
    const service = await readyService();
    await expect(service.checkConnection()).resolves.toEqual({
      status: 'ok',
      version: '0.0.0-mock',
      models: [{ name: 'mock-model:latest', sizeBytes: 1_500_000_000 }],
      selectedModelInstalled: true,
    });
  });

  it('notices a selected model that is not downloaded', async () => {
    const service = await readyService({ model: 'not-downloaded:latest' });
    await expect(service.checkConnection()).resolves.toMatchObject({
      status: 'ok',
      selectedModelInstalled: false,
    });
  });

  it('reports an unreachable server', async () => {
    const service = await readyService();
    await mock.close();
    await expect(service.checkConnection()).resolves.toEqual({ status: 'unreachable' });
  });
});
