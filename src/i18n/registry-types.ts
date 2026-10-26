/**
 * Types for the registry-sims / registry-diagrams namespaces: translated titles, descriptions, preset labels and
 * variant labels of the sim and diagram registries.
 *
 * English is NOT duplicated: it stays in src/components/sim/registry.ts and diagrams/registry.ts (the content
 * contract), so en/registry-*.ts are empty and another locale's file lists only what it translates. Keys are checked
 * against the registries by the type below (an unknown sim, preset or field fails `pnpm check`) and by
 * scripts/validate-content.ts; missing translations fall back to English and show up in `pnpm i18n:status`.
 * Resolve the text with simText()/diagramText() from src/lib/i18n/registry.ts.
 */
import type { sims } from '../components/sim/registry';
import type { diagrams } from '../components/diagrams/registry';

type Sims = typeof sims;
type Diagrams = typeof diagrams;

export interface PresetText {
  label?: string;
  description?: string;
}

export type RegistrySimsMessages = {
  [K in keyof Sims]?: {
    title?: string;
    description?: string;
    presets?: { [P in keyof Sims[K]['presets']]?: PresetText };
  };
};

export type RegistryDiagramsMessages = {
  [K in keyof Diagrams]?: {
    title?: string;
    description?: string;
    /** Label shown for a variant id (the frame subtitle). */
    variants?: Diagrams[K] extends { variants: readonly string[] } ? Partial<Record<string, string>> : never;
  };
};
