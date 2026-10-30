import { describe, expect, it } from 'vitest';
import type { ChatEvent } from '@shared/ai';
import { chatReducer, INITIAL_CHAT_STATE, type ChatAction, type ChatState } from '@shared/chat-state';

const at = '2026-01-01T00:00:00.000Z';
const id = 'r1';
const event = (e: ChatEvent): ChatAction => ({ type: 'event', event: e, at });
const run = (...actions: ChatAction[]): ChatState => actions.reduce(chatReducer, INITIAL_CHAT_STATE);
const send: ChatAction = { type: 'send', text: 'hi', at, model: 'm:1' };

describe('chatReducer', () => {
  it('builds an answer from deltas and clears busy on done', () => {
    const streaming = run(
      send,
      { type: 'started', requestId: id },
      event({ requestId: id, type: 'delta', text: 'Xin ' }),
      event({ requestId: id, type: 'delta', text: 'chào' }),
    );
    expect(streaming.busy).toBe(true);
    expect(streaming.activeRequestId).toBe(id);
    expect(streaming.messages.at(-1)).toMatchObject({ text: 'Xin chào', status: 'streaming' });

    const done = chatReducer(streaming, event({ requestId: id, type: 'done', saveFailed: false }));
    expect(done.busy).toBe(false);
    expect(done.activeRequestId).toBeNull();
    expect(done.messages.at(-1)).toMatchObject({ text: 'Xin chào' });
    expect(done.messages.at(-1)).not.toHaveProperty('status');
  });

  it('handles events that overtake the reply to send', () => {
    const state = run(
      send,
      event({ requestId: id, type: 'delta', text: 'fast' }),
      event({ requestId: id, type: 'done', saveFailed: false }),
      { type: 'started', requestId: id },
    );
    expect(state.busy).toBe(false);
    expect(state.activeRequestId).toBeNull();
    expect(state.messages.filter((m) => m.kind === 'text')).toHaveLength(2);
  });

  it('keeps model text as an inert string', () => {
    const text = '<img src=x onerror=alert(1)> {"tool":"open_app"}';
    const state = run(send, event({ requestId: id, type: 'delta', text }));
    expect(state.messages.at(-1)).toMatchObject({ kind: 'text', text });
  });

  it('marks a stopped answer and keeps its text', () => {
    const state = run(
      send,
      event({ requestId: id, type: 'delta', text: 'partial' }),
      event({ requestId: id, type: 'cancelled', saveFailed: false }),
    );
    expect(state.busy).toBe(false);
    expect(state.messages.at(-1)).toMatchObject({ text: 'partial', status: 'cancelled' });
  });

  it('turns an error into a notice with the model name for the download hint', () => {
    const state = run(send, event({ requestId: id, type: 'error', code: 'model-not-found', detail: 'nope' }));
    expect(state.busy).toBe(false);
    expect(state.messages.at(-1)).toMatchObject({
      kind: 'notice',
      code: 'model-not-found',
      detail: 'nope',
      model: 'm:1',
    });
  });

  it('marks partial text as failed when the stream breaks', () => {
    const state = run(
      send,
      event({ requestId: id, type: 'delta', text: 'partial' }),
      event({ requestId: id, type: 'error', code: 'timeout' }),
    );
    expect(state.messages.at(-2)).toMatchObject({ text: 'partial', status: 'failed' });
    expect(state.messages.at(-1)).toMatchObject({ kind: 'notice', code: 'timeout' });
  });

  it.each(['done', 'cancelled'] as const)('reports a failed save on %s', (type) => {
    const state = run(send, event({ requestId: id, type, saveFailed: true }));
    expect(state.messages.at(-1)).toMatchObject({ kind: 'notice', code: 'save-failed' });
  });

  it('a rejected send clears busy', () => {
    const state = run(send, { type: 'rejected', code: 'busy', at });
    expect(state.busy).toBe(false);
    expect(state.messages.at(-1)).toMatchObject({ kind: 'notice', code: 'busy' });
  });

  it('loads history, including stopped answers, with unique ids', () => {
    const state = run({
      type: 'load-history',
      history: [
        { role: 'user', content: 'u', at },
        { role: 'assistant', content: 'a', at, cancelled: true },
      ],
    });
    expect(state.messages).toMatchObject([
      { author: 'user', text: 'u' },
      { author: 'companion', text: 'a', status: 'cancelled' },
    ]);
    const next = chatReducer(state, send);
    const ids = next.messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reset empties the conversation but never reuses ids', () => {
    const before = run(send);
    const after = chatReducer(before, { type: 'reset' });
    expect(after.messages).toEqual([]);
    expect(after.nextId).toBe(before.nextId);
  });
});
