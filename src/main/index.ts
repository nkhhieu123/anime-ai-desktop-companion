import { app, globalShortcut, type BrowserWindow, type Tray } from 'electron';
import { join } from 'node:path';
import type { WindowRole } from '@shared/ipc';
import { hardenApp } from './security/harden';
import { isTrustedRendererUrl } from './security/trusted-origin';
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

if (!isSmokeTest && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  hardenApp(isTrustedUrl);

  const windows = new WindowManager({
    preloadPath,
    allowDevTools: !app.isPackaged,
    loadPage,
  });
  const router = new IpcRouter({ roleOf: (wc) => windows.roleOf(wc), isTrustedUrl });
  registerIpcHandlers(router, windows);

  let tray: Tray | null = null;

  app.on('second-instance', () => windows.showAvatar());

  // The app lives in the tray; closing windows must not quit it.
  app.on('window-all-closed', () => {
    /* keep running */
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    router.dispose();
    tray?.destroy();
  });

  app
    .whenReady()
    .then(async () => {
      if (isSmokeTest) {
        await runSmokeTest(windows);
        return;
      }
      tray = createTray(windows);
      if (!globalShortcut.register(TOGGLE_SHORTCUT, () => windows.toggleAvatar())) {
        log.warn('global shortcut unavailable', { accelerator: TOGGLE_SHORTCUT });
      }
      await windows.createAvatar();
      log.info('companion started', { version: app.getVersion(), dev: !!devServerUrl });
    })
    .catch((error: unknown) => {
      log.error('startup failed', { error: String(error) });
      app.exit(1);
    });
}
