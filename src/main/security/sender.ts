import { CHANNEL_ROLES, type IpcChannel, type WindowRole } from '@shared/ipc';

export interface SenderInfo {
  channel: string;
  /** Role of the BrowserWindow that owns the sender, null if unknown. */
  role: WindowRole | null;
  /** URL of the frame that sent the message, null if the frame is gone. */
  frameUrl: string | null;
  /** Subframes (iframes) are never allowed to talk to main. */
  isMainFrame: boolean;
}

export type SenderDecision = { allowed: true; role: WindowRole } | { allowed: false; reason: string };

function isKnownChannel(channel: string): channel is IpcChannel {
  return Object.prototype.hasOwnProperty.call(CHANNEL_ROLES, channel);
}

export function authorizeSender(
  info: SenderInfo,
  isTrustedUrl: (url: string) => boolean,
): SenderDecision {
  if (!isKnownChannel(info.channel)) return { allowed: false, reason: 'unknown-channel' };
  if (info.role === null) return { allowed: false, reason: 'unknown-window' };
  if (!info.isMainFrame) return { allowed: false, reason: 'subframe' };
  if (info.frameUrl === null || !isTrustedUrl(info.frameUrl)) {
    return { allowed: false, reason: 'untrusted-origin' };
  }
  if (!CHANNEL_ROLES[info.channel].includes(info.role)) {
    return { allowed: false, reason: 'role-not-allowed' };
  }
  return { allowed: true, role: info.role };
}
