import { useEffect, useState, type ComponentType } from 'react';
import InteractiveFrame from '../InteractiveFrame';
import { loadLazy, type LazyNamespace } from '../../i18n/load';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locales';
import { LazyMessagesProvider, LocaleProvider, useLocale, useT } from '../../i18n/react';
import type { Dict } from '../../i18n/types';
import { simText } from '../../lib/i18n/registry';
import { sims } from './registry';
import type { SimBaseProps, SimDefinition } from './types';

interface Props extends SimBaseProps {
  name: string;
  preset?: string;
  caption?: string;
  locale?: Locale;
}

/**
 * Island wrapper: resolves a sim by name and loads it in the browser only.
 * Sims are canvas/animation heavy, so the server renders the frame and a placeholder.
 * The sim's lazy text namespace (src/i18n/<locale>/sims/<name>.ts, English fallback) loads together with the
 * component and is provided to it, so the sim reads it with useLazyT('sims/<name>').
 */
export default function SimHost({ locale = DEFAULT_LOCALE, ...props }: Props) {
  return (
    <LocaleProvider locale={locale}>
      <Host {...props} />
    </LocaleProvider>
  );
}

type Loaded = { Comp: ComponentType<SimBaseProps & Record<string, unknown>>; messages: Dict };

function Host({ name, preset, caption, ...rest }: Omit<Props, 'locale'>) {
  const locale = useLocale();
  const m = useT('ui').frame;
  const def = (sims as Record<string, SimDefinition>)[name];
  const ns: LazyNamespace = `sims/${name}`;
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
      <InteractiveFrame kind="Simulator" title={m.unknownSim(name)}>
        <p className="text-danger">{m.unknownSimHint}</p>
      </InteractiveFrame>
    );
  }
  const presetName = preset && preset in def.presets ? preset : def.defaultPreset;
  const p = def.presets[presetName];
  const text = simText(name, locale);
  const pt = text.preset(presetName);

  return (
    <InteractiveFrame kind="Simulator" title={text.title} subtitle={pt.label} caption={caption ?? pt.description}>
      {error ? (
        <p className="text-danger">{m.failed(error)}</p>
      ) : loaded ? (
        <LazyMessagesProvider ns={ns} messages={loaded.messages}>
          <loaded.Comp {...p?.props} {...rest} />
        </LazyMessagesProvider>
      ) : (
        <div className="grid h-48 place-items-center text-sm text-muted" aria-busy="true">
          {text.description}
        </div>
      )}
    </InteractiveFrame>
  );
}
