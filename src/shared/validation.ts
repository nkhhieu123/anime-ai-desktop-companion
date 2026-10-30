import { CHAT_MESSAGE_MAX_LENGTH, type ChatRequest, type ScreenPoint } from './ipc';

/** Screen coordinates beyond this are certainly bogus (multi-monitor setups included). */
const MAX_COORDINATE = 100_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
}

export function parseScreenPoint(value: unknown): ScreenPoint | null {
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes('x') || !keys.includes('y')) return null;
  if (!isCoordinate(value.x) || !isCoordinate(value.y)) return null;
  return { x: Math.round(value.x), y: Math.round(value.y) };
}

export function parseChatRequest(value: unknown): ChatRequest | null {
  if (!isPlainObject(value)) return null;
  if (Object.keys(value).length !== 1 || typeof value.text !== 'string') return null;
  const text = value.text.normalize('NFC').trim();
  if (text.length === 0 || text.length > CHAT_MESSAGE_MAX_LENGTH) return null;
  return { text };
}

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseRequestId(value: unknown): string | null {
  return typeof value === 'string' && REQUEST_ID.test(value) ? value : null;
}

/** Channels that carry no payload must receive nothing. */
export function isEmptyPayload(args: readonly unknown[]): boolean {
  return args.length === 0 || (args.length === 1 && args[0] === undefined);
}
