/**
 * Entry point for Astro components and vanilla scripts. React components use ./react.tsx instead.
 *
 *   ---
 *   import { t } from '../../i18n';
 *   import { getLocale } from '../../lib/i18n/route';
 *   const locale = getLocale(Astro);
 *   const m = t(locale).ui;
 *   ---
 *   <p>{m.callout.note}</p>
 */
export { t, pageLocale, loadLazy, hasLazy, type CoreMessages, type CoreNamespace, type LazyNamespace } from './load';
export { LOCALES, LOCALE_CODES, DEFAULT_LOCALE, TRANSLATED_LOCALES, LOCALE_STORAGE_KEY, isLocale, type Locale } from './locales';
export type { Dict, Messages } from './types';
