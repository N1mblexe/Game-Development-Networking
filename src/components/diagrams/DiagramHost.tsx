import { useEffect, useState, type ComponentType } from 'react';
import InteractiveFrame from '../InteractiveFrame';
import { diagrams } from './registry';
import type { DiagramDefinition } from './types';

interface Props {
  name: string;
  variant?: string;
  caption?: string;
}

/** Island wrapper: resolves a diagram by name and loads it in the browser. */
export default function DiagramHost({ name, variant, caption }: Props) {
  const def = (diagrams as Record<string, DiagramDefinition>)[name];
  const [Comp, setComp] = useState<ComponentType<{ variant?: string }> | null>(null);
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
      <InteractiveFrame kind="Diagram" title={`Unknown diagram "${name}"`}>
        <p className="text-danger">Not found in diagrams/registry.ts.</p>
      </InteractiveFrame>
    );
  }

  // Diagram text stays out of the search index (data-pagefind-ignore); lesson prose describes it.
  return (
    <div data-pagefind-ignore="">
    <InteractiveFrame kind="Diagram" title={def.title} subtitle={variant} caption={caption ?? def.description}>
      {error ? (
        <p className="text-danger">Failed to load: {error}</p>
      ) : Comp ? (
        <Comp variant={variant} />
      ) : (
        <div className="grid h-40 place-items-center text-sm text-muted" aria-busy="true">
          Loading…
        </div>
      )}
    </InteractiveFrame>
    </div>
  );
}
