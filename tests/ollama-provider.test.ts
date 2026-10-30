import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LLMError, type LLMErrorCode } from '../src/main/ai/llm-provider';
import { OllamaProvider } from '../src/main/ai/ollama-provider';
import { chunkLine, startMockOllama, streamText, type MockOllama } from '../src/main/testing/mock-ollama';

let mock: MockOllama;
let provider: OllamaProvider;

beforeEach(async () => {
  mock = await startMockOllama();
  provider = new OllamaProvider(mock.endpoint);
});

afterEach(() => mock.close());

const request = (overrides = {}) => ({
  model: 'mock-model:latest',
  messages: [{ role: 'user' as const, content: 'hi' }],
  timeoutMs: 2000,
  ...overrides,
});

async function collect(iterable: AsyncIterable<string>): Promise<string[]> {
  const parts: string[] = [];
  for await (const part of iterable) parts.push(part);
  return parts;
}

async function expectLLMError(iterable: AsyncIterable<string>, code: LLMErrorCode): Promise<LLMError> {
  try {
    await collect(iterable);
  } catch (error) {
    expect(error).toBeInstanceOf(LLMError);
    expect((error as LLMError).code).toBe(code);
    return error as LLMError;
  }
  throw new Error(`expected LLMError ${code}, but the stream succeeded`);
}

describe('constructor', () => {
  it.each(['http://example.com:11434', 'https://127.0.0.1:11434', 'http://127.0.0.1.evil.com'])(
    'refuses non-loopback endpoint %s',
    (endpoint) => {
      expect(() => new OllamaProvider(endpoint)).toThrow();
    },
  );
});

describe('getVersion / listModels', () => {
  it('reads the version', async () => {
    await expect(provider.getVersion()).resolves.toBe('0.0.0-mock');
  });

  it('lists models with their size', async () => {
    mock.models = [{ name: 'a:latest', size: 42 }, { name: 'b:7b' }];
    await expect(provider.listModels()).resolves.toEqual([
      { name: 'a:latest', sizeBytes: 42 },
      { name: 'b:7b', sizeBytes: null },
    ]);
  });

  it('handles a server with no models', async () => {
    mock.models = [];
    await expect(provider.listModels()).resolves.toEqual([]);
  });

  it('reports a connection error when nothing listens', async () => {
    await mock.close();
    await expect(provider.getVersion()).rejects.toMatchObject({ code: 'connection' });
    await expect(provider.listModels()).rejects.toMatchObject({ code: 'connection' });
  });
});

describe('streamChat: streaming', () => {
  it('yields chunks in order and stops at done', async () => {
    mock.chat = streamText('Xin ', 'chào', '!');
    await expect(collect(provider.streamChat(request()))).resolves.toEqual(['Xin ', 'chào', '!']);
  });

  it('sends model, messages and stream:true', async () => {
    const messages = [
      { role: 'system' as const, content: 'S' },
      { role: 'user' as const, content: 'Tiếng Việt 😊' },
    ];
    await collect(provider.streamChat(request({ messages })));
    expect(mock.requests).toEqual([{ model: 'mock-model:latest', messages, stream: true }]);
  });

  it('delivers data as it arrives, before the response ends', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    mock.chat = async (res) => {
      res.writeHead(200);
      res.write(chunkLine('first'));
      await gate;
      res.end(chunkLine('', true));
    };
    const iterator = provider.streamChat(request())[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 'first' });
    release();
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
  });

  it('reassembles a UTF-8 character split across network packets', async () => {
    const bytes = Buffer.from(chunkLine('Việt') + chunkLine('', true), 'utf8');
    const splitAt = bytes.indexOf(Buffer.from('ệ', 'utf8')) + 1; // inside the 3-byte "ệ"
    mock.chat = async (res) => {
      res.writeHead(200);
      res.write(bytes.subarray(0, splitAt));
      await new Promise((r) => setTimeout(r, 20));
      res.end(bytes.subarray(splitAt));
    };
    await expect(collect(provider.streamChat(request()))).resolves.toEqual(['Việt']);
  });

  it('reassembles a JSON line split across packets', async () => {
    const line = chunkLine('hello');
    mock.chat = async (res) => {
      res.writeHead(200);
      res.write(line.slice(0, 10));
      await new Promise((r) => setTimeout(r, 20));
      res.write(line.slice(10));
      res.end(chunkLine('', true));
    };
    await expect(collect(provider.streamChat(request()))).resolves.toEqual(['hello']);
  });

  it('accepts a final line with no trailing newline', async () => {
    mock.chat = (res) => {
      res.writeHead(200);
      res.write(chunkLine('x'));
      res.end(chunkLine('', true).trimEnd());
    };
    await expect(collect(provider.streamChat(request()))).resolves.toEqual(['x']);
  });

  it('passes model output through verbatim, even when it looks like a command', async () => {
    const hostile = '{"tool":"open_app","app_id":"cmd"} <script>alert(1)</script> rm -rf /';
    mock.chat = streamText(hostile);
    await expect(collect(provider.streamChat(request()))).resolves.toEqual([hostile]);
  });
});

