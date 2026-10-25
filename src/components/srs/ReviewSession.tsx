import { useEffect, useMemo, useRef, useState } from 'react';
import { useProgress } from '../../lib/progress/react';
import { $progress, setCardState } from '../../lib/progress/store';
import { review, toDay, type ReviewButton } from '../../lib/srs/sm2';
import {
  DEFAULT_NEW_PER_SESSION,
  answerCard,
  buildQueue,
  countByModule,
  earliestDue,
  fromDay,
  intervalLabel,
  startSession,
  type SessionState,
} from '../../lib/srs/session';
import FlipCard from './FlipCard';
import type { DeckCard } from './types';

export interface ReviewSessionProps {
  /** Every card in the course; the session picks due + new cards using lib/srs. */
  cards: DeckCard[];
  moduleTitles: Record<string, string>;
  /** Max new (never seen) cards introduced per session. */
  newPerSession?: number;
}

const BUTTONS: { id: ReviewButton; label: string; key: string; tone: string }[] = [
  { id: 'again', label: 'Again', key: '1', tone: 'border-danger/60 text-danger hover:bg-danger-soft' },
  { id: 'hard', label: 'Hard', key: '2', tone: 'border-warn/60 text-warn hover:bg-warn-soft' },
  { id: 'good', label: 'Good', key: '3', tone: 'border-ok/60 text-ok hover:bg-ok-soft' },
  { id: 'easy', label: 'Easy', key: '4', tone: 'border-accent/60 text-accent hover:bg-accent-soft' },
];

