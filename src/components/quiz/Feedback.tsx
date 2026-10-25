import type { Ref } from 'react';
import type { Question } from '../../lib/content/schemas';
import { describeAnswer, type GradeResult } from '../../lib/quiz/grade';
import { renderInline } from '../../lib/quiz/inline';

interface Props {
  question: Question;
  result: GradeResult;
  /** Focus lands here after "Check" so screen readers read the verdict and explanation. */
  focusRef?: Ref<HTMLDivElement>;
  /** Say "Unanswered" instead of "Not quite" (exam results). */
  unanswered?: boolean;
}

const partialText = (q: Question, r: GradeResult) => {
  if (r.correct || !r.partial) return null;
  if (q.type === 'order') return `${Math.round(r.partial * q.items.length)} of ${q.items.length} in the right place.`;
  return 'Partly right.';
};

export default function Feedback({ question, result, focusRef, unanswered }: Props) {
  const ok = result.correct;
  const extra = partialText(question, result);
  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      className={`mt-4 rounded-lg border-l-4 px-4 py-3 focus:outline-none focus-visible:outline-2 ${ok ? 'border-ok bg-ok-soft' : 'border-danger bg-danger-soft'}`}
      data-feedback={ok ? 'correct' : 'wrong'}
    >
      <p className={`flex items-center gap-2 font-bold ${ok ? 'text-ok' : 'text-danger'}`}>
        <span aria-hidden="true">{ok ? '✓' : '✗'}</span>
        {ok ? 'Correct' : unanswered ? 'Not answered' : 'Not quite'}
        {extra && <span className="font-medium text-text/80">· {extra}</span>}
      </p>
      {!ok && (
        <p className="mt-1.5 text-sm">
          <span className="font-semibold">Answer: </span>
          {renderInline(describeAnswer(question))}
        </p>
      )}
      <p className="mt-1.5 text-[0.95rem] leading-relaxed">{renderInline(question.explanation)}</p>
    </div>
  );
}
