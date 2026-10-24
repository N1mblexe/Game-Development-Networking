import InteractiveFrame from '../InteractiveFrame';
import type { SequenceProps } from './types';

/**
 * Inline sequence diagram used by <Sequence /> in MDX.
 * Phase 0 renders a static, accessible step list; agent C replaces the body with the animated
 * SVG version while keeping these props.
 */
export default function SequenceFlow({ title, actors, steps }: SequenceProps) {
  const label = (id: string) => actors.find((a) => a.id === id)?.label ?? id;
  return (
    <InteractiveFrame kind="Diagram" title={title ?? 'Sequence'}>
      <ol className="space-y-1.5 text-sm">
        {steps.map((s, i) => (
          <li key={i} className="flex flex-wrap gap-x-2">
            <span className="font-mono text-muted">{i + 1}.</span>
            <span className="font-semibold">{label(s.from)}</span>
            <span className="text-muted">→</span>
            <span className="font-semibold">{label(s.to)}</span>
            <span>{s.label}</span>
            {s.note && <span className="text-muted">({s.note})</span>}
          </li>
        ))}
      </ol>
    </InteractiveFrame>
  );
}