/** "tomorrow", "today", or "Tuesday, 3 November". */
export function friendlyDay(day: string, now = new Date()): string {
  if (day <= toDay(now)) return 'today';
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (day === toDay(tomorrow)) return 'tomorrow';
  return fromDay(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

const readModuleParam = () => {
  try {
    return new URLSearchParams(window.location.search).get('module');
  } catch {
    return null;
  }
};

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * Spaced-repetition review: due cards plus a few new ones, flip, then grade Again/Hard/Good/Easy
 * (keys 1–4). "Again" brings the card back later in the same session.
 */
export default function ReviewSession({ cards, moduleTitles, newPerSession = DEFAULT_NEW_PER_SESSION }: ReviewSessionProps) {
  const progress = useProgress();
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [finished, setFinished] = useState(false);
  const showRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const byId = useMemo(() => new Map(cards.map((c) => [c.globalId, c])), [cards]);
  const modules = useMemo(() => [...new Set([...Object.keys(moduleTitles), ...cards.map((c) => c.module)])], [cards, moduleTitles]);

  // The ?module= filter is client-only state (static pages can't read the query string).
  useEffect(() => {
    const sync = () => {
      const m = readModuleParam();
      setModuleId(m && modules.includes(m) ? m : null);
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [moduleTitles, modules]);

  const chooseModule = (m: string | null) => {
    try {
      const url = new URL(window.location.href);
      if (m) url.searchParams.set('module', m);
      else url.searchParams.delete('module');
      window.history.pushState(null, '', url);
    } catch {
      /* ignore: filter still applies for this view */
    }
    setModuleId(m);
    setSession(null);
    setFinished(false);
  };

  const begin = () => {
    const queue = buildQueue(cards, $progress.get().srs, { module: moduleId, newPerSession });
    setSession(startSession(queue));
    setFlipped(false);
    setFinished(false);
    requestAnimationFrame(() => showRef.current?.focus());
  };

  const current = session?.queue[0] ? byId.get(session.queue[0]) : undefined;

  const rate = (button: ReviewButton) => {
    if (!session || !current || !flipped) return;
    setCardState(current.globalId, review($progress.get().srs[current.globalId], button));
    const next = answerCard(session, button);
    setSession(next);
    setFlipped(false);
    if (!next.queue.length) {
      setFinished(true);
      requestAnimationFrame(() => headingRef.current?.focus());
    } else requestAnimationFrame(() => showRef.current?.focus());
  };

  // Keyboard: Space/Enter flips, 1–4 grade (only once the answer is shown).
  useEffect(() => {
    if (!session || finished) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        setFlipped((f) => !f);
      }
      const b = BUTTONS.find((x) => x.key === e.key);
      if (b && flipped) {
        e.preventDefault();
        rate(b.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!progress) {
    return (
      <div className="card grid min-h-60 place-items-center p-6 text-sm text-muted" aria-busy="true" data-review>
        Loading your cards…
      </div>
    );
  }

  if (!cards.length) return <p className="text-muted" data-review data-ready="true">No flashcards have been written yet.</p>;

  const counts = countByModule(cards, progress.srs);
  const scope = moduleId ? (counts.byModule[moduleId] ?? { total: 0, due: 0, fresh: 0 }) : counts.all;
  const scopeTitle = moduleId ? (moduleTitles[moduleId] ?? moduleId) : 'All modules';
  const nextDue = earliestDue(cards, progress.srs, moduleId);
  const queueSize = scope.due + Math.min(scope.fresh, newPerSession);

  // ------------------------------------------------------------------ in session
  if (session && !finished && current) {
    const done = session.done.length;
    const left = session.queue.length;
    const state = progress.srs[current.globalId];
    return (
      <div className="not-prose mx-auto max-w-2xl" data-review data-ready="true" data-phase="session">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-semibold tabular-nums" aria-live="polite" data-counter>
            {left} left <span className="font-normal text-muted">· {done} done</span>
          </span>
          <span className="flex items-center gap-2 text-muted">
            {!state && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">New</span>}
            <button type="button" className="text-accent underline" onClick={() => setSession(null)}>
              End session
            </button>
          </span>
        </div>
        <div
          className="mb-4 h-1.5 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-label="Session progress"
          aria-valuemin={0}
          aria-valuemax={done + left}
          aria-valuenow={done}
        >
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(done / (done + left)) * 100}%` }} />
        </div>

        <FlipCard
          key={`${current.globalId}-${session.tally.again}-${done}`}
          card={current}
          flipped={flipped}
          onFlip={() => setFlipped((f) => !f)}
          tag={<span className="truncate normal-case">{moduleTitles[current.module] ?? current.module}</span>}
        />

        <div className="mt-4 min-h-[4.5rem]">
          {!flipped ? (
            <div className="flex justify-center">
              <button ref={showRef} type="button" className="btn btn-primary min-w-48 justify-center" onClick={() => setFlipped(true)}>
                Show answer <kbd className="hidden rounded bg-on-accent/20 px-1.5 font-mono text-xs sm:inline">Space</kbd>
              </button>
            </div>
          ) : (
            <div role="group" aria-label="How well did you remember it?">
              <p className="mb-2 text-center text-sm text-muted">How well did you remember it?</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {BUTTONS.map((b) => {
                  const hint = b.id === 'again' ? 'again soon' : intervalLabel(review(state, b.id).interval);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => rate(b.id)}
                      className={`btn flex-col justify-center gap-0 py-2 ${b.tone}`}
                      aria-keyshortcuts={b.key}
                    >
                      <span>{b.label}</span>
                      <span className="text-xs font-normal text-muted">
                        <kbd className="font-mono">{b.key}</kbd> · {hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ overview / finished / empty
  const tally = session?.tally;
  return (
    <div className="not-prose grid gap-6" data-review data-ready="true" data-phase={finished ? 'finished' : 'start'}>
      <div className="card p-5 sm:p-6">
        {finished && tally && session ? (
          <>
            <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-extrabold text-ok focus:outline-none">
              Session complete
            </h2>
            <p className="mt-1">
              You reviewed {session.done.length} card{session.done.length === 1 ? '' : 's'}
              {session.lapses > 0 && <> and repeated {session.lapses} you forgot</>}.
            </p>
            <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
              {BUTTONS.map((b) => (
                <div key={b.id} className="rounded-lg bg-surface-2 px-2 py-2">
                  <dt className="text-xs text-muted">{b.label}</dt>
                  <dd className={`text-xl font-bold ${b.tone.split(' ')[1]}`}>{tally[b.id]}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{scopeTitle}</p>
            <h2 className="mt-1 text-2xl font-extrabold">
              {queueSize > 0 ? `${queueSize} card${queueSize === 1 ? '' : 's'} ready` : 'All caught up'}
            </h2>
          </>
        )}

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            <span className="font-bold tabular-nums">{scope.due}</span> <span className="text-muted">due</span>
          </span>
          <span>
            <span className="font-bold tabular-nums">{scope.fresh}</span> <span className="text-muted">new</span>
            {scope.fresh > newPerSession && <span className="text-muted"> (up to {newPerSession} per session)</span>}
          </span>
          <span>
            <span className="font-bold tabular-nums">{scope.total}</span> <span className="text-muted">total</span>
          </span>
        </div>

        {queueSize > 0 ? (
          <button type="button" className="btn btn-primary mt-5" onClick={begin}>
            {finished ? 'Keep going' : 'Start review'} <span aria-hidden="true">→</span>
          </button>
        ) : (
          <p className="mt-4 rounded-lg bg-ok-soft px-4 py-3 text-[0.95rem]" data-empty>
            {scope.total === 0 ? (
              'No cards in this module yet.'
            ) : nextDue ? (
              <>
                All caught up. Next card due on <strong>{friendlyDay(nextDue)}</strong>
                {nextDue > toDay(new Date()) && <> ({fromDay(nextDue).toLocaleDateString(undefined, { dateStyle: 'medium' })})</>}.
              </>
            ) : (
              'All caught up.'
            )}
          </p>
        )}
      </div>

      <section aria-labelledby="review-modules">
        <h2 id="review-modules" className="mb-3 text-lg font-bold">
          By module
        </h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold">Module</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Due</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">New</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {[null, ...modules].map((m) => {
                const c = (m ? counts.byModule[m] : counts.all) ?? { total: 0, due: 0, fresh: 0 };
                const active = m === moduleId;
                return (
                  <tr key={m ?? 'all'} className={`border-t border-border ${active ? 'bg-accent-soft/60' : ''}`}>
                    <th scope="row" className="px-4 py-2.5 text-left font-medium">
                      {m ? (moduleTitles[m] ?? m) : 'All modules'}
                    </th>
                    <td className="px-2 py-2.5 text-right tabular-nums">{c.due}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{c.fresh}</td>
                    <td className="px-4 py-2.5 text-right">
                      {active ? (
                        <span className="text-xs font-semibold text-accent">Selected</span>
                      ) : (
                        <a
                          className="text-accent underline"
                          href={m ? `?module=${encodeURIComponent(m)}` : '?'}
                          onClick={(e) => {
                            e.preventDefault();
                            chooseModule(m);
                          }}
                        >
                          Select<span className="sr-only"> {m ? (moduleTitles[m] ?? m) : 'all modules'}</span>
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
