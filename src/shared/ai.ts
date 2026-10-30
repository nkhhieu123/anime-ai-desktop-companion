/**
 * Types and validation for the AI core, shared by main, preload and renderer.
 * Nothing here talks to the network or the file system.
 */

export const RESPONSE_LANGUAGES = ['auto', 'vi-VN', 'en-US'] as const;
export type ResponseLanguage = (typeof RESPONSE_LANGUAGES)[number];

export interface AiSettings {
  /** Base URL of the local model server. Always loopback, see parseLoopbackEndpoint. */
  endpoint: string;
  /** Empty until the user picks one; no model is assumed to be installed. */
  model: string;
  /** Longest wait for the next piece of the answer, including the first (model load). */
  timeoutMs: number;
  maxInputChars: number;
  /** How many past messages are sent to the model with each request. */
  maxHistoryMessages: number;
  /** Conversations stay in memory only unless the user turns this on. */
  persistConversations: boolean;
  responseLanguage: ResponseLanguage;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  endpoint: 'http://127.0.0.1:11434',
  model: '',
  timeoutMs: 120_000,
  maxInputChars: 4000,
  maxHistoryMessages: 20,
  persistConversations: false,
  responseLanguage: 'auto',
};

export const AI_LIMITS = {
  timeoutMs: { min: 5_000, max: 600_000 },
  maxInputChars: { min: 100, max: 20_000 },
  maxHistoryMessages: { min: 0, max: 200 },
} as const;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]']);
const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

/**
 * Accepts only plain http URLs on this machine and returns the normalised
 * origin. `localhost` becomes 127.0.0.1 so a hosts-file entry cannot point it
 * elsewhere. Anything else (remote hosts, credentials, paths) returns null.
 */
export function parseLoopbackEndpoint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' || url.username || url.password) return null;
  if (url.pathname !== '/' || url.search || url.hash) return null;
  const host = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname;
  if (!LOOPBACK_HOSTS.has(host)) return null;
  return `http://${host}${url.port ? `:${url.port}` : ''}`;
}

function isIntegerInRange(value: unknown, range: { min: number; max: number }): value is number {
  return Number.isInteger(value) && (value as number) >= range.min && (value as number) <= range.max;
}

export type AiSettingsPatchResult =
  | { ok: true; patch: Partial<AiSettings> }
  | { ok: false; field: string };

/** Validates a partial settings update. The first bad or unknown field rejects the whole patch. */
export function parseAiSettingsPatch(value: unknown): AiSettingsPatchResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, field: '*' };
  }
  const patch: Partial<AiSettings> = {};
  for (const [key, raw] of Object.entries(value)) {
    switch (key) {
      case 'endpoint': {
        const endpoint = parseLoopbackEndpoint(raw);
        if (!endpoint) return { ok: false, field: key };
        patch.endpoint = endpoint;
        break;
      }
      case 'model':
        if (typeof raw !== 'string' || (raw !== '' && !MODEL_NAME.test(raw))) {
          return { ok: false, field: key };
        }
        patch.model = raw;
        break;
      case 'timeoutMs':
      case 'maxInputChars':
      case 'maxHistoryMessages':
        if (!isIntegerInRange(raw, AI_LIMITS[key])) return { ok: false, field: key };
        patch[key] = raw;
        break;
      case 'persistConversations':
        if (typeof raw !== 'boolean') return { ok: false, field: key };
        patch.persistConversations = raw;
        break;
      case 'responseLanguage':
        if (!RESPONSE_LANGUAGES.includes(raw as ResponseLanguage)) return { ok: false, field: key };
        patch.responseLanguage = raw as ResponseLanguage;
        break;
      default:
        return { ok: false, field: key };
    }
  }
  return { ok: true, patch };
}

export interface ModelInfo {
  name: string;
  sizeBytes: number | null;
}

export type ConnectionReport =
  | {
      status: 'ok';
      version: string;
      models: ModelInfo[];
      /** False when a model is selected but not downloaded on this machine. */
      selectedModelInstalled: boolean;
    }
  | { status: 'unreachable' | 'timeout' | 'bad-response'; detail?: string };

export type AiErrorCode =
  | 'no-model'
  | 'connection'
  | 'timeout'
  | 'model-not-found'
  | 'empty-response'
  | 'response-too-long'
  | 'bad-response'
  | 'provider-error';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  /** ISO timestamp. */
  at: string;
  /** The user stopped this answer before it finished. */
  cancelled?: boolean;
}

export type ChatEvent =
  | { requestId: string; type: 'delta'; text: string }
  | { requestId: string; type: 'done'; saveFailed: boolean }
  | { requestId: string; type: 'cancelled'; saveFailed: boolean }
  /** `detail` comes from the model server: display it as text, never act on it. */
  | { requestId: string; type: 'error'; code: AiErrorCode; detail?: string };
