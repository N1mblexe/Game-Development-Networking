/**
 * Locale-aware number, unit and date formatting. Every function takes the locale explicitly (never `undefined`, never
 * the browser default), so server-rendered markup and the hydrated client always agree.
 *
 *   num('tr', 1.5)            → "1,5"          num('en', 1234)          → "1,234"
 *   fixed('en', 12.345, 1)    → "12.3"         fixed('tr', 12.345, 1)   → "12,3"   (like toFixed: no grouping)
 *   pct('en', 70)             → "70%"          pct('tr', 70)            → "%70"
 *   ms('tr', 16.7, 1)         → "16,7 ms"      kbps('en', 1500)         → "1,500 kbps"
 *   bytes('tr', 1536)         → "1,5 KB"       date('tr', d)            → "26 Eki 2026"
 *   relative('tr', -2, 'day') → "evvelsi gün"  plural('en', n, { one: 'lesson', other: 'lessons' })
 *
 * Replacing `x.toFixed(d)` with `fixed(locale, x, d)` keeps English output identical (same digits, no grouping).
 * Percent values are in percent units (0–100), because that is what the code already computes.
 * Formatter instances are cached per locale and options; nothing is constructed at import time.
 */
import { LOCALES, type Locale } from '../../i18n/locales';

const cache = new Map<string, Intl.NumberFormat>();
function nf(locale: Locale, opts: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = cache.get(key);
  if (!f) cache.set(key, (f = new Intl.NumberFormat(LOCALES[locale].intl, opts)));
  return f;
}
/** -0 would print as "-0" with Intl; toFixed prints "0". */
const noNegZero = (n: number) => (n === 0 ? 0 : n);

/** General number with grouping, up to `maxDigits` decimals (default 2). */
export function num(locale: Locale, n: number, maxDigits = 2, opts: Intl.NumberFormatOptions = {}): string {
  return nf(locale, { maximumFractionDigits: maxDigits, ...opts }).format(noNegZero(n));
}

/** The locale's decimal separator ("." / ","). */
const decimalSep = (locale: Locale) => nf(locale).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? '.';

/**
 * Exactly `digits` decimals and no grouping: the localized drop-in for `n.toFixed(digits)`. It is built on toFixed
 * (same rounding), so English output stays byte-identical to the code it replaces.
 */
export function fixed(locale: Locale, n: number, digits = 0): string {
  const s = noNegZero(n).toFixed(digits);
  const sep = decimalSep(locale);
  return sep === '.' ? s : s.replace('.', sep);
}

/** A percentage in percent units with `digits` fixed decimals: pct('en', 70) → "70%", pct('tr', 70.5, 1) → "%70,5". */
export function pct(locale: Locale, value: number, digits = 0): string {
  // Sign position and spacing come from Intl, the digits from fixed() (toFixed rounding, like `${n.toFixed(d)}%`).
  const parts = nf(locale, { style: 'percent' }).formatToParts(0.5);
  return parts.map((p) => (p.type === 'integer' ? fixed(locale, value, digits) : p.value)).join('');
}

/** Milliseconds: "16.7 ms" / "16,7 ms". */
export const ms = (locale: Locale, n: number, digits = 0) => `${fixed(locale, n, digits)} ms`;

/** Kilobits per second, grouped: "1,500 kbps" / "1.500 kbps". */
export const kbps = (locale: Locale, n: number, digits = 0) => `${num(locale, n, digits)} kbps`;

/** Bytes with a binary-ish unit (1 KB = 1024 B): "512 B", "1.5 KB", "2.3 MB". */
export function bytes(locale: Locale, n: number, digits = 1): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let u = 0;
  while (Math.abs(v) >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${num(locale, v, u === 0 ? 0 : digits)} ${units[u]}`;
}

/** A date with an explicit locale. Default style: "Oct 26, 2026" / "26 Eki 2026". */
export function date(locale: Locale, d: Date | number | string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  return new Intl.DateTimeFormat(LOCALES[locale].intl, opts).format(typeof d === 'string' ? new Date(d) : d);
}

/** Relative time: relative('en', -1, 'day') → "yesterday", relative('tr', 3, 'hour') → "3 saat sonra". */
export function relative(locale: Locale, value: number, unit: Intl.RelativeTimeFormatUnit): string {
  return new Intl.RelativeTimeFormat(LOCALES[locale].intl, { numeric: 'auto' }).format(value, unit);
}

const pluralCache = new Map<Locale, Intl.PluralRules>();
/**
 * Pick a plural form with Intl.PluralRules. `other` is required; English also uses `one`; Turkish only needs `other`
 * for counted nouns ("3 ders", "1 ders"). Forms can be strings or functions of n.
 *
 *   plural('en', n, { one: `${n} lesson`, other: `${n} lessons` })
 */
export function plural(locale: Locale, n: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }): string {
  let rules = pluralCache.get(locale);
  if (!rules) pluralCache.set(locale, (rules = new Intl.PluralRules(LOCALES[locale].intl)));
  return forms[rules.select(n)] ?? forms.other;
}
