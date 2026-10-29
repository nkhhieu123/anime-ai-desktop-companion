import vi from './locales/vi-VN.json';
import en from './locales/en-US.json';

/**
 * UI translations. Adding a language = adding a JSON file with the same keys
 * as en-US.json and registering it here. Missing keys fall back to en-US,
 * then to the key itself, so a partial translation never breaks the UI.
 */
export type Messages = typeof en;
export type MessageKey = keyof Messages;

export const FALLBACK_LOCALE = 'en-US';

const catalogs: Record<string, Partial<Messages>> = {
  'vi-VN': vi,
  'en-US': en,
};

export const SUPPORTED_UI_LOCALES = Object.keys(catalogs);

/** Map any BCP-47 tag (e.g. "vi", "en-GB") to a supported UI locale. */
export function resolveUiLocale(requested: string | undefined | null): string {
  if (!requested) return FALLBACK_LOCALE;
  const tag = requested.trim().replace('_', '-').toLowerCase();
  const exact = SUPPORTED_UI_LOCALES.find((l) => l.toLowerCase() === tag);
  if (exact) return exact;
  const language = tag.split('-')[0];
  return SUPPORTED_UI_LOCALES.find((l) => l.toLowerCase().split('-')[0] === language) ?? FALLBACK_LOCALE;
}

export type Translator = (key: MessageKey, params?: Record<string, string | number>) => string;

export function createTranslator(
  locale: string,
  extraCatalogs: Record<string, Partial<Messages>> = {},
): Translator {
  const all = { ...catalogs, ...extraCatalogs };
  const primary = all[locale] ?? {};
  const fallback = all[FALLBACK_LOCALE] ?? {};
  const numberFormat = new Intl.NumberFormat(locale);

  return (key, params) => {
    const template = primary[key] ?? fallback[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = params[name];
      if (value === undefined) return match;
      return typeof value === 'number' ? numberFormat.format(value) : value;
    });
  };
}

export function formatTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
}
