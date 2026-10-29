import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { buildCsp } from '@shared/csp';
import { CHANNEL_ROLES, IPC } from '@shared/ipc';
import { isTrustedRendererUrl } from '../src/main/security/trusted-origin';
import { authorizeSender, type SenderInfo } from '../src/main/security/sender';
import { secureWebPreferences } from '../src/main/security/web-preferences';

const rendererDir = resolve(tmpdir(), 'companion-app', 'out', 'renderer');
const fileUrl = (...parts: string[]) => pathToFileURL(join(rendererDir, ...parts)).href;

describe('isTrustedRendererUrl (production)', () => {
  const opts = { rendererDir };

  it('trusts pages inside the renderer directory', () => {
    expect(isTrustedRendererUrl(fileUrl('avatar.html'), opts)).toBe(true);
    expect(isTrustedRendererUrl(`${fileUrl('chat.html')}#x`, opts)).toBe(true);
  });

  it('rejects files outside the renderer directory', () => {
    expect(isTrustedRendererUrl(pathToFileURL(resolve(rendererDir, '..', 'main', 'index.js')).href, opts)).toBe(false);
    expect(isTrustedRendererUrl(pathToFileURL(`${rendererDir}-evil/avatar.html`).href, opts)).toBe(false);
  });

  it('rejects path traversal', () => {
    expect(isTrustedRendererUrl(`${pathToFileURL(rendererDir).href}/../../secrets.html`, opts)).toBe(false);
  });

  it('rejects remote and odd schemes', () => {
    for (const url of ['https://example.com/avatar.html', 'http://localhost:5173/avatar.html', 'javascript:alert(1)', 'data:text/html,hi', 'not a url', '']) {
      expect(isTrustedRendererUrl(url, opts)).toBe(false);
    }
  });

  it('supports case-insensitive paths for Windows', () => {
    const upper = pathToFileURL(join(rendererDir.toUpperCase(), 'avatar.html')).href;
    expect(isTrustedRendererUrl(upper, { rendererDir, caseInsensitive: true })).toBe(true);
  });
});

describe('isTrustedRendererUrl (development)', () => {
  const opts = { rendererDir, devServerUrl: 'http://localhost:5173' };

  it('trusts only the dev server origin', () => {
    expect(isTrustedRendererUrl('http://localhost:5173/avatar.html', opts)).toBe(true);
    expect(isTrustedRendererUrl('http://localhost:5174/avatar.html', opts)).toBe(false);
    expect(isTrustedRendererUrl('http://localhost.evil.com:5173/', opts)).toBe(false);
    expect(isTrustedRendererUrl(fileUrl('avatar.html'), opts)).toBe(false);
  });
});

describe('authorizeSender', () => {
  const trusted = (url: string) => url.startsWith('app://ok/');
  const base: SenderInfo = { channel: IPC.chatSend, role: 'chat', frameUrl: 'app://ok/chat.html', isMainFrame: true };

  it('allows the right window on its own channel', () => {
    expect(authorizeSender(base, trusted)).toEqual({ allowed: true, role: 'chat' });
  });

  it.each<[Partial<SenderInfo>, string]>([
    [{ channel: 'shell:exec' }, 'unknown-channel'],
    [{ channel: '__proto__' }, 'unknown-channel'],
    [{ role: null }, 'unknown-window'],
    [{ isMainFrame: false }, 'subframe'],
    [{ frameUrl: null }, 'untrusted-origin'],
    [{ frameUrl: 'https://evil.example/' }, 'untrusted-origin'],
    [{ role: 'avatar' }, 'role-not-allowed'],
  ])('rejects %j with %s', (override, reason) => {
    expect(authorizeSender({ ...base, ...override }, trusted)).toEqual({ allowed: false, reason });
  });

  it('assigns every channel to at least one role', () => {
    for (const channel of Object.values(IPC)) {
      expect(CHANNEL_ROLES[channel].length).toBeGreaterThan(0);
    }
  });

  it('keeps avatar-only channels away from chat', () => {
    for (const channel of [IPC.avatarDragStart, IPC.avatarDragMove, IPC.avatarHide, IPC.chatOpen]) {
      expect(authorizeSender({ ...base, channel, role: 'chat' }, trusted).allowed).toBe(false);
    }
  });
});

describe('secureWebPreferences', () => {
  it('locks down every renderer', () => {
    const prefs = secureWebPreferences('/x/preload.cjs', false);
    expect(prefs).toMatchObject({
      preload: '/x/preload.cjs',
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: false,
    });
  });
});

describe('buildCsp', () => {
  it('is strict in production', () => {
    const csp = buildCsp(false);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('ws:');
    expect(csp).not.toMatch(/https?:/);
  });

  it('only relaxes what Vite HMR needs in development', () => {
    const csp = buildCsp(true);
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain('ws://localhost:*');
    expect(csp).not.toContain('unsafe-eval');
  });
});
