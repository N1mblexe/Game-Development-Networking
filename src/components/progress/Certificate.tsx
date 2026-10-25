import { useEffect, useState } from 'react';
import { useProgress } from '../../lib/progress/react';
import { isLessonComplete, setCertName } from '../../lib/progress/store';
import { hashString } from '../../lib/quiz/random';
import './certificate.css';

export interface CertificateProps {
  moduleId: string;
  moduleTitle: string;
  moduleColor: string;
  lessonKeys: string[];
  examUrl: string;
  /** 1–3 letter module monogram for the seal. */
  moduleBadge?: string;
}

const Logo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="5" cy="12" r="2.5" />
    <circle cx="19" cy="5" r="2.5" />
    <circle cx="19" cy="19" r="2.5" />
    <path d="M7.3 11 16.7 6M7.3 13l9.4 5" />
  </svg>
);

const LockIcon = () => (
  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

/** Stable, verifiable-looking id derived from the module and the pass timestamp. */
export const certificateId = (moduleId: string, passedAt: string) =>
  `NL-${moduleId.toUpperCase().slice(0, 6)}-${hashString(`${moduleId}|${passedAt}`).toString(36).toUpperCase().padStart(7, '0')}`;

/**
 * Locked until the module exam is passed; then a printable certificate with the learner's name.
 * Rendered only after mount (it depends on localStorage).
 */
export default function Certificate({ moduleId, moduleTitle, moduleColor, lessonKeys, examUrl, moduleBadge }: CertificateProps) {
  const progress = useProgress();
  const [name, setName] = useState('');
  const [loadedName, setLoadedName] = useState(false);

  useEffect(() => {
    if (progress && !loadedName) {
      setName(progress.certName ?? '');
      setLoadedName(true);
    }
  }, [progress, loadedName]);

  if (!progress) {
    return (
      <div className="card grid min-h-72 place-items-center p-6 text-sm text-muted" aria-busy="true" data-certificate>
        Loading…
      </div>
    );
  }

  const exam = progress.exams[moduleId];
  const done = lessonKeys.filter((k) => isLessonComplete(progress, k)).length;
  const lessonPct = lessonKeys.length ? Math.round((done / lessonKeys.length) * 100) : 0;

  if (!exam?.passedAt) {
    return (
      <div className="mx-auto max-w-2xl" data-certificate="locked" data-ready="true">
        <div className="card overflow-hidden">
          <div className="flex items-start gap-4 p-5 sm:p-6">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
              <LockIcon />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Certificate locked</p>
              <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight">{moduleTitle}</h1>
              <p className="mt-2 text-muted">Pass the module exam to unlock your printable certificate.</p>
            </div>
          </div>
          <dl className="grid gap-px border-t border-border bg-border sm:grid-cols-2">
            <div className="bg-surface px-5 py-4 sm:px-6">
              <dt className="text-sm text-muted">Lessons completed</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums">
                {done} <span className="text-base font-medium text-muted">/ {lessonKeys.length}</span>
              </dd>
              <dd className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full" style={{ width: `${lessonPct}%`, background: moduleColor }} />
              </dd>
            </div>
            <div className="bg-surface px-5 py-4 sm:px-6">
              <dt className="text-sm text-muted">Best exam score</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums">{exam ? `${exam.bestPct}%` : 'Not attempted'}</dd>
              {exam && (
                <dd className="mt-1 text-sm text-muted">
                  {exam.attempts} attempt{exam.attempts === 1 ? '' : 's'}
                </dd>
              )}
            </div>
          </dl>
          <div className="border-t border-border px-5 py-4 sm:px-6">
            <a className="btn btn-primary" href={examUrl}>
              {exam ? 'Try the exam again' : 'Take the exam'} <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  const passedDate = new Date(exam.passedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const trimmed = name.trim();

  return (
    <div className="grid gap-6" data-certificate="unlocked" data-ready="true">
      <div className="no-print flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ok">Exam passed · {exam.bestPct}%</p>
          <h1 className="text-3xl font-extrabold tracking-tight">Your certificate</h1>
        </div>
        <button type="button" className="btn btn-primary self-start sm:self-auto" onClick={() => window.print()}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z" strokeLinejoin="round" />
          </svg>
          Print / Save as PDF
        </button>
      </div>

      <div className="no-print card p-4 sm:p-5">
        <label htmlFor="cert-name" className="block font-semibold">
          Name on the certificate
        </label>
        <p id="cert-name-hint" className="mt-0.5 text-sm text-muted">
          Saved in this browser only.
        </p>
        <input
          id="cert-name"
          type="text"
          value={name}
          maxLength={80}
          autoComplete="name"
          aria-describedby="cert-name-hint"
          placeholder="Your full name"
          onChange={(e) => {
            setName(e.target.value);
            setCertName(e.target.value);
          }}
          className="mt-2 w-full max-w-md rounded-lg border border-border bg-surface px-3 py-2 text-text placeholder:text-muted/70 focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-accent"
        />
      </div>

      <div className="cert-wrap">
        <article className="cert" style={{ ['--cert' as string]: moduleColor }} aria-label={`Certificate of completion: ${moduleTitle}`}>
          <div className="cert-frame">
            <div className="cert-inner">
              <div className="flex flex-col items-center">
                <div className="cert-brand">
                  <Logo />
                  NetLearn
                </div>
                <p className="cert-kicker">Certificate of completion</p>
              </div>

              <div className="flex w-full flex-col items-center gap-[1.2cqw]">
                <p className="cert-small">This certifies that</p>
                <p className="cert-name" data-empty={!trimmed}>
                  {trimmed || 'Your name'}
                </p>
                <p className="cert-small mt-[0.6cqw]">has completed the course module</p>
                <p className="cert-module">{moduleTitle}</p>
                <p className="cert-small">
                  and passed its final exam with a score of <strong className="text-[#1b1f27]">{exam.bestPct}%</strong>.
                </p>
              </div>

              <div className="cert-footer">
                <div className="cert-field text-left">
                  <strong>{passedDate}</strong>
                  Date passed
                </div>
                <div className="cert-seal" aria-hidden="true">
                  <b>{moduleBadge ?? moduleTitle.slice(0, 2).toUpperCase()}</b>
                  <span>PASSED</span>
                </div>
                <div className="cert-field text-right">
                  <strong className="font-mono">{certificateId(moduleId, exam.passedAt)}</strong>
                  Certificate ID
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>
      {!trimmed && <p className="no-print -mt-3 text-sm text-warn">Add your name above before printing.</p>}
    </div>
  );
}
