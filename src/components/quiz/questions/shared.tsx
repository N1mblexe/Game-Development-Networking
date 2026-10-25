import type { Question, QuestionType } from '../../../lib/content/schemas';
import type { QuizResponse } from '../../../lib/quiz/grade';

export interface QuestionInputProps<T extends QuestionType = QuestionType> {
  question: Extract<Question, { type: T }>;
  value: QuizResponse;
  onChange: (value: QuizResponse) => void;
  /** Inputs are read-only (after Check, or in results). */
  locked: boolean;
  /** Mark what was right and wrong. */
  reveal: boolean;
  /** Unique per rendered question; used for input names and ids. */
  name: string;
  /** Display order of options (single/multi), as indices into `options`. */
  order: number[];
  /** Id of the element that labels the question (the legend). */
  labelledBy: string;
  /** Enter in a text field submits (Check / Next). */
  onSubmit?: () => void;
}

/** Shared option-row styling so every type looks like one system. */
export function optionClass(state: 'idle' | 'selected' | 'correct' | 'wrong' | 'missed', locked: boolean) {
  const base =
    'flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors [overflow-wrap:anywhere]';
  const interactive = locked ? '' : ' cursor-pointer hover:border-accent focus-within:border-accent';
  const tone = {
    idle: ' border-border bg-surface',
    selected: ' border-accent bg-accent-soft',
    correct: ' border-ok bg-ok-soft',
    wrong: ' border-danger bg-danger-soft',
    missed: ' border-ok border-dashed bg-surface',
  }[state];
  return base + interactive + tone;
}

export function Mark({ kind }: { kind: 'correct' | 'wrong' | 'missed' }) {
  const label = { correct: 'Correct', wrong: 'Incorrect', missed: 'Correct answer, not selected' }[kind];
  return (
    <span
      className={`ml-auto shrink-0 pl-2 text-sm font-bold ${kind === 'wrong' ? 'text-danger' : 'text-ok'}`}
      role="img"
      aria-label={label}
    >
      {kind === 'wrong' ? '✗' : '✓'}
    </span>
  );
}
