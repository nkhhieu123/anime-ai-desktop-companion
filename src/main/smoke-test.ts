import { app, BrowserWindow, type Tray } from 'electron';
import { spawn } from 'node:child_process';
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
    { name: `${label}: companion api`, ok: result.companionKeys === 'app,avatar,chat', detail: String(result.companionKeys) },
    { name: `${label}: api frozen`, ok: result.apiFrozen === true },
    { name: `${label}: CSP meta present`, ok: typeof result.csp === 'string' && String(result.csp).includes("default-src 'none'") },
    { name: `${label}: React rendered`, ok: result.rootRendered === true },
  );
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
  }, 30_000);

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
    const valid = await chat.webContents.executeJavaScript(
      `window.companion.chat.send({ text: 'Xin chào, bạn khỏe không? 😊' })`,
    );
    checks.push({ name: 'ipc: vietnamese chat accepted', ok: valid?.ok === true });
    const fromAvatar = await avatar.webContents.executeJavaScript(
      `window.companion.chat.send({ text: 'hi' })`,
    );
    checks.push({ name: 'ipc: avatar cannot use chat:send', ok: fromAvatar?.ok === false });

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