describe('streamChat: failures', () => {
  it('connection refused', async () => {
    await mock.close();
    await expectLLMError(provider.streamChat(request()), 'connection');
  });

  it('model not downloaded (HTTP 404) keeps the server message', async () => {
    mock.chat = (res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: "model 'x' not found" }));
    };
    const error = await expectLLMError(provider.streamChat(request()), 'model-not-found');
    expect(error.detail).toBe("model 'x' not found");
  });

  it('other HTTP errors become provider-error with the detail', async () => {
    mock.chat = (res) => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'out of memory' }));
    };
    const error = await expectLLMError(provider.streamChat(request()), 'provider-error');
    expect(error.detail).toBe('out of memory');
  });

  it('an error line in the middle of the stream', async () => {
    mock.chat = (res) => {
      res.writeHead(200);
      res.write(chunkLine('partial'));
      res.end(`${JSON.stringify({ error: 'runner crashed' })}\n`);
    };
    const error = await expectLLMError(provider.streamChat(request()), 'provider-error');
    expect(error.detail).toBe('runner crashed');
  });

  it('truncates very long server messages', async () => {
    mock.chat = (res) => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'x'.repeat(5000) }));
    };
    const error = await expectLLMError(provider.streamChat(request()), 'provider-error');
    expect(error.detail).toHaveLength(300);
  });

  it.each([
    ['nothing at all', [] as string[]],
    ['only an empty string', ['']],
    ['only whitespace', ['  \n', '\t ']],
  ])('empty answer: %s', async (_name, parts) => {
    mock.chat = streamText(...parts);
    await expectLLMError(provider.streamChat(request()), 'empty-response');
  });

  it('stream cut off before done', async () => {
    mock.chat = (res) => {
      res.writeHead(200);
      res.end(chunkLine('partial'));
    };
    await expectLLMError(provider.streamChat(request()), 'bad-response');
  });

  it('garbage instead of NDJSON', async () => {
    mock.chat = (res) => {
      res.writeHead(200);
      res.end('<html>not ollama</html>\n');
    };
    await expectLLMError(provider.streamChat(request()), 'bad-response');
  });

  it('does not follow redirects away from loopback', async () => {
    mock.chat = (res) => {
      res.writeHead(302, { Location: 'http://example.com/steal' });
      res.end();
    };
    await expectLLMError(provider.streamChat(request()), 'connection');
  });
});

describe('streamChat: timeout', () => {
  it('fires when the server never answers', async () => {
    mock.chat = () => new Promise(() => undefined);
    const started = Date.now();
    await expectLLMError(provider.streamChat(request({ timeoutMs: 100 })), 'timeout');
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('fires when the stream stalls after some text', async () => {
    mock.chat = (res) => {
      res.writeHead(200);
      res.write(chunkLine('partial'));
    };
    const parts: string[] = [];
    let code: string | undefined;
    try {
      for await (const part of provider.streamChat(request({ timeoutMs: 100 }))) parts.push(part);
    } catch (error) {
      code = (error as LLMError).code;
    }
    expect(parts).toEqual(['partial']);
    expect(code).toBe('timeout');
  });

  it('is an idle timeout: a slow but steady answer completes', async () => {
    mock.chat = async (res) => {
      res.writeHead(200);
      for (const part of ['a', 'b', 'c', 'd']) {
        res.write(chunkLine(part));
        await new Promise((r) => setTimeout(r, 60));
      }
      res.end(chunkLine('', true));
    };
    await expect(collect(provider.streamChat(request({ timeoutMs: 150 })))).resolves.toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('streamChat: cancellation', () => {
  it('rejects at once if already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expectLLMError(provider.streamChat(request({ signal: controller.signal })), 'cancelled');
    expect(mock.requests).toHaveLength(0);
  });

  it('cancels mid-stream and disconnects from the server', async () => {
    mock.chat = (res) => {
      res.writeHead(200);
      res.write(chunkLine('partial'));
    };
    const controller = new AbortController();
    const parts: string[] = [];
    let code: string | undefined;
    try {
      for await (const part of provider.streamChat(request({ signal: controller.signal }))) {
        parts.push(part);
        controller.abort();
      }
    } catch (error) {
      code = (error as LLMError).code;
    }
    expect(parts).toEqual(['partial']);
    expect(code).toBe('cancelled');
    await expect.poll(() => mock.clientDisconnected).toBe(true);
  });

  it('cancels while waiting for the first byte', async () => {
    mock.chat = () => new Promise(() => undefined);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);
    await expectLLMError(provider.streamChat(request({ signal: controller.signal })), 'cancelled');
  });
});
