import { useCallback, useEffect, useRef, useState } from 'react';
import type { Question } from '../../lib/content/schemas';
import { grade, initialResponse, isAnswered, optionOrder, scorePct, type GradeResult, type QuizResponse } from '../../lib/quiz/grade';
import { drawExam, randomSeed } from '../../lib/quiz/random';
import { renderInline } from '../../lib/quiz/inline';
import { recordExam } from '../../lib/progress/store';
import { useProgress } from '../../lib/progress/react';
import Feedback from './Feedback';
import QuestionView, { TYPE_LABEL } from './QuestionView';
import ScoreRing from './ScoreRing';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locales';
import { LocaleProvider } from '../../i18n/react';

export interface ExamRunnerProps {
  moduleId: string;
  title: string;
  /** Full pool; each attempt draws `drawCount` with a seeded shuffle. */
  questions: Question[];
  drawCount: number;
  passPct: number;
  timeLimitMin?: number;
  /** Shown as a link after a passing attempt. */
  certificateUrl: string;
  /** Fixed draw seed (tests and reproducible attempts). Random per attempt when omitted. */
  seed?: number;
}

declare global {
  interface Window {
    /** Test hook: e2e tests set this (via addInitScript) to make every attempt's draw reproducible. */
    __NETLEARN_EXAM_SEED__?: number;
  }
}

/** Seed for a new attempt: the prop, then the test hook, then a fresh random one. */
const attemptSeed = (fixed?: number) => {
  if (fixed !== undefined) return fixed;
  const hook = typeof window === 'undefined' ? undefined : window.__NETLEARN_EXAM_SEED__;
  return Number.isInteger(hook) ? (hook as number) >>> 0 : randomSeed();
};

type Phase = 'start' | 'running' | 'review' | 'results';

interface Attempt {
  seed: number;
  questions: Question[];
  orders: Record<string, number[]>;
}

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" strokeLinecap="round" />
  </svg>
);

const FlagIcon = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M5 21V4m0 0h11l-2 4 2 4H5" strokeLinejoin="round" />
  </svg>
);

/**
 * Module exam: start screen → seeded draw → one question per screen (back/forward, flags)
 * → review → grade everything at once → results with explanations. Optional time limit
 * auto-submits. Leaving mid-exam asks for confirmation.
 */
