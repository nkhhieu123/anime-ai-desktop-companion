import { useCallback, useEffect, useReducer, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { DEFAULT_AI_SETTINGS, type AiSettings, type ConnectionReport } from '@shared/ai';
import { chatReducer, INITIAL_CHAT_STATE, type UiMessage } from '@shared/chat-state';
import { formatTime } from '@shared/i18n';
import { locale, t } from '../i18n';
import { connectionStatus, noticeText, STATUS_KEYS } from './messages';
import { SettingsPanel } from './SettingsPanel';

const now = () => new Date().toISOString();

export function ChatApp() {
  const [chat, dispatch] = useReducer(chatReducer, INITIAL_CHAT_STATE);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [report, setReport] = useState<ConnectionReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  const [draft, setDraft] = useState('');
  const listEnd = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const checkConnection = useCallback(async () => {
    setChecking(true);
    try {
      setReport(await window.companion.ai.checkConnection());
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => window.companion.chat.onEvent((event) => dispatch({ type: 'event', event, at: now() })), []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [loadedSettings, history] = await Promise.all([
        window.companion.ai.getSettings(),
        window.companion.chat.getHistory(),
      ]);
      if (!active) return;
      setSettings(loadedSettings ?? DEFAULT_AI_SETTINGS);
      dispatch({ type: 'load-history', history });
      await checkConnection();
    })();
    return () => {
      active = false;
    };
  }, [checkConnection]);

  useEffect(() => {
    if (view === 'chat') input.current?.focus();
  }, [view]);

  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: 'end' });
  }, [chat.messages, view]);

  const send = async () => {
    const text = draft.trim();
    if (!text || chat.busy || !settings || text.length > settings.maxInputChars) return;
    setDraft('');
    dispatch({ type: 'send', text, at: now(), model: settings.model });
    try {
      const reply = await window.companion.chat.send({ text });
      if (reply.ok) dispatch({ type: 'started', requestId: reply.requestId });
      else dispatch({ type: 'rejected', code: reply.error, at: now() });
    } catch {
      dispatch({ type: 'rejected', code: 'internal', at: now() });
    }
    input.current?.focus();
  };

  const updateSettings = async (patch: Partial<AiSettings>) => {
    const result = await window.companion.ai.updateSettings(patch);
    if (result.ok) setSettings(result.settings);
    return result;
  };

  const updateModel = async (patch: Partial<AiSettings>) => {
    const result = await updateSettings(patch);
    // The header status depends on whether the new choice is installed.
    if (result.ok && 'model' in patch) await checkConnection();
    return result;
  };

  const clearConversation = async () => {
    await window.companion.chat.clear();
    dispatch({ type: 'reset' });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Don't send while an IME (e.g. Vietnamese Telex) is still composing.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  const maxLength = settings?.maxInputChars ?? DEFAULT_AI_SETTINGS.maxInputChars;
  const tooLong = draft.length > maxLength;
  const status = connectionStatus(report, settings);
  const last = chat.messages.at(-1);
  const isStreaming = last?.kind === 'text' && last.status === 'streaming';

  return (
    <div className="chat">
      <header className="chat-header">
        <h1>{view === 'chat' ? t('chat.title') : t('settings.title')}</h1>
        <span className={`status-badge status-${status}`} role="status">
          <span className="status-dot" aria-hidden="true" />
          {status === 'ok' ? settings?.model : t(STATUS_KEYS[status])}
        </span>
        {view === 'chat' && (
          <button
            type="button"
            className="icon-button settings-toggle"
            aria-label={t('chat.settings')}
            title={t('chat.settings')}
            onClick={() => setView('settings')}
          >
            ⚙
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label={t('chat.close')}
          title={t('chat.close')}
          onClick={() => window.companion.chat.close()}
        >
          ×
        </button>
      </header>

      {view === 'settings' && settings ? (
        <SettingsPanel
          settings={settings}
          report={report}
          checking={checking}
          onUpdate={updateModel}
          onCheck={() => void checkConnection()}
          onClearConversation={() => void clearConversation()}
          onBack={() => setView('chat')}
        />
      ) : (
        <>
          <main className="chat-log" aria-live="polite">
            {chat.messages.length === 0 && <p className="chat-empty">{t('chat.empty')}</p>}
            {chat.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {chat.busy && !isStreaming && <p className="chat-thinking">{t('chat.thinking')}</p>}
            <div ref={listEnd} />
          </main>

          <form className="chat-input" onSubmit={onSubmit}>
            <textarea
              ref={input}
              value={draft}
              rows={3}
              placeholder={t('chat.placeholder')}
              aria-label={t('chat.placeholder')}
              aria-invalid={tooLong}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className="chat-input-row">
              <span className={`counter${tooLong ? ' is-over' : ''}`}>
                {t('chat.counter', { count: draft.length, max: maxLength })}
              </span>
              {chat.busy ? (
                <button
                  type="button"
                  className="send-button stop-button"
                  disabled={!chat.activeRequestId}
                  onClick={() => {
                    if (chat.activeRequestId) window.companion.chat.cancel(chat.activeRequestId);
                  }}
                >
                  {t('chat.stop')}
                </button>
              ) : (
                <button type="submit" className="send-button" disabled={!draft.trim() || tooLong}>
                  {t('chat.send')}
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: UiMessage }) {
  if (message.kind === 'notice') {
    return (
      <article className="bubble bubble-system" role="alert">
        <header>
          <span>{t('chat.system')}</span>
          <time dateTime={message.at}>{formatTime(new Date(message.at), locale)}</time>
        </header>
        <p>{noticeText(message)}</p>
      </article>
    );
  }
  const status = message.status ? ` is-${message.status}` : '';
  return (
    <article className={`bubble bubble-${message.author}${status}`}>
      <header>
        <span>{t(message.author === 'user' ? 'chat.you' : 'chat.companion')}</span>
        <time dateTime={message.at}>{formatTime(new Date(message.at), locale)}</time>
      </header>
      {/* Rendered as a text node: model output can never become markup. */}
      <p>{message.text}</p>
      {message.status === 'cancelled' && <small className="bubble-tag">{t('chat.stopped')}</small>}
    </article>
  );
}
