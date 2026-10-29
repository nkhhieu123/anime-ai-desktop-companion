import type { WebPreferences } from 'electron';

/** The only webPreferences any window in this app may use. */
export function secureWebPreferences(preloadPath: string, allowDevTools: boolean): WebPreferences {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    webviewTag: false,
    navigateOnDragDrop: false,
    spellcheck: false,
    devTools: allowDevTools,
  };
}
