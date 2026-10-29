import { useRef, useState, type PointerEvent } from 'react';
import { t } from '../i18n';
import { Character } from './Character';

/**
 * Avatar window. The character is dragged with pointer events: the renderer
 * only reports screen coordinates, main computes and clamps the position.
 */
export function AvatarApp() {
  const [dragging, setDragging] = useState(false);
  const pending = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef<number | null>(null);

  const flush = () => {
    frame.current = null;
    if (pending.current) window.companion.avatar.dragMove(pending.current);
    pending.current = null;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    window.companion.avatar.dragStart({ x: event.screenX, y: event.screenY });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    // One IPC message per animation frame is plenty.
    pending.current = { x: event.screenX, y: event.screenY };
    frame.current ??= requestAnimationFrame(flush);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    flush();
    setDragging(false);
    window.companion.avatar.dragEnd();
  };

  return (
    <div className="avatar-root">
      <div className="avatar-toolbar" role="toolbar">
        <button
          type="button"
          className="avatar-button"
          title={t('avatar.openChat')}
          aria-label={t('avatar.openChat')}
          onClick={() => window.companion.avatar.openChat()}
        >
          <ChatIcon />
        </button>
        <button
          type="button"
          className="avatar-button"
          title={t('avatar.hide')}
          aria-label={t('avatar.hide')}
          onClick={() => window.companion.avatar.hide()}
        >
          <HideIcon />
        </button>
      </div>

      <div
        className={`avatar-stage${dragging ? ' is-dragging' : ''}`}
        title={t('avatar.dragHint')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => window.companion.avatar.openChat()}
      >
        <Character />
      </div>
    </div>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4.5 3.6A.6.6 0 0 1 3.5 20V6a2 2 0 0 1 .5-2Zm3 6.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm5 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm5 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z"
      />
    </svg>
  );
}

function HideIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Zm9-2.5a2.5 2.5 0 1 0 0 5M4 4l16 16"
      />
    </svg>
  );
}
