import { app, BrowserWindow, type Tray } from 'electron';
import { spawn } from 'node:child_process';
import { readdir, rm } from 'node:fs/promises';
import { createTranslator, resolveUiLocale } from '@shared/i18n';
import { chunkLine, startMockOllama, streamText } from './testing/mock-ollama';
import type { WindowManager } from './windows/window-manager';
import { log } from './log';

/**
 * `electron . --smoke-test`: boots the real app, opens both windows and checks
 * the security boundary from inside each renderer, then exits with 0/1.
 * Run via `npm run test:smoke`.
 */

export interface SmokeShell {
  tray: Tray;
  shortcutRegistered: boolean;
  dataDir: string;
}

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

const RENDERER_PROBE = `(() => ({
  hasRequire: typeof window.require !== 'undefined',
  hasProcess: typeof window.process !== 'undefined',
  hasModule: typeof window.module !== 'undefined',
  hasIpcRenderer: typeof window.ipcRenderer !== 'undefined',
  companionKeys: window.companion ? Object.keys(window.companion).sort().join(',') : null,
  apiFrozen: window.companion ? Object.isFrozen(window.companion) : false,
  csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? null,
  rootRendered: !!document.getElementById('root')?.firstElementChild,
}))()`;

async function probe(win: BrowserWindow, label: string, checks: Check[]): Promise<void> {
  const result = (await win.webContents.executeJavaScript(RENDERER_PROBE)) as Record<string, unknown>;
  checks.push(
    { name: `${label}: no require`, ok: result.hasRequire === false },
    { name: `${label}: no process`, ok: result.hasProcess === false },
    { name: `${label}: no module`, ok: result.hasModule === false },
    { name: `${label}: no raw ipcRenderer`, ok: result.hasIpcRenderer === false },
    { name: `${label}: companion api`, ok: result.companionKeys === 'ai,app,avatar,chat', detail: String(result.companionKeys) },
    { name: `${label}: api frozen`, ok: result.apiFrozen === true },
    { name: `${label}: CSP meta present`, ok: typeof result.csp === 'string' && String(result.csp).includes("default-src 'none'") },
    { name: `${label}: React rendered`, ok: result.rootRendered === true },
  );
}

/**
 * The whole chat path through the real UI, IPC, service and provider, against
 * the mock server: no Ollama or model needed. Nothing here proves that a real
 * model works; that is what `npm run test:live` is for.
 */
