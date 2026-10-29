import { createTranslator, resolveUiLocale } from '@shared/i18n';

// Stage 2 reads the UI language from settings; for now follow the OS/browser locale.
export const locale = resolveUiLocale(navigator.language);
export const t = createTranslator(locale);

document.documentElement.lang = locale;
