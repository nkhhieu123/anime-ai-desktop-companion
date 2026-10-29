import { describe, expect, it } from 'vitest';
import { createTranslator, formatTime, resolveUiLocale } from '@shared/i18n';
import vi from '../src/shared/locales/vi-VN.json';
import en from '../src/shared/locales/en-US.json';

describe('resolveUiLocale', () => {
  it.each([
    ['vi', 'vi-VN'],
    ['vi-VN', 'vi-VN'],
    ['vi_VN', 'vi-VN'],
    ['en', 'en-US'],
    ['en-GB', 'en-US'],
    ['ja-JP', 'en-US'],
    ['', 'en-US'],
    [undefined, 'en-US'],
  ])('%s -> %s', (input, expected) => {
    expect(resolveUiLocale(input)).toBe(expected);
  });
});

describe('createTranslator', () => {
  it('translates into Vietnamese with diacritics intact', () => {
    const t = createTranslator('vi-VN');
    expect(t('chat.send')).toBe('Gửi');
    expect(t('chat.title')).toBe('Trò chuyện');
  });

  it('falls back to English for missing keys, then to the key', () => {
    const t = createTranslator('fr-FR', { 'fr-FR': { 'chat.send': 'Envoyer' } });
    expect(t('chat.send')).toBe('Envoyer');
    expect(t('chat.close')).toBe('Close');
    expect(t('does.not.exist' as never)).toBe('does.not.exist');
  });

  it('interpolates parameters with locale number formatting', () => {
    expect(createTranslator('en-US')('chat.counter', { count: 1234, max: 4000 })).toBe('1,234/4,000');
    expect(createTranslator('vi-VN')('chat.counter', { count: 1234, max: 4000 })).toBe('1.234/4.000');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(createTranslator('en-US')('chat.counter', { count: 1 })).toBe('1/{max}');
  });
});

describe('locale files', () => {
  it('vi-VN has exactly the same keys as en-US', () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty strings', () => {
    for (const catalog of [vi, en]) {
      for (const value of Object.values(catalog)) expect(value.trim()).not.toBe('');
    }
  });
});

describe('formatTime', () => {
  it('formats per locale', () => {
    const date = new Date(2026, 0, 1, 15, 5);
    expect(formatTime(date, 'vi-VN')).toBe('15:05');
    expect(formatTime(date, 'en-US')).toMatch(/03:05\sPM/);
  });
});
