import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { CHAT_MESSAGE_MAX_LENGTH, type ChatReply } from '@shared/ipc';
import { formatTime, type MessageKey } from '@shared/i18n';
import { locale, t } from '../i18n';

type Author = 'user' | 'companion' | 'system';

interface Message {
  id: number;
  author: Author;
  text: string;
  at: Date;
}

const AUTHOR_LABEL: Record<Author, MessageKey> = {
  user: 'chat.you',
  companion: 'chat.companion',
  system: 'chat.system',
};

function replyToMessage(reply: ChatReply): { author: Author; text: string } {
  if (!reply.ok) {
    return {
      author: 'system',
      text: t(reply.error === 'invalid-input' ? 'chat.error.invalid' : 'chat.error.internal'),
    };
  }
  return { author: 'system', text: t('chat.aiNotConnected') };
}

export function ChatApp() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const listEnd = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const push = (author: Author, text: string) => {
    const message = { id: nextId.current++, author, text, at: new Date() };
    setMessages((current) => [...current, message]);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || busy || text.length > CHAT_MESSAGE_MAX_LENGTH) return;
    push('user', text);
    setDraft('');
    setBusy(true);
    try {
      const reply = await window.companion.chat.send({ text });
      const { author, text: replyText } = replyToMessage(reply);
      push(author, replyText);
    } catch {
      push('system', t('chat.error.internal'));
    } finally {
      setBusy(false);
      input.current?.focus();
    }
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

  const tooLong = draft.length > CHAT_MESSAGE_MAX_LENGTH;

  return (
    <div className="chat">
      <header className="chat-header">
        <h1>{t('chat.title')}</h1>
        <span className="status-badge" role="status">
          <span className="status-dot" aria-hidden="true" />
          {t('chat.status.notConnected')}
        </span>
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

      <main className="chat-log" aria-live="polite">
        {messages.length === 0 && <p className="chat-empty">{t('chat.empty')}</p>}
        {messages.map((message) => (
          <article key={message.id} className={`bubble bubble-${message.author}`}>
            <header>
              <span>{t(AUTHOR_LABEL[message.author])}</span>
              <time dateTime={message.at.toISOString()}>{formatTime(message.at, locale)}</time>
            </header>
            <p>{message.text}</p>
          </article>
        ))}
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
            {t('chat.counter', { count: draft.length, max: CHAT_MESSAGE_MAX_LENGTH })}
          </span>
          <button type="submit" className="send-button" disabled={busy || !draft.trim() || tooLong}>
            {t('chat.send')}
          </button>
        </div>
      </form>
    </div>
  );
}
