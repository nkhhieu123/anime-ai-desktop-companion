import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';

export interface TrustedOriginOptions {
  /** Vite dev server URL in development, undefined in production. */
  devServerUrl?: string | undefined;
  /** Absolute directory holding the built renderer HTML in production. */
  rendererDir: string;
  /** Windows paths are case-insensitive. */
  caseInsensitive?: boolean;
}

/**
 * True only for pages that belong to this app: the dev server origin during
 * development, or files inside the built renderer directory in production.
 */
export function isTrustedRendererUrl(rawUrl: string, options: TrustedOriginOptions): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (options.devServerUrl) {
    let dev: URL;
    try {
      dev = new URL(options.devServerUrl);
    } catch {
      return false;
    }
    return url.origin === dev.origin && (url.protocol === 'http:' || url.protocol === 'https:');
  }

  if (url.protocol !== 'file:') return false;

  let filePath: string;
  try {
    filePath = resolve(fileURLToPath(url));
  } catch {
    return false;
  }
  let root = resolve(options.rendererDir) + sep;
  if (options.caseInsensitive) {
    filePath = filePath.toLowerCase();
    root = root.toLowerCase();
  }
  return filePath.startsWith(root);
}
