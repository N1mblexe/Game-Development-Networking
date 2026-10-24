/**
 * SM-2 spaced repetition (SuperMemo 2), with the usual 4-button mapping:
 * again = 1, hard = 3, good = 4, easy = 5.
 */
import type { CardState } from '../progress/types';

export type ReviewButton = 'again' | 'hard' | 'good' | 'easy';
const QUALITY: Record<ReviewButton, number> = { again: 1, hard: 3, good: 4, easy: 5 };

/** Local calendar date as YYYY-MM-DD. */
export function toDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export function review(prev: CardState | undefined, button: ReviewButton, now = new Date()): CardState {
  const q = QUALITY[button];
  const s: CardState = prev ? { ...prev } : { ef: 2.5, interval: 0, reps: 0, lapses: 0, due: toDay(now) };

  if (q < 3) {
    s.reps = 0;
    s.interval = 1;
    s.lapses += 1;
  } else {
    s.reps += 1;
    if (s.reps === 1) s.interval = 1;
    else if (s.reps === 2) s.interval = 6;
    else s.interval = Math.round(s.interval * s.ef);
    if (button === 'easy') s.interval = Math.max(s.interval + 1, Math.round(s.interval * 1.3));
  }
  s.ef = Math.max(1.3, s.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  s.due = toDay(addDays(now, s.interval));
  return s;
}

/** Unseen cards are "new"; seen cards are due when their due date is today or earlier. */
export function isDue(state: CardState | undefined, now = new Date()): boolean {
  return !state || state.due <= toDay(now);
}
