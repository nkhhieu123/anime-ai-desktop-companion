import { Menu, Tray, app, nativeImage } from 'electron';
import { createTranslator, resolveUiLocale } from '@shared/i18n';
import { createTrayBitmap } from './tray-icon';
import type { WindowManager } from './windows/window-manager';

/** Tray icon: the always-available way back to a hidden avatar. */
export function createTray(windows: WindowManager): Tray {
  const size = 32;
  const icon = nativeImage.createFromBitmap(createTrayBitmap(size), { width: size, height: size });
  const tray = new Tray(icon.resize({ width: 16, height: 16 }));
  // Stage 2 switches this to the UI-language setting.
  const t = createTranslator(resolveUiLocale(app.getLocale()));

  const rebuild = (): void => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: windows.isAvatarVisible() ? t('tray.hideAvatar') : t('tray.showAvatar'),
          click: () => {
            windows.toggleAvatar();
            rebuild();
          },
        },
        { label: t('tray.openChat'), click: () => void windows.openChat() },
        { type: 'separator' },
        { label: t('tray.quit'), click: () => app.quit() },
      ]),
    );
  };

  tray.setToolTip(t('tray.tooltip'));
  tray.on('click', () => {
    windows.toggleAvatar();
    rebuild();
  });
  // Visibility can also change from the avatar's own hide button.
  tray.on('right-click', rebuild);
  rebuild();
  return tray;
}
