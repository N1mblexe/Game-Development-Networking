import { useEffect, useMemo, useRef, useState } from 'react';
import type { Question } from '../../lib/content/schemas';
import { grade, initialResponse, isAnswered, optionOrder, scorePct, type GradeResult, type QuizResponse } from '../../lib/quiz/grade';
import { hashString, randomSeed } from '../../lib/quiz/random';
import { renderInline } from '../../lib/quiz/inline';
import { recordQuiz } from '../../lib/progress/store';
import { useProgress } from '../../lib/progress/react';
import Feedback from './Feedback';
import QuestionView, { TYPE_LABEL } from './QuestionView';
import ScoreRing from './ScoreRing';

export interface QuizRunnerProps {
  /** Lesson key; results are stored with recordQuiz(lessonKey, pct, passPct). */
  lessonKey: string;
  questions: Question[];
  passPct: number;
}

type Phase = 'question' | 'results' | 'review';

const initResponses = (questions: Question[], seed: number) =>
  Object.fromEntries(questions.map((q) => [q.id, initialResponse(q, seed)])) as Record<string, QuizResponse>;

/**
 * Lesson quiz: one question at a time with immediate feedback, then a score that is saved
 * to progress (passing completes the lesson). The first attempt's shuffle is seeded from the
 * lesson key so server and client render the same markup; retries reshuffle randomly.
 */
