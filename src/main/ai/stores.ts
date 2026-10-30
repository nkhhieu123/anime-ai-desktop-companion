import { join } from 'node:path';
import {
  DEFAULT_AI_SETTINGS,
  parseAiSettingsPatch,
  type AiSettings,
  type ConversationMessage,
} from '@shared/ai';
import { CHAT_MESSAGE_MAX_LENGTH } from '@shared/ipc';
import { MAX_STORED_MESSAGES } from './conversation';
import { deleteFile, readJsonFile, writeJsonFile } from './json-file';
import { log } from '../log';

/**
 * JSON files in the app's data directory. Stage 3 moves both to SQLite; the
 * AI service only sees these small interfaces.
 */
const CONVERSATION_VERSION = 1;
/** An answer can be much longer than a question, but not unbounded. */
const MAX_STORED_MESSAGE_CHARS = Math.max(CHAT_MESSAGE_MAX_LENGTH, 200_000);

export interface SettingsStore {
  load(): Promise<AiSettings>;
  save(settings: AiSettings): Promise<void>;
}

export interface ConversationStore {
  load(): Promise<ConversationMessage[]>;
  save(messages: readonly ConversationMessage[]): Promise<void>;
  clear(): Promise<void>;
}

/** Unknown or invalid values fall back to their defaults, one field at a time. */
export function parseStoredSettings(value: unknown): AiSettings {
  const settings: AiSettings = { ...DEFAULT_AI_SETTINGS };
  if (typeof value !== 'object' || value === null) return settings;
  for (const [key, raw] of Object.entries(value)) {
    const parsed = parseAiSettingsPatch({ [key]: raw });
    if (parsed.ok) Object.assign(settings, parsed.patch);
    else log.warn('ignored invalid stored setting', { field: key });
  }
  return settings;
}

/**
 * The file is outside the app's control, so it is validated like any input.
 * In particular only user/assistant roles load: an edited file must not be
 * able to plant a system message in the prompt.
 */
export function parseStoredConversation(value: unknown): ConversationMessage[] {
  if (typeof value !== 'object' || value === null) return [];
  const { version, messages } = value as { version?: unknown; messages?: unknown };
  if (version !== CONVERSATION_VERSION || !Array.isArray(messages)) return [];
  const parsed: ConversationMessage[] = [];
  for (const entry of messages.slice(-MAX_STORED_MESSAGES) as unknown[]) {
    if (typeof entry !== 'object' || entry === null) return [];
    const { role, content, at, cancelled } = entry as Record<string, unknown>;
    if (role !== 'user' && role !== 'assistant') return [];
    if (typeof content !== 'string' || content.length > MAX_STORED_MESSAGE_CHARS) return [];
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return [];
    parsed.push({ role, content, at, ...(cancelled === true ? { cancelled: true } : {}) });
  }
  return parsed;
}

export function createSettingsStore(dataDir: string): SettingsStore {
  const path = join(dataDir, 'ai-settings.json');
  return {
    load: async () => parseStoredSettings(await readJsonFile(path)),
    save: (settings) => writeJsonFile(path, settings),
  };
}

export function createConversationStore(dataDir: string): ConversationStore {
  const path = join(dataDir, 'conversation.json');
  return {
    load: async () => parseStoredConversation(await readJsonFile(path)),
    save: (messages) => writeJsonFile(path, { version: CONVERSATION_VERSION, messages }),
    clear: () => deleteFile(path),
  };
}
