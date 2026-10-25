import InteractiveFrame from '../InteractiveFrame';
import SequenceCore from './primitives/SequenceCore';
import type { SequenceProps } from './types';

/**
 * Inline sequence diagram used by <Sequence /> in MDX: actor columns, lifelines, one arrow per step,
 * play/pause/step controls, and an ordered list as the screen-reader alternative.
 */
export default function SequenceFlow({ title, actors, steps }: SequenceProps) {
  return (
    <InteractiveFrame kind="Diagram" title={title ?? 'Sequence'}>
      <SequenceCore actors={actors} steps={steps} title={title} />
    </InteractiveFrame>
  );
}
