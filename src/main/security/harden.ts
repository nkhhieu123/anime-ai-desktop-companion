import { app, session } from 'electron';
import { log } from '../log';

/**
 * Global hardening applied to every webContents the app ever creates.
 * - no new windows from renderers
 * - no navigation away from trusted app pages
 * - no <webview>
 * - all permission requests denied (voice input will opt in explicitly later)
 */
export function hardenApp(isTrustedUrl: (url: string) => boolean): void {
  app.enableSandbox();

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      log.warn('blocked window.open', { url: safeUrlForLog(url) });
      return { action: 'deny' };
    });

    contents.on('will-navigate', (event, url) => {
      if (!isTrustedUrl(url)) {
        event.preventDefault();
        log.warn('blocked navigation', { url: safeUrlForLog(url) });
      }
    });

    contents.on('will-redirect', (event, url) => {
      if (!isTrustedUrl(url)) {
        event.preventDefault();
        log.warn('blocked redirect', { url: safeUrlForLog(url) });
      }
    });

    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
      log.warn('blocked webview attach');
    });

    contents.on('did-fail-load', (_event, code, description, url) => {
      log.error('renderer failed to load', { code, description, url: safeUrlForLog(url) });
    });

    contents.on('render-process-gone', (_event, details) => {
      log.error('renderer process gone', { reason: details.reason, exitCode: details.exitCode });
    });

    contents.on('preload-error', (_event, preloadPath, error) => {
      log.error('preload failed', { preloadPath, error: String(error) });
    });
  });

  app.whenReady().then(() => {
    const ses = session.defaultSession;
    ses.setPermissionRequestHandler((_wc, permission, callback) => {
      log.warn('denied permission request', { permission });
      callback(false);
    });
    ses.setPermissionCheckHandler(() => false);
    ses.setDevicePermissionHandler(() => false);
  });
}

/** Strip query/hash so tokens in URLs never end up in logs. */
function safeUrlForLog(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return '<invalid-url>';
  }
}
