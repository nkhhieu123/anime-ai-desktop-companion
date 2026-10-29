/**
 * Content-Security-Policy for renderer pages.
 *
 * Production is strict: only same-origin scripts/styles, no inline scripts,
 * no eval, no remote connections. Dev mode additionally allows what the Vite
 * dev server needs (inline React refresh preamble and the HMR websocket).
 */
export function buildCsp(isDev: boolean): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'none'"],
    'script-src': ["'self'"],
    'style-src': ["'self'"],
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'media-src': ["'self'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
    'object-src': ["'none'"],
  };

  if (isDev) {
    directives['script-src']!.push("'unsafe-inline'");
    directives['style-src']!.push("'unsafe-inline'");
    directives['connect-src']!.push('ws://localhost:*', 'ws://127.0.0.1:*');
  }

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}
