import { app, globalShortcut, type BrowserWindow, type Tray } from 'electron';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHAT_EVENT_CHANNEL } from '@shared/ipc';
import type { WindowRole } from '@shared/ipc';
import { hardenApp } from './security/harden';
import { isTrustedRendererUrl } from './security/trusted-origin';
import { AiService } from './ai/ai-service';
import { OllamaProvider } from './ai/ollama-provider';
import { createConversationStore, createSettingsStore } from './ai/stores';
import { WindowManager } from './windows/window-manager';
import { IpcRouter } from './ipc/router';
import { registerIpcHandlers } from './ipc/handlers';
import { createTray } from './tray';
import { runSmokeTest } from './smoke-test';
import { log } from './log';

const TOGGLE_SHORTCUT = 'CommandOrControl+Alt+A';

const isSmokeTest = process.argv.includes('--smoke-test');
const devServerUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined;
const rendererDir = join(__dirname, '../renderer');
const preloadPath = join(__dirname, '../preload/index.cjs');

const isTrustedUrl = (url: string): boolean =>
  isTrustedRendererUrl(url, {
    devServerUrl,
    rendererDir,
    caseInsensitive: process.platform === 'win32',
  });

async function loadPage(window: BrowserWindow, page: WindowRole): Promise<void> {
  if (devServerUrl) await window.loadURL(`${devServerUrl}/${page}.html`);
  else await window.loadFile(join(rendererDir, `${page}.html`));
}

// Windows notifications and taskbar grouping.
app.setAppUserModelId('com.animecompanion.desktop');

if (!app.requestSingleInstanceLock()) {
  // A smoke test that can't take the lock tested nothing; it must not look like a pass.
  if (isSmokeTest) {
    console.error('Smoke test: another instance is running, close it first.');
    app.exit(1);
  } else {
    app.quit();
  }
} else {
  hardenApp(isTrustedUrl);

  const windows = new WindowManager({
    preloadPath,
    allowDevTools: !app.isPackaged,
    loadPage,
    onChatClosed: () => ai?.cancelAll(),
  });
  const router = new IpcRouter({ roleOf: (wc) => windows.roleOf(wc), isTrustedUrl });

  let tray: Tray | null = null;
  let ai: AiService | null = null;

  app.on('second-instance', () => windows.showAvatar());

  // The app lives in the tray; closing windows must not quit it.
  app.on('window-all-closed', () => {
    /* keep running */
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    ai?.cancelAll();
    router.dispose();
    tray?.destroy();
  });

  app
    .whenReady()
    .then(async () => {
      // The smoke test must never read or change the user's real data.
      const dataDir = isSmokeTest
        ? mkdtempSync(join(tmpdir(), 'companion-smoke-'))
        : app.getPath('userData');
      ai = new AiService({
        settingsStore: createSettingsStore(dataDir),
        conversationStore: createConversationStore(dataDir),
        createProvider: (endpoint) => new OllamaProvider(endpoint),
        uiLocale: app.getLocale(),
        emit: (event) => {
          const chat = windows.chatWindow;
          if (chat && !chat.isDestroyed()) chat.webContents.send(CHAT_EVENT_CHANNEL, event);
        },
      });
      await ai.init();
      registerIpcHandlers(router, windows, ai);

      tray = createTray(windows);
      const shortcutRegistered = globalShortcut.register(TOGGLE_SHORTCUT, () =>
        windows.toggleAvatar(),
      );
      if (!shortcutRegistered) {
        log.warn('global shortcut unavailable', { accelerator: TOGGLE_SHORTCUT });
      }
      if (isSmokeTest) {
        await runSmokeTest(windows, { tray, shortcutRegistered, dataDir });
        return;
      }
      await windows.createAvatar();
      log.info('companion started', { version: app.getVersion(), dev: !!devServerUrl });
    })
    .catch((error: unknown) => {
      log.error('startup failed', { error: String(error) });
      app.exit(1);
    });
}
