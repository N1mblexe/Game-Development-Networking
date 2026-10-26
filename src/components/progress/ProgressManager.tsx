import { useRef, useState, type ChangeEvent } from 'react';
import { useProgress } from '../../lib/progress/react';
import { exportProgress, importProgress, isLessonComplete, migrate, resetProgress } from '../../lib/progress/store';
import type { Progress } from '../../lib/progress/types';
import { isDue, toDay } from '../../lib/srs/sm2';
import { withBase } from '../../lib/url';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locales';
import { LocaleProvider } from '../../i18n/react';

export interface ProgressManagerProps {
  /** For the summary table: every module and its lesson keys. */
  modules: { id: string; title: string; lessonKeys: string[] }[];
}

type Status = { kind: 'ok' | 'error'; text: string } | null;
interface Pending {
  fileName: string;
  text: string;
  data: Progress;
}

/** Validate an exported file without applying it. Returns a readable error message on failure. */
export function parseProgressFile(text: string): { data: Progress } | { error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: "That file isn't valid JSON. Choose a file exported from this page (netlearn-progress-….json)." };
  }
  try {
    return { data: migrate(json) };
  } catch (e) {
    return { error: `That file doesn't look like NetLearn progress: ${(e as Error).message}.` };
  }
}

const summarize = (p: Progress) => {
  const lessons = Object.values(p.lessons).filter((l) => l.completedAt).length;
  const exams = Object.values(p.exams).filter((e) => e.passedAt).length;
  const cards = Object.keys(p.srs).length;
  return `${lessons} lesson${lessons === 1 ? '' : 's'} completed, ${exams} exam${exams === 1 ? '' : 's'} passed, ${cards} card${cards === 1 ? '' : 's'} studied`;
};

