/**
 * Translated registry text: the registries hold English (and the name/preset contract), the registry-sims and
 * registry-diagrams namespaces hold the other languages. Anything not translated falls back to English.
 *
 *   const s = simText('tick-rate', locale);   s.title, s.description, s.preset('low-tick').label
 *   const d = diagramText('topology', locale); d.title, d.description, d.variant('relay')
 */
import { sims } from '../../components/sim/registry';
import { diagrams } from '../../components/diagrams/registry';
import type { DiagramDefinition } from '../../components/diagrams/types';
import type { SimDefinition } from '../../components/sim/types';
import { t } from '../../i18n/load';
import type { Locale } from '../../i18n/locales';
import type { PresetText } from '../../i18n/registry-types';

export function simText(name: string, locale: Locale) {
  const def = (sims as Record<string, SimDefinition>)[name];
  const o = (t(locale)['registry-sims'] as Record<string, { title?: string; description?: string; presets?: Record<string, PresetText> }>)[name];
  return {
    title: o?.title ?? def?.title ?? name,
    description: o?.description ?? def?.description ?? '',
    preset: (preset: string) => {
      const p = def?.presets[preset];
      const op = o?.presets?.[preset];
      return { label: op?.label ?? p?.label, description: op?.description ?? p?.description };
    },
  };
}

export function diagramText(name: string, locale: Locale) {
  const def = (diagrams as Record<string, DiagramDefinition>)[name];
  const o = (t(locale)['registry-diagrams'] as Record<string, { title?: string; description?: string; variants?: Record<string, string> }>)[name];
  return {
    title: o?.title ?? def?.title ?? name,
    description: o?.description ?? def?.description ?? '',
    /** The variant label, or the variant id itself (what the frame showed before translation). */
    variant: (variant: string | undefined) => (variant ? (o?.variants?.[variant] ?? variant) : undefined),
  };
}
