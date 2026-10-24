import { useEffect, useState, type ComponentType } from 'react';
import InteractiveFrame from '../InteractiveFrame';
import { sims } from './registry';
import type { SimBaseProps, SimDefinition } from './types';

interface Props extends SimBaseProps {
  name: string;
  preset?: string;
  caption?: string;
}

/**
 * Island wrapper: resolves a sim by name and loads it in the browser only.
 * Sims are canvas/animation heavy, so the server renders the frame and a placeholder.
 */
export default function SimHost({ name, preset, caption, ...rest }: Props) {
  const def = (sims as Record<string, SimDefinition>)[name];
  const [Comp, setComp] = useState<ComponentType<SimBaseProps & Record<string, unknown>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!def) return;
    def.load().then(
      (m) => setComp(() => m.default),
      (e: unknown) => setError(String(e)),
    );
  }, [def]);

  if (!def) {
    return (
      <InteractiveFrame kind="Simulator" title={`Unknown simulator "${name}"`}>
        <p className="text-danger">Not found in sim/registry.ts.</p>
      </InteractiveFrame>
    );
  }
  const presetName = preset && preset in def.presets ? preset : def.defaultPreset;
  const p = def.presets[presetName];

  return (
    <InteractiveFrame kind="Simulator" title={def.title} subtitle={p?.label} caption={caption ?? p?.description}>
      {error ? (
        <p className="text-danger">Failed to load: {error}</p>
      ) : Comp ? (
        <Comp {...p?.props} {...rest} />
      ) : (
        <div className="grid h-48 place-items-center text-sm text-muted" aria-busy="true">
          {def.description}
        </div>
      )}
    </InteractiveFrame>
  );
}
