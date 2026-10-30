import { describe, expect, it } from 'vitest';
import { CHAT_MESSAGE_MAX_LENGTH } from '@shared/ipc';
import { isEmptyPayload, parseChatRequest, parseRequestId, parseScreenPoint } from '@shared/validation';

describe('parseScreenPoint', () => {
  it('accepts finite coordinates and rounds them', () => {
    expect(parseScreenPoint({ x: 10.4, y: -3.6 })).toEqual({ x: 10, y: -4 });
  });

  it.each([
    null,
    undefined,
    42,
    'x',
    [],
    { x: 1 },
    { x: '1', y: 2 },
    { x: NaN, y: 0 },
    { x: Infinity, y: 0 },
    { x: 1e9, y: 0 },
    { x: 1, y: 2, extra: true },
  ])('rejects %j', (value) => {
    expect(parseScreenPoint(value)).toBeNull();
  });
});

describe('parseChatRequest', () => {
  it('trims and NFC-normalises Vietnamese text', () => {
    // "Việt" written with combining marks (NFD) must come out composed (NFC).
    const decomposed = '  Tiếng Việt  '.normalize('NFD');
    expect(parseChatRequest({ text: decomposed })).toEqual({ text: 'Tiếng Việt' });
  });

  it('accepts mixed-language and emoji text', () => {
    const text = 'Hello bạn, 今日は 👋 — mở Notepad giúp mình nhé';
    expect(parseChatRequest({ text })).toEqual({ text });
  });

  it('accepts exactly the maximum length', () => {
    const text = 'a'.repeat(CHAT_MESSAGE_MAX_LENGTH);
    expect(parseChatRequest({ text })?.text).toHaveLength(CHAT_MESSAGE_MAX_LENGTH);
  });

  it.each([
    null,
    'hi',
    { text: '' },
    { text: '   \n\t ' },
    { text: 42 },
    { text: 'hi', role: 'system' },
    { text: 'a'.repeat(CHAT_MESSAGE_MAX_LENGTH + 1) },
  ])('rejects %j', (value) => {
    expect(parseChatRequest(value)).toBeNull();
  });
});

describe('parseRequestId', () => {
  it('accepts a UUID', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    expect(parseRequestId(id)).toBe(id);
  });

  it.each(['', 'x', 42, null, {}, '../../etc/passwd', 'a'.repeat(36)])('rejects %j', (value) => {
    expect(parseRequestId(value)).toBeNull();
  });
});

describe('isEmptyPayload', () => {
  it('accepts no args or a single undefined', () => {
    expect(isEmptyPayload([])).toBe(true);
    expect(isEmptyPayload([undefined])).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isEmptyPayload([null])).toBe(false);
    expect(isEmptyPayload([{}])).toBe(false);
    expect(isEmptyPayload([undefined, undefined])).toBe(false);
  });
});
