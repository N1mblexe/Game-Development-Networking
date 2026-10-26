import { useEffect, useState, type ComponentType } from 'react';
import InteractiveFrame from '../InteractiveFrame';
import { loadLazy, type LazyNamespace } from '../../i18n/load';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locales';
import { LazyMessagesProvider, LocaleProvider, useLocale, useT } from '../../i18n/react';
import type { Dict } from '../../i18n/types';
import { diagramText } from '../../lib/i18n/registry';
import { diagrams } from './registry';
import type { DiagramDefinition } from './types';

interface Props {
  name: string;
  variant?: string;
  caption?: string;
  locale?: Locale;
}

/**
 * Island wrapper: resolves a diagram by name and loads it in the browser, together with its lazy text namespace
 * (src/i18n/<locale>/diagrams/<name>.ts, English fallback), which the diagram reads with useLazyT('diagrams/<name>').
 */
export default function DiagramHost({ locale = DEFAULT_LOCALE, ...props }: Props) {
  return (
    <LocaleProvider locale={locale}>
      <Host {...props} />
    </LocaleProvider>
  );
}

type Loaded = { Comp: ComponentType<{ variant?: string }>; messages: Dict };

function Host({ name, variant, caption }: Omit<Props, 'locale'>) {
  const locale = useLocale();
  const m = useT('ui').frame;
  const def = (diagrams as Record<string, DiagramDefinition>)[name];
  const ns: LazyNamespace = `diagrams/${name}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!def) return;
    Promise.all([def.load(), loadLazy(ns, locale)]).then(
      ([mod, messages]) => setLoaded({ Comp: mod.default, messages }),
      (e: unknown) => setError(String(e)),
    );
  }, [def, ns, locale]);

  if (!def) {
    return (
      <InteractiveFrame kind="Diagram" title={m.unknownDiagram(name)}>
        <p className="text-danger">{m.unknownDiagramHint}</p>
      </InteractiveFrame>
    );
  }
  const text = diagramText(name, locale);

  // Diagram text stays out of the search index (data-pagefind-ignore); lesson prose describes it.
  return (
    <div data-pagefind-ignore="">
    <InteractiveFrame kind="Diagram" title={text.title} subtitle={text.variant(variant)} caption={caption ?? text.description}>
      {error ? (
        <p className="text-danger">{m.failed(error)}</p>
      ) : loaded ? (
        <LazyMessagesProvider ns={ns} messages={loaded.messages}>
          <loaded.Comp variant={variant} />
        </LazyMessagesProvider>
      ) : (
        <div className="grid h-40 place-items-center text-sm text-muted" aria-busy="true">
          {m.loading}
        </div>
      )}
    </InteractiveFrame>
    </div>
  );
}
