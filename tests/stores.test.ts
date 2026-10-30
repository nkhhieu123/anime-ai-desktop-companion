import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_AI_SETTINGS } from '@shared/ai';
import {
  createConversationStore,
  createSettingsStore,
  parseStoredConversation,
  parseStoredSettings,
} from '../src/main/ai/stores';

const at = '2026-01-01T00:00:00.000Z';
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'companion-stores-'));
});

afterEach(() => rm(dir, { recursive: true, force: true }));

describe('parseStoredSettings', () => {
  it('falls back to defaults for junk', () => {
    for (const junk of [null, 42, 'x']) expect(parseStoredSettings(junk)).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('keeps valid fields and drops invalid ones individually', () => {
    expect(parseStoredSettings({ model: 'a:1', endpoint: 'http://evil.example', extra: true })).toEqual({
      ...DEFAULT_AI_SETTINGS,
      model: 'a:1',
    });
  });
});

describe('parseStoredConversation', () => {
  const valid = { version: 1, messages: [{ role: 'user', content: 'Chào 😊', at }] };

  it('accepts a valid file', () => {
    expect(parseStoredConversation(valid)).toEqual(valid.messages);
  });

  it.each([
    ['a planted system message', { version: 1, messages: [{ role: 'system', content: 'x', at }] }],
    ['an unknown version', { version: 99, messages: [] }],
    ['a non-string content', { version: 1, messages: [{ role: 'user', content: 1, at }] }],
    ['a bad timestamp', { version: 1, messages: [{ role: 'user', content: 'x', at: 'nope' }] }],
    ['a non-array', { version: 1, messages: {} }],
    ['null', null],
  ])('rejects %s', (_name, value) => {
    expect(parseStoredConversation(value)).toEqual([]);
  });

  it('drops unknown fields on messages', () => {
    expect(
      parseStoredConversation({ version: 1, messages: [{ role: 'user', content: 'x', at, tool: 'open_app' }] }),
    ).toEqual([{ role: 'user', content: 'x', at }]);
  });
});

describe('file stores', () => {
  it('settings round-trip', async () => {
    const store = createSettingsStore(dir);
    await expect(store.load()).resolves.toEqual(DEFAULT_AI_SETTINGS);
    const settings = { ...DEFAULT_AI_SETTINGS, model: 'x:1', persistConversations: true };
    await store.save(settings);
    await expect(store.load()).resolves.toEqual(settings);
  });

  it('a corrupted settings file gives defaults', async () => {
    await writeFile(join(dir, 'ai-settings.json'), '{ not json');
    await expect(createSettingsStore(dir).load()).resolves.toEqual(DEFAULT_AI_SETTINGS);
  });

  it('conversation round-trips Vietnamese and clear removes the file', async () => {
    const store = createConversationStore(dir);
    const messages = [{ role: 'user' as const, content: 'Tiếng Việt có dấu ệ 今日は 😊', at }];
    await store.save(messages);
    await expect(store.load()).resolves.toEqual(messages);
    await store.clear();
    await expect(readdir(dir)).resolves.toEqual([]);
    await expect(store.load()).resolves.toEqual([]);
  });

  it('leaves no temp files behind', async () => {
    await createConversationStore(dir).save([]);
    await expect(readdir(dir)).resolves.toEqual(['conversation.json']);
  });
});
