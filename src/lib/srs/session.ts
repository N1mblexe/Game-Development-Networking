/**
 * Review-session logic on top of SM-2: which cards to study now, and how the queue evolves
 * as the learner grades cards. Pure functions; the React component just holds the state.
 */
import type { CardState } from '../progress/types';
import { isDue, toDay, type ReviewButton } from './sm2';

export interface CardRef {
  globalId: string;
  module: string;
}

export interface ModuleCounts {
  total: number;
  /** Seen before and due today or earlier. */
  due: number;
  /** Never seen. */
  fresh: number;
}

export const DEFAULT_NEW_PER_SESSION = 10;
/** An "again" card returns after this many other cards (or at the end of a shorter queue). */
export const AGAIN_GAP = 3;

/** Due/new/total counts per module, plus an "all" entry. */
export function countByModule(cards: readonly CardRef[], srs: Record<string, CardState>, now = new Date()) {
  const counts: Record<string, ModuleCounts> = {};
  const all: ModuleCounts = { total: 0, due: 0, fresh: 0 };
  for (const c of cards) {
    const m = (counts[c.module] ??= { total: 0, due: 0, fresh: 0 });
    const s = srs[c.globalId];
    for (const x of [m, all]) {
      x.total++;
      if (!s) x.fresh++;
      else if (isDue(s, now)) x.due++;
    }
  }
  return { byModule: counts, all };
}

/**
 * The session queue: every due card (most overdue first), then up to `newPerSession` new
 * cards in content order. Optionally filtered to one module.
 */
export function buildQueue(
  cards: readonly CardRef[],
  srs: Record<string, CardState>,
  opts: { now?: Date; newPerSession?: number; module?: string | null } = {},
): string[] {
  const now = opts.now ?? new Date();
  const limit = Math.max(0, opts.newPerSession ?? DEFAULT_NEW_PER_SESSION);
  const scope = opts.module ? cards.filter((c) => c.module === opts.module) : cards;
  const due = scope
    .map((c, i) => ({ id: c.globalId, s: srs[c.globalId], i }))
    .filter((x) => x.s && isDue(x.s, now))
    .sort((a, b) => (a.s!.due < b.s!.due ? -1 : a.s!.due > b.s!.due ? 1 : a.i - b.i))
    .map((x) => x.id);
  const fresh = scope.filter((c) => !srs[c.globalId]).slice(0, limit).map((c) => c.globalId);
  return [...due, ...fresh];
}

/** Earliest due date (YYYY-MM-DD) among seen cards in scope, or null if none are scheduled. */
export function earliestDue(
  cards: readonly CardRef[],
  srs: Record<string, CardState>,
  module?: string | null,
): string | null {
  let min: string | null = null;
  for (const c of cards) {
    if (module && c.module !== module) continue;
    const s = srs[c.globalId];
    if (s && (min === null || s.due < min)) min = s.due;
  }
  return min;
}

export interface SessionState {
  /** Cards still to show; the first is current. */
  queue: string[];
  /** Cards finished this session (graded hard/good/easy). */
  done: string[];
  /** How many times "again" was pressed. */
  lapses: number;
  /** Per-button tally for the summary. */
  tally: Record<ReviewButton, number>;
}

export function startSession(queue: string[]): SessionState {
  return { queue: queue.slice(), done: [], lapses: 0, tally: { again: 0, hard: 0, good: 0, easy: 0 } };
}

/** Advance the session after grading the current card. "Again" re-queues it a few cards later. */
export function answerCard(state: SessionState, button: ReviewButton): SessionState {
  const [current, ...rest] = state.queue;
  if (current === undefined) return state;
  const tally = { ...state.tally, [button]: state.tally[button] + 1 };
  if (button === 'again') {
    const queue = rest.slice();
    queue.splice(Math.min(AGAIN_GAP, queue.length), 0, current);
    return { ...state, queue, lapses: state.lapses + 1, tally };
  }
  return { ...state, queue: rest, done: [...state.done, current], tally };
}

/** Human-friendly interval label for button hints: "<1d" is impossible with SM-2, so days/months. */
export function intervalLabel(days: number): string {
  if (days < 1) return 'now';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, '')}y`;
}

/** "YYYY-MM-DD" → Date at local midnight. */
export function fromDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export const today = () => toDay(new Date());
