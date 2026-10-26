/**
 * The site's languages. Everything locale-dependent (routes, <html lang>, dictionaries, content collections,
 * number/date formatting, the switcher, the validator and the status report) loops over this table, so adding a
 * language means adding an entry here plus its files:
 *   src/i18n/<code>/*.ts            (dictionaries, typed against English)
 *   src/content/<code>/**           (translated lessons and overlays, optional: English is the fallback)
 *   a `<name>Xx` collection set in src/content.config.ts (see `localizedCollections` there)
 *
 * Keep this file free of `astro:*` imports: Node scripts and Vitest load it too.
 */
export const LOCALES = {
  en: {
    code: 'en',
    /** <html lang>; also what Pagefind uses to build a separate index per language. */
    htmlLang: 'en',
    /** BCP 47 tag passed to every Intl formatter (never `undefined`, so SSR and hydration agree). */
    intl: 'en-US',
    /** Shown in the language switcher, in the language itself. */
    label: 'English',
    /** URL prefix without slashes; '' for the default language, which lives at the site root. */
    prefix: '',
    /** Pagefind UI translation key. */
    pagefindLang: 'en',
    /**
     * Whether CSS `text-transform: uppercase` is safe. In Turkish it turns jargon into "TİCK" / "NETWORKVARİABLE",
     * so BaseLayout switches the `uppercase` utility off for such locales (labels keep their normal case).
     */
    uppercase: true,
  },
  tr: {
    code: 'tr',
    htmlLang: 'tr',
    intl: 'tr-TR',
    label: 'Türkçe',
    prefix: 'tr',
    pagefindLang: 'tr',
    uppercase: false,
  },
} as const;

export type Locale = keyof typeof LOCALES;
export type LocaleConfig = (typeof LOCALES)[Locale];

export const DEFAULT_LOCALE: Locale = 'en';
/** All locales, default first. */
export const LOCALE_CODES = Object.keys(LOCALES) as Locale[];
/** Locales that have translated content (everything except the default). */
export const TRANSLATED_LOCALES = LOCALE_CODES.filter((l) => l !== DEFAULT_LOCALE);

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && v in LOCALES;

/** localStorage key holding the visitor's explicit language choice (set by the switcher and the banner). */
export const LOCALE_STORAGE_KEY = 'netlearn-locale';
