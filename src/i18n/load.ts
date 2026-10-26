/**
 * Dictionary loading.
 *
 * Core namespaces (src/i18n/<locale>/core.ts: ui, pages, quiz, srs, progress, glossary, sim, diagram, registry-*)
 * are needed synchronously for server rendering and hydration. On the server every locale is loaded; in the browser
 * only the page's own locale (from <html lang>) is downloaded, as one chunk, before any island or script that imports
 * this module runs (top-level await). So `t(locale)` is synchronous everywhere, and English pages never download
 * Turkish strings.
 *
 * Lazy namespaces (src/i18n/<locale>/sims/<name>.ts, diagrams/<name>.ts[x]) hold the long per-sim and per-diagram
 * text. SimHost and DiagramHost load them together with the component (loadLazy); a locale without the file falls
 * back to English.
 *
 *   Astro:          const m = t(locale);  m.ui.callout.note
 *   React island:   const m = useT('ui');  (src/i18n/react.tsx; the root island is wrapped in <LocaleProvider>)
 *   Vanilla script: import { t, pageLocale } from '../i18n';  const m = t(pageLocale()).progress;
 */
import { DEFAULT_LOCALE, LOCALE_CODES, LOCALES, type Locale } from './locales';
import type enCore from './en/core';
import type { RegistryDiagramsMessages, RegistrySimsMessages } from './registry-types';
import type { Dict } from './types';

export type CoreMessages = Omit<typeof enCore, 'registry-sims' | 'registry-diagrams'> & {
  'registry-sims': RegistrySimsMessages;
  'registry-diagrams': RegistryDiagramsMessages;
};
export type CoreNamespace = keyof CoreMessages;
export type LazyNamespace = `sims/${string}` | `diagrams/${string}`;

/** The locale of the current document, from <html lang> (browser only; the default locale elsewhere). */
export function pageLocale(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE;
  const lang = document.documentElement.lang;
  return LOCALE_CODES.find((l) => LOCALES[l].htmlLang === lang) ?? DEFAULT_LOCALE;
}

const coreLoaders = import.meta.glob<CoreMessages>('./*/core.ts', { import: 'default' });
const core: Partial<Record<Locale, CoreMessages>> = {};
const browser = !import.meta.env.SSR && typeof document !== 'undefined';
await Promise.all(
  (browser ? [pageLocale()] : LOCALE_CODES).map(async (l) => {
    const load = coreLoaders[`./${l}/core.ts`];
    if (load) core[l] = await load();
  }),
);

let warned = false;
/** All core namespaces of a locale. Synchronous (see above). */
export function t(locale: Locale): CoreMessages {
  const m = core[locale];
  if (m) return m;
  // Only happens in the browser when an island's `locale` prop disagrees with <html lang>.
  if (!warned) {
    warned = true;
    console.warn(`[i18n] dictionaries for "${locale}" are not loaded on this page; using "${pageLocale()}"`);
  }
  return core[pageLocale()] ?? Object.values(core)[0]!;
}

const lazyLoaders = import.meta.glob<Dict>(['./*/sims/*.ts', './*/diagrams/*.ts', './*/diagrams/*.tsx'], { import: 'default' });
const lazyFile = (locale: Locale, ns: LazyNamespace) => lazyLoaders[`./${locale}/${ns}.ts`] ?? lazyLoaders[`./${locale}/${ns}.tsx`];

/** True when `locale` has its own file for a lazy namespace (false means English is used). */
export const hasLazy = (ns: LazyNamespace, locale: Locale) => Boolean(lazyFile(locale, ns));

/**
 * Load a lazy namespace ("sims/tick-rate", "diagrams/ngo-rpc-flow") in a locale, falling back to English, then to {}.
 * Only the chosen file is downloaded.
 */
export async function loadLazy(ns: LazyNamespace, locale: Locale): Promise<Dict> {
  const load = lazyFile(locale, ns) ?? lazyFile(DEFAULT_LOCALE, ns);
  return load ? load() : {};
}
