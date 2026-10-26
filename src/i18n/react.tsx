/**
 * React side of i18n.
 *
 * Every root island (a component mounted with client:*) takes a `locale` prop, and nothing else locale-related:
 * dictionaries are never serialized into island props. It wraps its tree in <LocaleProvider>; children read text
 * with useT(namespace).
 *
 *   export default function QuizRunner({ locale = 'en', ...props }: QuizRunnerProps & { locale?: Locale }) {
 *     return <LocaleProvider locale={locale}><Quiz {...props} /></LocaleProvider>;
 *   }
 *   function Quiz() {
 *     const m = useT('quiz');
 *     const locale = useLocale();             // for format.ts: pct(locale, score)
 *     return <button>{m.next}</button>;
 *   }
 *
 * Sims and diagrams also get their lazy namespace from SimHost/DiagramHost:
 *   import type Msgs from '../../i18n/en/sims/tick-rate';
 *   const m = useLazyT<typeof Msgs>('sims/tick-rate');
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DEFAULT_LOCALE, type Locale } from './locales';
import { t, type CoreMessages, type CoreNamespace, type LazyNamespace } from './load';
import type { Dict } from './types';

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);
const LazyContext = createContext<Readonly<Record<string, Dict>>>({});

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** Provide a loaded lazy namespace to the subtree (used by SimHost and DiagramHost). */
export function LazyMessagesProvider({ ns, messages, children }: { ns: LazyNamespace; messages: Dict; children: ReactNode }) {
  const parent = useContext(LazyContext);
  const value = useMemo(() => ({ ...parent, [ns]: messages }), [parent, ns, messages]);
  return <LazyContext.Provider value={value}>{children}</LazyContext.Provider>;
}

/** The locale of the enclosing <LocaleProvider> (English without one). Pass it to format.ts and text.ts helpers. */
export const useLocale = () => useContext(LocaleContext);

/** A core namespace in the current locale: useT('quiz').next */
export function useT<N extends CoreNamespace>(ns: N): CoreMessages[N] {
  return t(useContext(LocaleContext))[ns];
}

/**
 * A lazy namespace provided by SimHost/DiagramHost. Type it with the English file (a type-only import, so no English
 * text is bundled on other locales' pages): useLazyT<typeof Msgs>('sims/tick-rate').
 */
export function useLazyT<T>(ns: LazyNamespace): T {
  const m = useContext(LazyContext)[ns];
  if (!m) throw new Error(`useLazyT("${ns}"): no messages provided. Render this component through SimHost/DiagramHost.`);
  return m as T;
}
