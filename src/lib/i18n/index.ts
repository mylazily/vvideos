import zh from './locales/zh';
import en from './locales/en';
import ko from './locales/ko';
import ja from './locales/ja';
import vi from './locales/vi';
import th from './locales/th';

export const SUPPORTED_LOCALES = ['zh', 'en', 'ko', 'ja', 'vi', 'th'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'zh';

const localeMap: Record<Locale, Record<string, string>> = { zh, en, ko, ja, vi, th };

export const LOCALE_NAMES: Record<Locale, string> = {
  zh: '中文',
  en: 'English',
  ko: '한국어',
  ja: '日本語',
  vi: 'Tiếng Việt',
  th: 'ไทย',
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  zh: '🇨🇳',
  en: '🇺🇸',
  ko: '🇰🇷',
  ja: '🇯🇵',
  vi: '🇻🇳',
  th: '🇹🇭',
};

// HTML lang 属性映射
export const HTML_LANG: Record<Locale, string> = {
  zh: 'zh-CN',
  en: 'en',
  ko: 'ko',
  ja: 'ja',
  vi: 'vi',
  th: 'th',
};

// OG locale 映射
export const OG_LOCALE: Record<Locale, string> = {
  zh: 'zh_CN',
  en: 'en_US',
  ko: 'ko_KR',
  ja: 'ja_JP',
  vi: 'vi_VN',
  th: 'th_TH',
};

/**
 * 从URL路径中提取语言代码
 * /en/v/123 → 'en'
 * /ko/category/动作片/1 → 'ko'
 * /v/123 → 'zh' (默认)
 */
export function getLocaleFromPath(pathname: string): Locale {
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  if (firstSegment && SUPPORTED_LOCALES.includes(firstSegment as Locale)) {
    return firstSegment as Locale;
  }
  return DEFAULT_LOCALE;
}

/**
 * 获取翻译文本
 */
export function t(locale: Locale, key: string): string {
  return localeMap[locale]?.[key] || localeMap[DEFAULT_LOCALE]?.[key] || key;
}

/**
 * 获取翻译对象（用于批量获取）
 */
export function getTranslations(locale: Locale): Record<string, string> {
  return localeMap[locale] || localeMap[DEFAULT_LOCALE];
}

/**
 * 生成带语言前缀的URL
 * localeToUrl('en', '/v/123') → '/en/v/123'
 * localeToUrl('zh', '/v/123') → '/v/123' (默认语言无前缀)
 */
export function localeToUrl(locale: Locale, path: string): string {
  if (locale === DEFAULT_LOCALE) return path;
  return `/${locale}${path}`;
}

/**
 * 生成所有语言的hreflang URL列表
 */
export function getHreflangUrls(path: string): Array<{ locale: Locale; href: string }> {
  return SUPPORTED_LOCALES.map(locale => ({
    locale,
    href: localeToUrl(locale, path)
  }));
}

/**
 * 生成hreflang HTML标签
 */
export function generateHreflangTags(path: string): string {
  const urls = getHreflangUrls(path);
  return urls.map(({ locale, href }) => {
    const hreflang = locale === DEFAULT_LOCALE ? 'zh-CN' : HTML_LANG[locale];
    return `<link rel="alternate" hreflang="${hreflang}" href="https://evideos.pages.dev${href}" />`;
  }).join('\n    ') + '\n    <link rel="alternate" hreflang="x-default" href="https://evideos.pages.dev${path}" />';
}