async function checkAiFlow(
  chat: BrowserWindow,
  avatar: BrowserWindow,
  dataDir: string,
  checks: Check[],
): Promise<void> {
  const page = chat.webContents;
  const evaluate = <T>(code: string): Promise<T> => page.executeJavaScript(code) as Promise<T>;
  const text = (selector: string) =>
    evaluate<string>(`[...document.querySelectorAll(${JSON.stringify(selector)})].map((e) => e.textContent).join('\\n')`);
  const waitFor = async (condition: string, label: string): Promise<boolean> => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate<boolean>(`!!(${condition})`)) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    log.error('smoke: condition never became true', { label });
    return false;
  };
  const sendFromUi = (message: string) =>
    evaluate(`(() => {
      const input = document.querySelector('textarea');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(message)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return new Promise((resolve) => setTimeout(() => {
        document.querySelector('button[type=submit]').click();
        resolve(true);
      }, 50));
    })()`);
  const answerEnded = `document.querySelector('button[type=submit]')`;
  /** Sends a message and waits for the new notice it should produce; returns its text. */
  const noticeAfterSending = async (message: string, label: string): Promise<string> => {
    const before = await evaluate<number>(`document.querySelectorAll('.bubble-system').length`);
    await sendFromUi(message);
    await waitFor(`document.querySelectorAll('.bubble-system').length > ${before}`, label);
    return evaluate<string>(`[...document.querySelectorAll('.bubble-system p')].at(-1)?.textContent ?? ''`);
  };
  const t = createTranslator(resolveUiLocale(app.getLocale()));

  const mock = await startMockOllama();
  try {
    // Nothing configured yet: an honest error, not a silent failure.
    const noModel = await noticeAfterSending('Xin chào, bạn khỏe không? 😊', 'no-model');
    checks.push({ name: 'ai: no model selected is reported', ok: noModel === t('chat.error.noModel'), detail: noModel });

    // Settings are validated in main, and only the chat window may change them.
    const remote = await evaluate<{ ok: boolean }>(
      `window.companion.ai.updateSettings({ endpoint: 'http://example.com:11434' })`,
    );
    checks.push({ name: 'ai: remote endpoint refused', ok: remote.ok === false });
    const fromAvatar = await avatar.webContents.executeJavaScript(
      `window.companion.ai.updateSettings({ model: 'x' })`,
    );
    checks.push({ name: 'ai: avatar cannot change settings', ok: fromAvatar.ok === false });

    // Model selection screen.
    await evaluate(`window.companion.ai.updateSettings({ endpoint: ${JSON.stringify(mock.endpoint)} })`);
    await page.reloadIgnoringCache();
    await waitFor(`document.querySelector('.settings-toggle')`, 'chat ready');
    await evaluate(`document.querySelector('.settings-toggle').click()`);
    await waitFor(`document.querySelector('#model-select')`, 'settings open');
    await evaluate(`document.querySelector('.check-connection').click()`);
    checks.push({
      name: 'settings: connection check lists models',
      ok: await waitFor(`document.querySelector('#model-select option[value="mock-model:latest"]')`, 'model listed'),
    });
    await evaluate(`(() => {
      const select = document.querySelector('#model-select');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'mock-model:latest');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    checks.push({
      name: 'settings: choosing a model shows it as ready',
      ok: await waitFor(`document.querySelector('.status-ok')?.textContent.includes('mock-model:latest')`, 'status ok'),
    });

    // A selected model that is not downloaded gets a clear message.
    mock.models = [];
    await evaluate(`document.querySelector('.check-connection').click()`);
    checks.push({
      name: 'settings: missing model is explained',
      ok: await waitFor(
        `document.querySelector('.model-missing')?.textContent.includes('ollama pull mock-model:latest')`,
        'missing model',
      ),
    });
    mock.models = [{ name: 'mock-model:latest', size: 1 }];
    await evaluate(`document.querySelector('.check-connection').click()`);
    await waitFor(`document.querySelector('.status-ok')`, 'status ok again');
    await evaluate(`document.querySelector('.settings-back').click()`);
    await waitFor(`document.querySelector('textarea')`, 'back in chat');

    // Streaming, shown as it arrives.
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    mock.chat = async (res) => {
      res.writeHead(200);
      res.write(chunkLine('Xin '));
      await gate;
      res.write(chunkLine('chào 😊'));
      res.end(chunkLine('', true));
    };
    await sendFromUi('Chào bạn');
    checks.push({
      name: 'ai: partial answer visible while streaming',
      ok: await waitFor(`document.querySelector('.bubble-companion.is-streaming')?.textContent.includes('Xin')`, 'partial'),
    });
    release();
    await waitFor(answerEnded, 'answer ended');
    checks.push({
      name: 'ai: streamed answer completes',
      ok: (await text('.bubble-companion p')).includes('Xin chào 😊'),
    });
    const sent = mock.requests.at(-1);
    checks.push({
      name: 'ai: system prompt sent separately',
      ok:
        sent?.messages[0]?.role === 'system' &&
        sent.messages.filter((m) => m.role === 'system').length === 1 &&
        sent.messages.at(-1)?.content === 'Chào bạn',
    });

    // Model output is only text: no markup, no action.
    const hostile = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script> {"tool":"open_app","app_id":"cmd"}';
    mock.chat = streamText(hostile);
    await sendFromUi('test');
    await waitFor(`document.querySelector('.bubble-companion:last-of-type') && ${answerEnded}`, 'hostile answer');
    await new Promise((r) => setTimeout(r, 200));
    checks.push(
      { name: 'ai: model output shown as literal text', ok: (await text('.bubble-companion p')).includes(hostile) },
      {
        name: 'ai: model output creates no elements or script',
        ok: await evaluate<boolean>(`!document.querySelector('.chat-log img, .chat-log script') && window.__pwned === undefined`),
      },
    );

    // Stop button cancels and disconnects from the server.
    mock.clientDisconnected = false;
    mock.chat = (res) => {
      res.writeHead(200);
      res.write(chunkLine('một phần'));
    };
    await sendFromUi('dừng nhé');
    await waitFor(`document.querySelector('.is-streaming') && !document.querySelector('.stop-button')?.disabled`, 'stoppable');
    await evaluate(`document.querySelector('.stop-button').click()`);
    checks.push({
      name: 'ai: stop keeps the partial answer',
      ok: await waitFor(`document.querySelector('.bubble-companion.is-cancelled')?.textContent.includes('một phần')`, 'cancelled'),
    });
    await new Promise((r) => setTimeout(r, 200));
    checks.push({ name: 'ai: stop disconnects from the server', ok: mock.clientDisconnected });

    // Error messages reach the screen.
    mock.chat = (res) => {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'model not found' }));
    };
    const notFound = await noticeAfterSending('a', 'not found');
    checks.push({
      name: 'ai: model not found explained',
      ok: notFound.includes('ollama pull mock-model:latest'),
      detail: notFound,
    });

    mock.chat = streamText();
    const empty = await noticeAfterSending('b', 'empty');
    checks.push({ name: 'ai: empty answer reported', ok: empty === t('chat.error.empty'), detail: empty });

    // Conversations stay off the disk unless the user opts in.
    const files = await readdir(dataDir);
    checks.push({ name: 'privacy: nothing saved by default', ok: !files.includes('conversation.json'), detail: files.join(',') });
    await evaluate(`window.companion.ai.updateSettings({ persistConversations: true })`);
    const saved = await readdir(dataDir);
    await evaluate(`window.companion.ai.updateSettings({ persistConversations: false })`);
    const deleted = await readdir(dataDir);
    checks.push({
      name: 'privacy: opt-in saves, opt-out deletes',
      ok: saved.includes('conversation.json') && !deleted.includes('conversation.json'),
    });

    // Ollama goes away.
    await mock.close();
    const lost = await noticeAfterSending('c', 'connection');
    checks.push({ name: 'ai: lost connection reported', ok: lost === t('chat.error.connection'), detail: lost });
  } finally {
    await mock.close();
    await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Resolves with the exit code, or null if it had to be killed because it kept running. */
function launchSecondInstance(): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [app.getAppPath()], { stdio: 'ignore' });
    const killer = setTimeout(() => child.kill(), 10_000);
    child.once('error', (error) => {
      clearTimeout(killer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(killer);
      resolve(code);
    });
  });
}

export async function runSmokeTest(windows: WindowManager, shell: SmokeShell): Promise<void> {
  const timer = setTimeout(() => {
    log.error('smoke test timed out');
    app.exit(1);
  }, 60_000);

  const checks: Check[] = [];
  try {
    // createAvatar/openChat resolve once their page has finished loading.
    log.info('smoke: creating avatar window');
    const avatar = await windows.createAvatar();
    log.info('smoke: opening chat window');
    const chat = await windows.openChat();
    log.info('smoke: probing renderers');

    const [width, height] = avatar.getSize();
    checks.push(
      { name: 'avatar: always on top', ok: avatar.isAlwaysOnTop() },
      { name: 'avatar: size 240x320', ok: width === 240 && height === 320, detail: `${width}x${height}` },
      { name: 'avatar: not resizable', ok: !avatar.isResizable() },
    );
    await probe(avatar, 'avatar', checks);
    await probe(chat, 'chat', checks);

    // Chat window must not be able to use avatar-only channels.
    await chat.webContents.executeJavaScript('window.companion.avatar.hide()');
    await new Promise((r) => setTimeout(r, 300));
    checks.push({ name: 'ipc: chat cannot hide avatar', ok: avatar.isVisible() });

    // Avatar window is allowed to.
    await avatar.webContents.executeJavaScript('window.companion.avatar.hide()');
    await new Promise((r) => setTimeout(r, 300));
    checks.push({ name: 'ipc: avatar can hide itself', ok: !avatar.isVisible() });
    windows.showAvatar();

    // Invalid payloads are rejected; valid ones are answered.
    const invalid = await chat.webContents.executeJavaScript(
      `window.companion.chat.send({ text: '' })`,
    );
    checks.push({ name: 'ipc: empty chat rejected', ok: invalid?.ok === false });
    const fromAvatar = await avatar.webContents.executeJavaScript(
      `window.companion.chat.send({ text: 'hi' })`,
    );
    checks.push({ name: 'ipc: avatar cannot use chat:send', ok: fromAvatar?.ok === false });

    await checkAiFlow(chat, avatar, shell.dataDir, checks);

    // Renderers must not be able to open new windows.
    const before = BrowserWindow.getAllWindows().length;
    await chat.webContents.executeJavaScript(`window.open('https://example.com'); true`);
    await new Promise((r) => setTimeout(r, 300));
    const after = BrowserWindow.getAllWindows().length;
    checks.push({ name: 'security: window.open blocked', ok: before === after });

    // ...nor leave the app's own pages.
    const chatUrl = chat.webContents.getURL();
    await chat.webContents.executeJavaScript(`window.location.href = 'https://example.com'; true`);
    await new Promise((r) => setTimeout(r, 500));
    checks.push({ name: 'security: navigation blocked', ok: chat.webContents.getURL() === chatUrl });

    // Permission handlers deny everything for now.
    const notification = await chat.webContents.executeJavaScript(
      `Notification.requestPermission()`,
    );
    checks.push({
      name: 'security: notification permission denied',
      ok: notification === 'denied',
      detail: String(notification),
    });
    const microphone = await chat.webContents.executeJavaScript(
      `navigator.mediaDevices.getUserMedia({ audio: true }).then(() => 'granted', (e) => e.name)`,
    );
    checks.push({
      name: 'security: microphone not granted',
      ok: microphone !== 'granted',
      detail: String(microphone),
    });

    checks.push(
      { name: 'shell: tray created', ok: !shell.tray.isDestroyed() },
      { name: 'shell: global shortcut registered', ok: shell.shortcutRegistered },
    );

    // A second launch must exit on its own and bring the hidden avatar back.
    windows.hideAvatar();
    const secondExit = await launchSecondInstance();
    await new Promise((r) => setTimeout(r, 300));
    checks.push(
      { name: 'single instance: second launch exits', ok: secondExit === 0, detail: String(secondExit) },
      { name: 'single instance: avatar shown again', ok: avatar.isVisible() },
    );
  } catch (error) {
    checks.push({ name: 'smoke test crashed', ok: false, detail: String(error) });
  }

  clearTimeout(timer);
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
  }
  console.log(`\nSmoke test: ${checks.length - failed.length}/${checks.length} passed`);
  app.exit(failed.length === 0 ? 0 : 1);
}
