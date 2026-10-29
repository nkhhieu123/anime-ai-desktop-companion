import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { buildCsp } from './src/shared/csp';

/**
 * Injects the Content-Security-Policy meta tag into every renderer HTML page.
 * Dev mode needs a slightly relaxed policy for Vite HMR (inline React refresh
 * preamble + websocket); production builds get the strict policy.
 */
function cspPlugin(): Plugin {
  let isDev = false;
  return {
    name: 'companion-csp',
    configResolved(config) {
      isDev = config.command === 'serve';
    },
    transformIndexHtml(html) {
      const meta = `<meta http-equiv="Content-Security-Policy" content="${buildCsp(isDev)}" />`;
      return html.replace('<!-- CSP -->', meta);
    },
  };
}

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.ts') } },
    },
  },
  preload: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        // Sandboxed preloads must be a single CommonJS file.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: { alias: { '@shared': resolve('src/shared') } },
    plugins: [react(), cspPlugin()],
    build: {
      minify: true,
      rollupOptions: {
        input: {
          avatar: resolve('src/renderer/avatar.html'),
          chat: resolve('src/renderer/chat.html'),
        },
      },
    },
  },
});
