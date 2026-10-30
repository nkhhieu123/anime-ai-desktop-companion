import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A fake Ollama server on a random loopback port, used by the automated tests
 * so they need neither Ollama nor a downloaded model. Each test scripts the
 * /api/chat behaviour through `chat`.
 */
export interface RecordedChat {
  model: string;
  messages: { role: string; content: string }[];
  stream: boolean;
}

export type ChatScript = (res: ServerResponse, request: RecordedChat) => void | Promise<void>;

export interface MockOllama {
  endpoint: string;
  requests: RecordedChat[];
  /** Set when a client went away before the response finished. */
  clientDisconnected: boolean;
  models: { name: string; size?: number }[];
  chat: ChatScript;
  close(): Promise<void>;
}

export function chunkLine(content: string, done = false): string {
  return `${JSON.stringify({ model: 'mock', message: { role: 'assistant', content }, done })}\n`;
}

/** Streams each text as one NDJSON line, then the final `done` line. */
export function streamText(...parts: string[]): ChatScript {
  return (res) => {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    for (const part of parts) res.write(chunkLine(part));
    res.end(chunkLine('', true));
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export async function startMockOllama(): Promise<MockOllama> {
  const mock: MockOllama = {
    endpoint: '',
    requests: [],
    clientDisconnected: false,
    models: [{ name: 'mock-model:latest', size: 1_500_000_000 }],
    chat: streamText('ok'),
    close: () => Promise.resolve(),
  };

  const server: Server = createServer((req, res) => {
    void (async () => {
      res.on('close', () => {
        if (!res.writableFinished) mock.clientDisconnected = true;
      });
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.method === 'GET' && req.url === '/api/version') return json(200, { version: '0.0.0-mock' });
      if (req.method === 'GET' && req.url === '/api/tags') return json(200, { models: mock.models });
      if (req.method === 'POST' && req.url === '/api/chat') {
        const request = JSON.parse(await readBody(req)) as RecordedChat;
        mock.requests.push(request);
        await mock.chat(res, request);
        return undefined;
      }
      return json(404, { error: 'not found' });
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  mock.endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  mock.close = () =>
    new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return mock;
}