/** Summary table plus export (download), import (file, validated, confirmed) and reset (two-step). */
function ProgressManagerView({ modules }: ProgressManagerProps) {
  const progress = useProgress();
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cancelResetRef = useRef<HTMLButtonElement>(null);
  const confirmImportRef = useRef<HTMLButtonElement>(null);

  if (!progress) {
    return (
      <div className="card grid min-h-60 place-items-center p-6 text-sm text-muted" aria-busy="true" data-progress-manager>
        Loading your progress…
      </div>
    );
  }

  const allKeys = modules.flatMap((m) => m.lessonKeys);
  const lessonsDone = allKeys.filter((k) => isLessonComplete(progress, k)).length;
  const examsPassed = modules.filter((m) => progress.exams[m.id]?.passedAt).length;
  const cardsStudied = Object.keys(progress.srs).length;
  const cardsDue = Object.values(progress.srs).filter((s) => isDue(s)).length;
  const lastSaved = progress.updatedAt && new Date(progress.updatedAt).getTime() > 0 ? new Date(progress.updatedAt) : null;

  const doExport = () => {
    try {
      const blob = new Blob([exportProgress()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `netlearn-progress-${toDay(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus({ kind: 'ok', text: `Exported ${summarize(progress)}.` });
    } catch (e) {
      setStatus({ kind: 'error', text: `Export failed: ${(e as Error).message}` });
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setConfirmReset(false);
    if (file.size > 5_000_000) {
      setStatus({ kind: 'error', text: 'That file is too large to be a NetLearn progress export.' });
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setStatus({ kind: 'error', text: "That file couldn't be read." });
      return;
    }
    const parsed = parseProgressFile(text);
    if ('error' in parsed) {
      setPending(null);
      setStatus({ kind: 'error', text: parsed.error });
      return;
    }
    setStatus(null);
    setPending({ fileName: file.name, text, data: parsed.data });
    requestAnimationFrame(() => confirmImportRef.current?.focus());
  };

  const applyImport = () => {
    if (!pending) return;
    try {
      importProgress(pending.text);
      setStatus({ kind: 'ok', text: `Imported ${pending.fileName}: ${summarize(pending.data)}.` });
    } catch (e) {
      setStatus({ kind: 'error', text: `Import failed: ${(e as Error).message}` });
    }
    setPending(null);
  };

  const doReset = () => {
    resetProgress();
    setConfirmReset(false);
    setStatus({ kind: 'ok', text: 'All progress was deleted from this browser.' });
  };

  const stats: [string, string, string?][] = [
    ['Lessons completed', `${lessonsDone}`, `of ${allKeys.length}`],
    ['Exams passed', `${examsPassed}`, `of ${modules.length}`],
    ['Cards studied', `${cardsStudied}`, cardsDue ? `${cardsDue} due now` : undefined],
  ];

  return (
    <div className="grid gap-8" data-progress-manager data-ready="true">
      <dl className="grid grid-cols-3 gap-2 sm:gap-3">
        {stats.map(([label, value, sub]) => (
          <div key={label} className="card min-w-0 px-3 py-3 sm:px-5 sm:py-4">
            <dt className="text-xs text-muted sm:text-sm">{label}</dt>
            <dd className="mt-1 text-2xl font-extrabold tabular-nums sm:text-3xl">{value}</dd>
            {sub && <dd className="text-xs text-muted sm:text-sm">{sub}</dd>}
          </div>
        ))}
      </dl>

      <section aria-labelledby="pm-modules">
        <h2 id="pm-modules" className="mb-3 text-xl font-bold">
          By module
        </h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">Module</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Lessons</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Exam</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => {
                const done = m.lessonKeys.filter((k) => isLessonComplete(progress, k)).length;
                const pct = m.lessonKeys.length ? (done / m.lessonKeys.length) * 100 : 0;
                const exam = progress.exams[m.id];
                return (
                  <tr key={m.id} className="border-t border-border align-top">
                    <th scope="row" className="px-4 py-3 text-left font-medium">
                      <a className="hover:text-accent hover:underline" href={withBase(`/modules/${m.id}/`)}>
                        {m.title}
                      </a>
                    </th>
                    <td className="px-3 py-3">
                      <span className="tabular-nums">
                        {done}/{m.lessonKeys.length}
                      </span>
                      <span className="mt-1.5 block h-1.5 w-full min-w-12 max-w-32 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {!exam ? (
                        <span className="text-muted">Not attempted</span>
                      ) : exam.passedAt ? (
                        <>
                          <span className="font-semibold text-ok">Passed {exam.bestPct}%</span>
                          <a className="mt-0.5 block text-accent underline" href={withBase(`/certificate/${m.id}/`)}>
                            Certificate<span className="sr-only"> for {m.title}</span>
                          </a>
                        </>
                      ) : (
                        <span>
                          Best {exam.bestPct}% <span className="text-muted">· {exam.attempts} attempt{exam.attempts === 1 ? '' : 's'}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="pm-data" className="card p-5 sm:p-6">
        <h2 id="pm-data" className="text-xl font-bold">
          Backup and restore
        </h2>
        <p className="mt-1 text-sm text-muted">
          {lastSaved ? <>Last change {lastSaved.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}. </> : null}
          Export a JSON file to move your progress to another browser, then import it there.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={doExport}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Export progress
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 15V3m0 0L8 7m4-4 4 4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Import from file…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Progress file to import"
            onChange={onFile}
            data-import-input
          />
        </div>

        {pending && (
          <div className="mt-4 rounded-lg border border-warn bg-warn-soft px-4 py-3" role="alertdialog" aria-labelledby="pm-import-title" aria-describedby="pm-import-desc">
            <p id="pm-import-title" className="font-semibold">
              Replace your current progress?
            </p>
            <p id="pm-import-desc" className="mt-1 text-sm">
              <span className="font-mono [overflow-wrap:anywhere]">{pending.fileName}</span> contains {summarize(pending.data)}. Importing replaces
              everything stored in this browser now ({summarize(progress)}).
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button ref={confirmImportRef} type="button" className="btn btn-primary" onClick={applyImport}>
                Replace and import
              </button>
              <button type="button" className="btn" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 border-t border-border pt-5">
          <h3 className="font-semibold">Reset</h3>
          <p className="mt-1 text-sm text-muted">Deletes lessons, quiz and exam scores, flashcard schedules and your certificate name.</p>
          {!confirmReset ? (
            <button
              type="button"
              className="btn mt-3 border-danger/60 text-danger hover:bg-danger-soft"
              onClick={() => {
                setPending(null);
                setConfirmReset(true);
                requestAnimationFrame(() => cancelResetRef.current?.focus());
              }}
            >
              Reset progress…
            </button>
          ) : (
            <div className="mt-3 rounded-lg border border-danger bg-danger-soft px-4 py-3" role="alertdialog" aria-labelledby="pm-reset-title">
              <p id="pm-reset-title" className="font-semibold text-danger">
                Delete all progress? This can't be undone.
              </p>
              <p className="mt-1 text-sm">Export a backup first if you might want it back.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn border-danger bg-danger text-white hover:bg-danger dark:text-bg" onClick={doReset}>
                  Yes, delete everything
                </button>
                <button ref={cancelResetRef} type="button" className="btn" onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <p
          className={`mt-4 text-sm empty:hidden ${status?.kind === 'error' ? 'font-semibold text-danger' : 'text-ok'}`}
          role="status"
          data-status={status?.kind}
        >
          {status?.text}
        </p>
      </section>
    </div>
  );
}

/** Root island. Its only locale-related prop is `locale`; children read text with useT() (see src/i18n/react.tsx). */
export default function ProgressManager({ locale = DEFAULT_LOCALE, ...props }: ProgressManagerProps & { locale?: Locale }) {
  return (
    <LocaleProvider locale={locale}>
      <ProgressManagerView {...props} />
    </LocaleProvider>
  );
}
