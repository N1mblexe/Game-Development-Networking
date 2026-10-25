import type { ComponentType } from 'react';

export interface DiagramDefinition {
  title: string;
  description: string;
  lessons: string[];
  /** Optional named variants, selected with <Diagram name="..." variant="..." />. */
  variants?: string[];
  load: () => Promise<{ default: ComponentType<{ variant?: string }> }>;
}

// ------------------------------------------------------------- inline sequence diagrams
// Lessons can draw one-off animated sequence diagrams without registering anything:
//   <Sequence title="..." actors={[...]} steps={[...]} />

export interface SequenceActor {
  id: string;
  label: string;
  kind?: 'client' | 'server' | 'host' | 'steam' | 'relay' | 'service';
}

export interface SequenceStep {
  from: string;
  to: string;
  label: string;
  /** Extra detail shown when the step is active. */
  note?: string;
  /** Changes line style: reliable = solid, unreliable = dashed, local = self-call. */
  kind?: 'reliable' | 'unreliable' | 'rpc' | 'event' | 'local';
  /** Optional API call or code shown in monospace under the label. */
  code?: string;
  /** Optional emphasis: `warn`/`danger` mark a failure point, `ok` a success, `muted` a non-event. */
  tone?: 'ok' | 'warn' | 'danger' | 'muted';
}

export interface SequenceProps {
  title?: string;
  actors: SequenceActor[];
  steps: SequenceStep[];
}
