import type { ComponentType } from 'react';

/** Props every simulator receives from SimHost, merged with the chosen preset's props. */
export interface SimBaseProps {
  /** Seed for the deterministic network model, so a preset always plays out the same way. */
  seed?: number;
  /** Smaller layout with fewer controls (used inside lessons when space is tight). */
  compact?: boolean;
}

export interface SimPreset {
  label: string;
  /** What the learner should notice with this preset. */
  description?: string;
  props: Record<string, unknown>;
}

export interface SimDefinition {
  title: string;
  /** One-line description shown in the playground and the frame header. */
  description: string;
  /** Lesson keys this sim is designed for (used to cross-link from the playground). */
  lessons: string[];
  load: () => Promise<{ default: ComponentType<SimBaseProps & Record<string, unknown>> }>;
  /** Preset names are part of the content contract: lessons reference them by name. */
  presets: Record<string, SimPreset>;
  defaultPreset: string;
}
