import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_SETTINGS, parseAiSettingsPatch, parseLoopbackEndpoint } from '@shared/ai';

describe('parseLoopbackEndpoint', () => {
  it.each([
    ['http://127.0.0.1:11434', 'http://127.0.0.1:11434'],
    ['http://127.0.0.1:11434/', 'http://127.0.0.1:11434'],
    ['  http://localhost:11434  ', 'http://127.0.0.1:11434'],
    ['http://[::1]:11434', 'http://[::1]:11434'],
    ['http://127.0.0.1', 'http://127.0.0.1'],
  ])('accepts %s', (input, expected) => {
    expect(parseLoopbackEndpoint(input)).toBe(expected);
  });

  it.each([
    'http://example.com:11434',
    'http://192.168.1.10:11434',
    'http://0.0.0.0:11434',
    'https://127.0.0.1:11434',
    'ftp://127.0.0.1',
    'file:///etc/passwd',
    'http://127.0.0.1.evil.com',
    'http://localhost.evil.com',
    'http://localhost@evil.com',
    'http://user:pass@127.0.0.1:11434',
    'http://127.0.0.1:11434/api',
    'http://127.0.0.1:11434?x=1',
    'not a url',
    '',
    null,
    42,
  ])('rejects %j', (input) => {
    expect(parseLoopbackEndpoint(input)).toBeNull();
  });
});

describe('parseAiSettingsPatch', () => {
  it('accepts a valid partial update and normalises the endpoint', () => {
    expect(
      parseAiSettingsPatch({ endpoint: 'http://localhost:1234', model: 'llama3.2:latest', timeoutMs: 5000 }),
    ).toEqual({
      ok: true,
      patch: { endpoint: 'http://127.0.0.1:1234', model: 'llama3.2:latest', timeoutMs: 5000 },
    });
  });

  it('allows clearing the model and namespaced model names', () => {
    expect(parseAiSettingsPatch({ model: '' }).ok).toBe(true);
    expect(parseAiSettingsPatch({ model: 'hf.co/org/model:Q4_K_M' }).ok).toBe(true);
  });

  it.each([
    [{ endpoint: 'http://example.com' }, 'endpoint'],
    [{ model: '--help' }, 'model'],
    [{ model: 'a b' }, 'model'],
    [{ model: 5 }, 'model'],
    [{ timeoutMs: 1 }, 'timeoutMs'],
    [{ timeoutMs: 1.5e4 + 0.5 }, 'timeoutMs'],
    [{ maxInputChars: 99 }, 'maxInputChars'],
    [{ maxInputChars: 20_001 }, 'maxInputChars'],
    [{ maxHistoryMessages: -1 }, 'maxHistoryMessages'],
    [{ persistConversations: 'yes' }, 'persistConversations'],
    [{ responseLanguage: 'fr-FR' }, 'responseLanguage'],
    [{ apiKey: 'x' }, 'apiKey'],
    [null, '*'],
    [[], '*'],
  ])('rejects %j on field %s', (input, field) => {
    expect(parseAiSettingsPatch(input)).toEqual({ ok: false, field });
  });

  it('has defaults that are private and assume nothing', () => {
    expect(DEFAULT_AI_SETTINGS.persistConversations).toBe(false);
    expect(DEFAULT_AI_SETTINGS.model).toBe('');
    expect(parseLoopbackEndpoint(DEFAULT_AI_SETTINGS.endpoint)).toBe(DEFAULT_AI_SETTINGS.endpoint);
    expect(parseAiSettingsPatch(DEFAULT_AI_SETTINGS).ok).toBe(true);
  });
});
