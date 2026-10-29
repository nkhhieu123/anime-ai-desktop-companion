import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type CompanionApi, type ScreenPoint } from '@shared/ipc';

/**
 * The renderer's only bridge to the main process. Each method maps to one
 * fixed channel; arguments are copied into fresh plain objects so callers
 * cannot smuggle extra fields or prototypes. Main validates everything again.
 */
const point = (p: ScreenPoint): ScreenPoint => ({ x: Number(p?.x), y: Number(p?.y) });

const api: CompanionApi = {
  avatar: {
    dragStart: (p) => ipcRenderer.send(IPC.avatarDragStart, point(p)),
    dragMove: (p) => ipcRenderer.send(IPC.avatarDragMove, point(p)),
    dragEnd: () => ipcRenderer.send(IPC.avatarDragEnd),
    hide: () => ipcRenderer.send(IPC.avatarHide),
    openChat: () => ipcRenderer.send(IPC.chatOpen),
  },
  chat: {
    send: (request) => ipcRenderer.invoke(IPC.chatSend, { text: String(request?.text ?? '') }),
    close: () => ipcRenderer.send(IPC.chatClose),
  },
  app: {
    getInfo: () => ipcRenderer.invoke(IPC.appGetInfo),
  },
};

contextBridge.exposeInMainWorld('companion', api);
