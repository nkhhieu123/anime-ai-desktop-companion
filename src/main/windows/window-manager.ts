import { BrowserWindow, screen, type WebContents } from 'electron';
import type { ScreenPoint, WindowRole } from '@shared/ipc';
import { secureWebPreferences } from '../security/web-preferences';
import { clampToArea, computeDragPosition, defaultAvatarPosition, type Rect } from './drag';
import { log } from '../log';

export const AVATAR_SIZE = { width: 240, height: 320 } as const;
export const CHAT_SIZE = { width: 380, height: 560 } as const;

export interface WindowManagerOptions {
  preloadPath: string;
  allowDevTools: boolean;
  loadPage(window: BrowserWindow, page: WindowRole): Promise<void>;
  onChatClosed(): void;
}

interface DragState {
  windowStart: ScreenPoint;
  pointerStart: ScreenPoint;
}

function workAreas(): Rect[] {
  return screen.getAllDisplays().map((display) => display.workArea);
}

export class WindowManager {
  private avatar: BrowserWindow | null = null;
  private chat: BrowserWindow | null = null;
  private drag: DragState | null = null;

  constructor(private readonly options: WindowManagerOptions) {}

  get avatarWindow(): BrowserWindow | null {
    return this.avatar;
  }

  get chatWindow(): BrowserWindow | null {
    return this.chat;
  }

  /** Maps a sender back to the role of the window that owns it. */
  roleOf(contents: WebContents): WindowRole | null {
    if (this.avatar && !this.avatar.isDestroyed() && this.avatar.webContents.id === contents.id) {
      return 'avatar';
    }
    if (this.chat && !this.chat.isDestroyed() && this.chat.webContents.id === contents.id) {
      return 'chat';
    }
    return null;
  }

  async createAvatar(): Promise<BrowserWindow> {
    if (this.avatar && !this.avatar.isDestroyed()) return this.avatar;

    const primary = screen.getPrimaryDisplay().workArea;
    const position = defaultAvatarPosition(AVATAR_SIZE, primary);

    const win = new BrowserWindow({
      ...AVATAR_SIZE,
      ...position,
      transparent: true,
      backgroundColor: '#00000000',
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      show: false,
      title: 'Companion',
      webPreferences: secureWebPreferences(this.options.preloadPath, this.options.allowDevTools),
    });
    // 'floating' keeps it above normal windows without fighting full-screen apps.
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true);
    win.once('ready-to-show', () => win.showInactive());
    win.on('closed', () => {
      this.avatar = null;
      this.drag = null;
    });

    this.avatar = win;
    await this.options.loadPage(win, 'avatar');
    return win;
  }

  showAvatar(): void {
    if (!this.avatar || this.avatar.isDestroyed()) {
      void this.createAvatar();
      return;
    }
    this.avatar.showInactive();
  }

  hideAvatar(): void {
    this.drag = null;
    this.avatar?.hide();
  }

  toggleAvatar(): void {
    if (this.avatar && !this.avatar.isDestroyed() && this.avatar.isVisible()) this.hideAvatar();
    else this.showAvatar();
  }

  isAvatarVisible(): boolean {
    return !!this.avatar && !this.avatar.isDestroyed() && this.avatar.isVisible();
  }

  async openChat(): Promise<BrowserWindow> {
    if (this.chat && !this.chat.isDestroyed()) {
      this.chat.show();
      this.chat.focus();
      return this.chat;
    }

    const win = new BrowserWindow({
      ...CHAT_SIZE,
      ...this.chatPosition(),
      minWidth: 320,
      minHeight: 420,
      show: false,
      title: 'Anime AI Companion',
      backgroundColor: '#1d1b26',
      autoHideMenuBar: true,
      webPreferences: secureWebPreferences(this.options.preloadPath, this.options.allowDevTools),
    });
    win.setMenu(null);
    win.once('ready-to-show', () => {
      win.show();
      win.focus();
    });
    win.on('closed', () => {
      this.chat = null;
      this.options.onChatClosed();
    });

    this.chat = win;
    await this.options.loadPage(win, 'chat');
    return win;
  }

  closeChat(): void {
    this.chat?.close();
  }

  dragStart(pointer: ScreenPoint): void {
    if (!this.avatar || this.avatar.isDestroyed()) return;
    const [x = 0, y = 0] = this.avatar.getPosition();
    this.drag = { windowStart: { x, y }, pointerStart: pointer };
  }

  dragMove(pointer: ScreenPoint): void {
    if (!this.drag || !this.avatar || this.avatar.isDestroyed()) return;
    const next = computeDragPosition(
      this.drag.windowStart,
      this.drag.pointerStart,
      pointer,
      AVATAR_SIZE,
      workAreas(),
    );
    this.avatar.setPosition(next.x, next.y);
  }

  dragEnd(): void {
    if (this.drag) log.debug('avatar moved', { x: this.avatar?.getPosition()[0], y: this.avatar?.getPosition()[1] });
    this.drag = null;
  }

  /** Place chat to the left of the avatar when possible, inside the same display. */
  private chatPosition(): ScreenPoint {
    const fallbackArea = screen.getPrimaryDisplay().workArea;
    if (!this.avatar || this.avatar.isDestroyed()) {
      return clampToArea(
        { x: fallbackArea.x + fallbackArea.width - CHAT_SIZE.width - 24, y: fallbackArea.y + 24 },
        CHAT_SIZE,
        fallbackArea,
      );
    }
    const bounds = this.avatar.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const target = {
      x: bounds.x - CHAT_SIZE.width - 12,
      y: bounds.y + bounds.height - CHAT_SIZE.height,
    };
    return clampToArea(target, CHAT_SIZE, area);
  }
}
