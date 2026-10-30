import type { ConnectionReport, AiSettings } from '@shared/ai';
import type { NoticeCode, UiMessage } from '@shared/chat-state';
import type { MessageKey } from '@shared/i18n';
import { t } from '../i18n';

const NOTICE_KEYS: Record<Exclude<NoticeCode, 'model-not-found' | 'provider-error'>, MessageKey> = {
  'invalid-input': 'chat.error.invalid',
  busy: 'chat.error.busy',
  'too-long': 'chat.error.tooLong',
  internal: 'chat.error.internal',
  'save-failed': 'chat.saveFailed',
  'no-model': 'chat.error.noModel',
  connection: 'chat.error.connection',
  timeout: 'chat.error.timeout',
  'empty-response': 'chat.error.empty',
  'response-too-long': 'chat.error.responseTooLong',
  'bad-response': 'chat.error.badResponse',
};

export function noticeText(message: Extract<UiMessage, { kind: 'notice' }>): string {
  if (message.code === 'model-not-found') {
    return t('chat.error.modelNotFound', { model: message.model ?? '' });
  }
  if (message.code === 'provider-error') {
    return message.detail ? t('chat.error.providerDetail', { detail: message.detail }) : t('chat.error.provider');
  }
  return t(NOTICE_KEYS[message.code]);
}

export type ChatStatus = 'checking' | 'ok' | 'offline' | 'no-model' | 'model-missing';

export function connectionStatus(report: ConnectionReport | null, settings: AiSettings | null): ChatStatus {
  if (!report || !settings) return 'checking';
  if (report.status !== 'ok') return 'offline';
  if (!settings.model) return 'no-model';
  return report.selectedModelInstalled ? 'ok' : 'model-missing';
}

export const STATUS_KEYS: Record<Exclude<ChatStatus, 'ok'>, MessageKey> = {
  checking: 'chat.status.checking',
  offline: 'chat.status.offline',
  'no-model': 'chat.status.noModel',
  'model-missing': 'chat.status.modelMissing',
};