function ExamRunnerView({
  moduleId,
  title,
  questions,
  drawCount,
  passPct,
  timeLimitMin,
  certificateUrl,
  seed: fixedSeed,
}: ExamRunnerProps) {
  const progress = useProgress();
  const [phase, setPhase] = useState<Phase>('start');
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [responses, setResponses] = useState<Record<string, QuizResponse>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, GradeResult>>({});
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [timedOut, setTimedOut] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [prevBest, setPrevBest] = useState<number | undefined>();

  const focusRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef<'question' | 'heading' | null>(null);
  const submitted = useRef(false);
  const announced = useRef(new Set<number>());

  const count = Math.min(drawCount, questions.length);
  const examStats = progress?.exams[moduleId];
  const drawn = attempt?.questions ?? [];
  const q = drawn[index];
  const answeredCount = drawn.filter((x) => isAnswered(x, responses[x.id])).length;
  const unanswered = drawn.length - answeredCount;
  const correctCount = drawn.filter((x) => results[x.id]?.correct).length;
  const pct = scorePct(correctCount, drawn.length);
  const passed = pct >= passPct;
  const remaining = deadline === null ? null : deadline - now;

  useEffect(() => {
    const target = moveFocus.current;
    moveFocus.current = null;
    if (target === 'question') focusRef.current?.focus();
    if (target === 'heading') headingRef.current?.focus();
  });

  const start = () => {
    const seed = attemptSeed(fixedSeed);
    const picked = drawExam(questions, count, seed);
    setAttempt({ seed, questions: picked, orders: Object.fromEntries(picked.map((x) => [x.id, optionOrder(x, seed)])) });
    setResponses(Object.fromEntries(picked.map((x) => [x.id, initialResponse(x, seed)])));
    setFlags({});
    setResults({});
    setIndex(0);
    setTimedOut(false);
    setAnnounce('');
    submitted.current = false;
    announced.current = new Set(timeLimitMin && timeLimitMin <= 5 ? [5] : []);
    setNow(Date.now());
    setDeadline(timeLimitMin ? Date.now() + timeLimitMin * 60_000 : null);
    setPhase('running');
    moveFocus.current = 'question';
  };

  const submit = useCallback(
    (auto = false) => {
      if (!attempt || submitted.current) return;
      submitted.current = true;
      const graded = Object.fromEntries(attempt.questions.map((x) => [x.id, grade(x, responses[x.id])]));
      const finalPct = scorePct(attempt.questions.filter((x) => graded[x.id].correct).length, attempt.questions.length);
      setPrevBest(examStats?.bestPct);
      recordExam(moduleId, finalPct, passPct);
      setResults(graded);
      setTimedOut(auto);
      setDeadline(null);
      setPhase('results');
      moveFocus.current = 'heading';
      window.scrollTo({ top: 0 });
    },
    [attempt, responses, examStats, moduleId, passPct],
  );

  // Timer: tick every second; announce at 5 and 1 minutes; auto-submit at zero.
  useEffect(() => {
    if (deadline === null || (phase !== 'running' && phase !== 'review')) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [deadline, phase]);
  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 0) submit(true);
    else if (remaining <= 60_000 && !announced.current.has(1)) {
      announced.current.add(1).add(5);
      setAnnounce('One minute left.');
    } else if (remaining <= 300_000 && !announced.current.has(5)) {
      announced.current.add(5);
      setAnnounce('Five minutes left.');
    }
  }, [remaining, submit]);

  // Warn before leaving mid-exam.
  useEffect(() => {
    if (phase !== 'running' && phase !== 'review') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [phase]);

  const goTo = (i: number) => {
    setIndex(i);
    setPhase('running');
    moveFocus.current = 'question';
  };
  const toReview = () => {
    setPhase('review');
    moveFocus.current = 'heading';
  };

  const timer =
    remaining !== null && (phase === 'running' || phase === 'review') ? (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-sm font-semibold tabular-nums ${
          remaining < 60_000 ? 'bg-danger-soft text-danger' : remaining < 300_000 ? 'bg-warn-soft text-warn' : 'bg-surface-2'
        }`}
        role="timer"
        aria-label="Time remaining"
      >
        <ClockIcon />
        {fmtTime(remaining)}
      </span>
    ) : null;

  // ------------------------------------------------------------------ start
  if (phase === 'start') {
    const facts = [
      ['Questions', `${count}`, `drawn from ${questions.length}`],
      ['Pass mark', `${passPct}%`, `${Math.ceil((passPct / 100) * count)} of ${count} correct`],
      ['Time limit', timeLimitMin ? `${timeLimitMin} min` : 'None', timeLimitMin ? 'submits automatically' : 'take your time'],
    ];
    return (
      <div className="not-prose card p-5 sm:p-6" data-exam={moduleId} data-ready={progress ? 'true' : undefined} data-phase="start">
        <dl className="grid gap-3 sm:grid-cols-3">
          {facts.map(([k, v, sub]) => (
            <div key={k} className="rounded-lg bg-surface-2 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted">{k}</dt>
              <dd className="mt-0.5 text-2xl font-extrabold">{v}</dd>
              <dd className="text-sm text-muted">{sub}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-5 list-disc space-y-1 pl-5 text-[0.95rem]">
          <li>One question per screen. You can go back, change answers and flag questions to revisit.</li>
          <li>Nothing is graded until you submit, then you see every answer with its explanation.</li>
          <li>Each attempt draws a new set of questions.</li>
        </ul>
        <div className="mt-5 min-h-6 text-sm text-muted">
          {progress &&
            (examStats ? (
              <p>
                {examStats.passedAt ? (
                  <span className="font-semibold text-ok">Passed · best {examStats.bestPct}%</span>
                ) : (
                  <span>Best so far: <span className="font-semibold text-text">{examStats.bestPct}%</span></span>
                )}{' '}
                · {examStats.attempts} attempt{examStats.attempts === 1 ? '' : 's'}
                {examStats.passedAt && (
                  <>
                    {' '}·{' '}
                    <a className="text-accent underline" href={certificateUrl}>
                      view certificate
                    </a>
                  </>
                )}
              </p>
            ) : (
              <p>You haven't taken this exam yet.</p>
            ))}
        </div>
        <button type="button" className="btn btn-primary mt-4" onClick={start}>
          {examStats ? 'Start a new attempt' : 'Start the exam'} <span aria-hidden="true">→</span>
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------------ results
  if (phase === 'results' && attempt) {
    return (
      <div className="not-prose grid gap-6" data-exam={moduleId} data-ready="true" data-phase="results">
        <div className={`card overflow-hidden ${passed ? 'border-ok' : ''}`}>
          <div className="flex flex-col items-center gap-5 p-5 text-center sm:flex-row sm:p-6 sm:text-left">
            <ScoreRing pct={pct} passPct={passPct} size={128} />
            <div className="min-w-0 flex-1">
              <h2 ref={headingRef} tabIndex={-1} className={`text-2xl font-extrabold focus:outline-none ${passed ? 'text-ok' : 'text-danger'}`}>
                {passed ? 'You passed the exam' : 'Not passed this time'}
              </h2>
              <p className="mt-1">
                {correctCount} of {drawn.length} correct · pass mark {passPct}%.
                {timedOut && <span className="font-semibold text-warn"> Time ran out, so the exam was submitted automatically.</span>}
              </p>
              <p className="mt-1 text-sm text-muted">
                {prevBest === undefined
                  ? 'First attempt.'
                  : pct > prevBest
                    ? `New best! Previous best: ${prevBest}%.`
                    : `Your best: ${Math.max(prevBest, pct)}%.`}
              </p>
            </div>
          </div>
          {passed && (
            <div className="flex flex-wrap items-center gap-3 border-t border-ok/40 bg-ok-soft px-5 py-4 sm:px-6">
              <span className="text-2xl" aria-hidden="true">🎓</span>
              <p className="min-w-0 flex-1 font-semibold">Your certificate for {title.replace(/\s*exam$/i, '')} is unlocked.</p>
              <a className="btn btn-primary" href={certificateUrl}>
                Get your certificate
              </a>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={start}>
            Retake with new questions
          </button>
          <button type="button" className="btn" onClick={() => setPhase('start')}>
            Back to exam overview
          </button>
        </div>

        <section aria-labelledby="exam-answers">
          <h2 id="exam-answers" className="mb-3 text-xl font-bold">
            Answers and explanations
          </h2>
          <ol className="grid gap-4">
            {drawn.map((x, i) => (
              <li key={x.id} className="card p-4 sm:p-5">
                <QuestionView
                  question={x}
                  value={responses[x.id]}
                  locked
                  reveal
                  order={attempt.orders[x.id]}
                  idPrefix={`exam-result-${moduleId}`}
                  eyebrow={`Question ${i + 1} · ${TYPE_LABEL[x.type]}`}
                />
                <Feedback question={x} result={results[x.id]} unanswered={!isAnswered(x, responses[x.id])} />
              </li>
            ))}
          </ol>
        </section>
      </div>
    );
  }

  if (!attempt) return null;

  // ------------------------------------------------------------------ review before submit
  if (phase === 'review') {
    return (
      <div className="not-prose card overflow-hidden" data-exam={moduleId} data-ready="true" data-phase="review">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-2/60 px-4 py-3 sm:px-5">
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-bold focus:outline-none">
            Review your answers
          </h2>
          {timer}
        </div>
        <div className="p-4 sm:p-5">
          <p className="mb-4 text-[0.95rem]">
            {answeredCount} of {drawn.length} answered
            {unanswered > 0 && <span className="font-semibold text-warn"> · {unanswered} unanswered (they count as wrong)</span>}
            {Object.values(flags).some(Boolean) && <> · {Object.values(flags).filter(Boolean).length} flagged</>}.
            Select a question to change it.
          </p>
          <ol className="grid gap-1.5">
            {drawn.map((x, i) => {
              const done = isAnswered(x, responses[x.id]);
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    className="flex w-full items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-left hover:border-accent"
                  >
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                        done ? 'bg-accent text-on-accent' : 'border border-dashed border-warn text-warn'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">{renderInline(x.prompt)}</span>
                    <span className="shrink-0 text-xs font-semibold">
                      {flags[x.id] && (
                        <span className="mr-2 inline-flex items-center gap-1 text-warn">
                          <FlagIcon filled /> Flagged
                        </span>
                      )}
                      <span className={done ? 'text-muted' : 'text-warn'}>{done ? 'Answered' : 'Unanswered'}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={() => submit(false)}>
              Submit exam
            </button>
            <button type="button" className="btn" onClick={() => goTo(index)}>
              Back to questions
            </button>
          </div>
        </div>
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
      </div>
    );
  }

  // ------------------------------------------------------------------ running
  const last = index === drawn.length - 1;
  return (
    <div className="not-prose card overflow-hidden" data-exam={moduleId} data-ready="true" data-phase="running" data-seed={attempt.seed}>
      <div className="border-b border-border bg-surface-2/60 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
          <span className="font-semibold">
            Question {index + 1} <span className="font-normal text-muted">of {drawn.length}</span>
            <span className="font-normal text-muted"> · {answeredCount} answered</span>
          </span>
          {timer}
        </div>
        <div
          className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-label="Questions answered"
          aria-valuemin={0}
          aria-valuemax={drawn.length}
          aria-valuenow={answeredCount}
        >
          <div className="h-full rounded-full bg-module transition-[width]" style={{ width: `${(answeredCount / drawn.length) * 100}%` }} />
        </div>
        <nav className="mt-3 flex flex-wrap gap-1.5" aria-label="Jump to question">
          {drawn.map((x, i) => {
            const done = isAnswered(x, responses[x.id]);
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => goTo(i)}
                aria-current={i === index ? 'step' : undefined}
                aria-label={`Question ${i + 1}${done ? ', answered' : ''}${flags[x.id] ? ', flagged' : ''}`}
                className={`relative grid h-7 w-7 place-items-center rounded-md text-xs font-bold tabular-nums ${
                  i === index
                    ? 'bg-accent text-on-accent'
                    : done
                      ? 'bg-accent-soft text-accent'
                      : 'border border-border bg-surface text-muted hover:border-accent'
                }`}
              >
                {i + 1}
                {flags[x.id] && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-warn" aria-hidden="true" />}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-4 sm:p-5" key={q.id}>
        <QuestionView
          question={q}
          value={responses[q.id]}
          onChange={(v) => setResponses((r) => ({ ...r, [q.id]: v }))}
          order={attempt.orders[q.id]}
          idPrefix={`exam-${moduleId}`}
          eyebrow={<><span className="sr-only">Question {index + 1} of {drawn.length}. </span>{TYPE_LABEL[q.type]}</>}
          onSubmit={() => (last ? toReview() : goTo(index + 1))}
          focusRef={focusRef}
        />
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button type="button" className="btn" onClick={() => goTo(index - 1)} disabled={index === 0}>
            <span aria-hidden="true">←</span> Previous
          </button>
          {last ? (
            <button type="button" className="btn btn-primary" onClick={toReview}>
              Review and submit
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => goTo(index + 1)}>
              Next <span aria-hidden="true">→</span>
            </button>
          )}
          <button
            type="button"
            className={`btn ml-auto ${flags[q.id] ? 'border-warn text-warn' : ''}`}
            aria-pressed={Boolean(flags[q.id])}
            onClick={() => setFlags((f) => ({ ...f, [q.id]: !f[q.id] }))}
          >
            <FlagIcon filled={Boolean(flags[q.id])} /> {flags[q.id] ? 'Flagged' : 'Flag'}
          </button>
          {!last && (
            <button type="button" className="btn" onClick={toReview}>
              Review
            </button>
          )}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}

/** Root island. Its only locale-related prop is `locale`; children read text with useT() (see src/i18n/react.tsx). */
export default function ExamRunner({ locale = DEFAULT_LOCALE, ...props }: ExamRunnerProps & { locale?: Locale }) {
  return (
    <LocaleProvider locale={locale}>
      <ExamRunnerView {...props} />
    </LocaleProvider>
  );
}
