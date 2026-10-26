/**
 * Locale-aware text helpers. Turkish has a dotted and a dotless i (i/İ and ı/I), so the default `toLowerCase()`
 * turns "İ" into "i̇" (i + combining dot) and "I" into "i", which breaks comparisons. Use these instead.
 *
 *   lower('tr', 'IŞIK')               → "ışık"        lower('en', 'IŞIK') → "işik"
 *   upper('tr', 'istemci')            → "İSTEMCİ"
 *   foldForMatch('İstemci ')          → "istemci"     (also "ISTEMCI", "ıstemci", "istemci̇")
 *   collator('tr').compare('ç', 'd')  → -1            (Ç sorts between C and D)
 *   alphabet('tr')                    → ['A','B','C','Ç','D', …]
 *   letterOf('tr', 'ışık')            → "I"           letterOf('tr', 'istemci') → "İ"
 */
import { LOCALES, type Locale } from '../../i18n/locales';

export const lower = (locale: Locale, s: string) => s.toLocaleLowerCase(LOCALES[locale].intl);
export const upper = (locale: Locale, s: string) => s.toLocaleUpperCase(LOCALES[locale].intl);

/**
 * Fold a string for lenient matching (fill-in answers, glossary filter): trims, collapses whitespace, lower-cases and
 * removes diacritics, treating every i variant (i, ı, İ, I, i + combining dot) as plain "i" and ç ğ ö ş ü as c g o s u.
 * Locale-independent on purpose: a learner may type Turkish words on an English keyboard or vice versa.
 * Pass `{ caseSensitive: true }` to keep case (diacritics and the i variants are still folded).
 */
export function foldForMatch(s: string, opts: { caseSensitive?: boolean } = {}): string {
  let t = s.trim().replace(/\s+/g, ' ').replace(/ı/g, 'i').replace(/İ/g, 'I');
  t = t.normalize('NFKD').replace(/\p{M}/gu, '');
  return opts.caseSensitive ? t : t.toLowerCase();
}

const collators = new Map<Locale, Intl.Collator>();
/** Case- and accent-insensitive collator in the locale's alphabetical order (for sorting glossary terms, lists). */
export function collator(locale: Locale): Intl.Collator {
  let c = collators.get(locale);
  if (!c) collators.set(locale, (c = new Intl.Collator(LOCALES[locale].intl, { sensitivity: 'base' })));
  return c;
}

const ALPHABETS: Record<Locale, string[]> = {
  en: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
  // The 29 Turkish letters plus Q, W and X, which only appear in loanwords and English jargon (WebSocket, XOR).
  tr: ['A', 'B', 'C', 'Ç', 'D', 'E', 'F', 'G', 'Ğ', 'H', 'I', 'İ', 'J', 'K', 'L', 'M', 'N', 'O', 'Ö', 'P', 'Q', 'R', 'S', 'Ş', 'T', 'U', 'Ü', 'V', 'W', 'X', 'Y', 'Z'],
};
/** Letters for an A–Z jump bar, in the locale's order. */
export const alphabet = (locale: Locale): string[] => ALPHABETS[locale];

/** The jump-bar letter a term sorts under, or "#" for terms starting with a digit or symbol. */
export function letterOf(locale: Locale, term: string): string {
  const first = term.trim()[0];
  if (!first) return '#';
  const c = upper(locale, first);
  return ALPHABETS[locale].includes(c) ? c : '#';
}