export default function QuizRunner({ lessonKey, questions, passPct }: QuizRunnerProps) {
  const progress = useProgress();
  const [seed, setSeed] = useState(() => hashString(lessonKey));
  const orders = useMemo(() => Object.fromEntries(questions.map((q) => [q.id, optionOrder(q, seed)])), [questions, seed]);
  const [responses, setResponses] = useState(() => initResponses(questions, seed));
  const [results, setResults] = useState<Record<string, GradeResult>>({});
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('question');
  const [nudge, setNudge] = useState(false);
  const [prevBest, setPrevBest] = useState<number | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  const questionRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef<'question' | 'feedback' | 'heading' | null>(null);

  const q = questions[index];
  const result = q ? results[q.id] : undefined;
  const correctCount = questions.filter((x) => results[x.id]?.correct).length;
  const pct = scorePct(correctCount, questions.length);
  const passed = pct >= passPct;
  const mistakes = questions.filter((x) => results[x.id] && !results[x.id].correct);
  const best = progress?.lessons[lessonKey]?.quizBest;

  useEffect(() => {
    const target = moveFocus.current;
    moveFocus.current = null;
    if (target === 'question') questionRef.current?.focus();
    if (target === 'feedback') feedbackRef.current?.focus();
    if (target === 'heading') headingRef.current?.focus();
  });

  if (!q) return <p className="text-muted">This quiz has no questions yet.</p>;

  const check = () => {
    if (result) return next();
    if (!isAnswered(q, responses[q.id])) {
      setNudge(true);
      return;
    }
    setNudge(false);
    setResults((r) => ({ ...r, [q.id]: grade(q, responses[q.id]) }));
    moveFocus.current = 'feedback';
  };

  const next = () => {
    if (index < questions.length - 1) {
      setIndex(index + 1);
      setNudge(false);
      moveFocus.current = 'question';
      return;
    }
    const finalCorrect = questions.filter((x) => (x.id === q.id ? result : results[x.id])?.correct).length;
    const finalPct = scorePct(finalCorrect, questions.length);
    setPrevBest(best);
    recordQuiz(lessonKey, finalPct, passPct);
    setPhase('results');
    moveFocus.current = 'heading';
  };

  const retry = () => {
    const s = randomSeed();
    setSeed(s);
    setResponses(initResponses(questions, s));
    setResults({});
    setIndex(0);
    setPhase('question');
    setAttempt((a) => a + 1);
    moveFocus.current = 'question';
  };

  const showReview = () => {
    setPhase('review');
    moveFocus.current = 'heading';
  };

  const header = (
    <div className="border-b border-border bg-surface-2/60 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold">
          {phase === 'question' ? (
            <>
              Question {index + 1} <span className="font-normal text-muted">of {questions.length}</span>
            </>
          ) : phase === 'results' ? (
            'Results'
          ) : (
            'Review mistakes'
          )}
        </span>
        <span className="text-muted">
          Pass at {passPct}%{progress && best !== undefined && <> · best {best}%</>}
        </span>
      </div>
      <ol className="mt-2.5 flex gap-1" aria-label="Quiz progress">
        {questions.map((x, i) => {
          const r = results[x.id];
          const tone = r ? (r.correct ? 'bg-ok' : 'bg-danger') : i === index && phase === 'question' ? 'bg-accent' : 'bg-border';
          const state = r ? (r.correct ? 'correct' : 'incorrect') : i === index && phase === 'question' ? 'current' : 'not answered';
          return (
            <li key={x.id} className={`h-1.5 flex-1 rounded-full transition-colors ${tone}`}>
              <span className="sr-only">
                Question {i + 1}: {state}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );

  return (
    <div className="not-prose card overflow-hidden" data-quiz={lessonKey} data-ready={progress ? 'true' : undefined} data-phase={phase}>
      {header}

      {phase === 'question' && (
        <div className="p-4 sm:p-5" key={`${attempt}-${q.id}`}>
          <QuestionView
            question={q}
            value={responses[q.id]}
            onChange={(v) => {
              setResponses((r) => ({ ...r, [q.id]: v }));
              setNudge(false);
            }}
            locked={Boolean(result)}
            reveal={Boolean(result)}
            order={orders[q.id]}
            idPrefix={`quiz-${hashString(lessonKey).toString(36)}`}
            eyebrow={<><span className="sr-only">Question {index + 1} of {questions.length}. </span>{TYPE_LABEL[q.type]}</>}
            onSubmit={check}
            focusRef={questionRef}
          />
          {result && <Feedback question={q} result={result} focusRef={feedbackRef} />}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {!result ? (
              <button type="button" className="btn btn-primary" onClick={check} aria-describedby={nudge ? `nudge-${q.id}` : undefined}>
                Check
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={next}>
                {index < questions.length - 1 ? 'Next question' : 'See results'} <span aria-hidden="true">→</span>
              </button>
            )}
            <p id={`nudge-${q.id}`} className="text-sm text-warn" role="status">
              {nudge ? 'Answer the question first.' : ''}
            </p>
          </div>
        </div>
      )}

      {phase === 'results' && (
        <div className="p-4 sm:p-6">
          <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
            <ScoreRing pct={pct} passPct={passPct} />
            <div className="min-w-0">
              <h3 ref={headingRef} tabIndex={-1} className={`text-2xl font-extrabold focus:outline-none ${passed ? 'text-ok' : 'text-danger'}`}>
                {passed ? 'Passed' : 'Not passed yet'}
              </h3>
              <p className="mt-1">
                {correctCount} of {questions.length} correct.{' '}
                {passed ? 'This lesson is marked complete.' : `You need ${passPct}% to complete the lesson.`}
              </p>
              <p className="mt-1 text-sm text-muted">
                {prevBest === undefined ? 'First attempt.' : pct > prevBest ? `New best! Previous best: ${prevBest}%.` : `Your best: ${Math.max(prevBest, pct)}%.`}
              </p>
            </div>
          </div>
          <ul className="mt-6 grid gap-1.5 text-sm">
            {questions.map((x, i) => {
              const ok = results[x.id]?.correct;
              return (
                <li key={x.id} className="flex gap-2.5 rounded-md bg-surface-2/60 px-3 py-2">
                  <span className={`font-bold ${ok ? 'text-ok' : 'text-danger'}`} aria-label={ok ? 'Correct' : 'Incorrect'} role="img">
                    {ok ? '✓' : '✗'}
                  </span>
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <span className="text-muted">{i + 1}.</span> {renderInline(x.prompt)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={retry}>
              Retry quiz
            </button>
            {mistakes.length > 0 && (
              <button type="button" className="btn" onClick={showReview}>
                Review mistakes ({mistakes.length})
              </button>
            )}
          </div>
        </div>
      )}

      {phase === 'review' && (
        <div className="p-4 sm:p-5">
          <h3 ref={headingRef} tabIndex={-1} className="mb-1 text-lg font-bold focus:outline-none">
            {mistakes.length} question{mistakes.length === 1 ? '' : 's'} to look at again
          </h3>
          <p className="mb-5 text-sm text-muted">Your answer is marked; the correct answer and explanation follow each question.</p>
          <div className="grid gap-6">
            {mistakes.map((x) => (
              <section key={x.id} className="border-t border-border pt-5 first:border-t-0 first:pt-0">
                <QuestionView
                  question={x}
                  value={responses[x.id]}
                  locked
                  reveal
                  order={orders[x.id]}
                  idPrefix={`review-${hashString(lessonKey).toString(36)}`}
                  eyebrow={`Question ${questions.indexOf(x) + 1} · ${TYPE_LABEL[x.type]}`}
                />
                <Feedback question={x} result={results[x.id]} />
              </section>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={retry}>
              Retry quiz
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPhase('results');
                moveFocus.current = 'heading';
              }}
            >
              Back to results
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
