import type { SimBaseProps } from './types';

/** Placeholder until the real simulator is implemented (Phase 1, agent B). */
export default function StubSim(props: SimBaseProps & Record<string, unknown>) {
  return (
    <div className="grid h-48 place-items-center text-sm text-muted">
      <p>
        Simulator coming soon <span className="font-mono">{JSON.stringify(props)}</span>
      </p>
    </div>
  );
}
