/**
 * Helpers for diagrams whose text lives in a lazy namespace (src/i18n/<locale>/diagrams/<name>.ts).
 * The component keeps the structure with stable ids; the dictionary holds the text keyed by those ids.
 *
 *   const STEPS: StepShape[] = [{ id: 'call', from: 'a', to: 'a', kind: 'local', code: 'FireRpc(aim)' }, ...];
 *   const m = useLazyT<typeof Msgs>('diagrams/ngo-rpc-flow');
 *   <SequenceCore steps={withStepText(STEPS, m.steps['to-server'])} actors={withActorText(ACTORS, m.actors)} />
 */
import type { SequenceActor, SequenceStep } from '../../components/diagrams/types';

/** A sequence step without its text, plus the id its text is stored under. */
export type StepShape = Omit<SequenceStep, 'label' | 'note'> & { id: string };
export interface StepText {
  label: string;
  note?: string;
}
/** An actor whose `label` is a key into the dictionary's actor names. */
export type ActorShape<K extends string = string> = Omit<SequenceActor, 'label'> & { label: K };

/** Attach label/note to each step by id. A missing id shows the id itself, so a gap is visible, never a crash. */
export function withStepText(steps: readonly StepShape[], text: Readonly<Record<string, StepText>>): SequenceStep[] {
  return steps.map(({ id, ...s }) => ({ ...s, label: text[id]?.label ?? id, ...(text[id]?.note ? { note: text[id].note } : {}) }));
}

/** Resolve actor label keys to names. */
export function withActorText<K extends string>(actors: readonly ActorShape<K>[], names: Readonly<Record<K, string>>): SequenceActor[] {
  return actors.map((a) => ({ ...a, label: names[a.label] ?? a.label }));
}
