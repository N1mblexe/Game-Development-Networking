import { describe, expect, it } from 'vitest';
import type { CardState } from '../../src/lib/progress/types';
import { review, toDay } from '../../src/lib/srs/sm2';
import {
  AGAIN_GAP,
  answerCard,
  buildQueue,
  countByModule,
  earliestDue,
  fromDay,
  intervalLabel,
  startSession,
} from '../../src/lib/srs/session';

const now = new Date(2026, 5, 15, 12);
const day = (offset: number) => toDay(new Date(2026, 5, 15 + offset));
const st = (dueOffset: number): CardState => ({ ef: 2.5, interval: 1, reps: 1, lapses: 0, due: day(dueOffset) });

const cards = [
  ...Array.from({ length: 14 }, (_, i) => ({ globalId: `a/c${i}`, module: 'a' })),
  ...Array.from({ length: 4 }, (_, i) => ({ globalId: `b/c${i}`, module: 'b' })),
];

describe('buildQueue', () => {
  it('takes due cards (most overdue first) then up to newPerSession new cards', () => {
    const srs = { 'a/c3': st(0), 'a/c1': st(-5), 'a/c2': st(3), 'b/c0': st(-1) };
    const q = buildQueue(cards, srs, { now, newPerSession: 3 });
    expect(q.slice(0, 3)).toEqual(['a/c1', 'b/c0', 'a/c3']);
    expect(q.slice(3)).toEqual(['a/c0', 'a/c4', 'a/c5']);
    expect(q).not.toContain('a/c2');
  });

  it('defaults to 10 new cards', () => {
    expect(buildQueue(cards, {}, { now })).toHaveLength(10);
  });

  it('filters by module', () => {
    const q = buildQueue(cards, { 'a/c0': st(-1) }, { now, module: 'b' });
    expect(q).toEqual(['b/c0', 'b/c1', 'b/c2', 'b/c3']);
  });

  it('is empty when everything is scheduled in the future', () => {
    const srs = Object.fromEntries(cards.map((c) => [c.globalId, st(2)]));
    expect(buildQueue(cards, srs, { now })).toEqual([]);
    expect(earliestDue(cards, srs)).toBe(day(2));
  });
});

describe('countByModule and earliestDue', () => {
  it('counts due, new and total per module', () => {
    const { byModule, all } = countByModule(cards, { 'a/c0': st(0), 'a/c1': st(1), 'b/c0': st(-2) }, now);
    expect(byModule.a).toEqual({ total: 14, due: 1, fresh: 12 });
    expect(byModule.b).toEqual({ total: 4, due: 1, fresh: 3 });
    expect(all).toEqual({ total: 18, due: 2, fresh: 15 });
  });
  it('earliestDue respects the module filter and returns null when nothing is scheduled', () => {
    const srs = { 'a/c0': st(4), 'b/c0': st(2) };
    expect(earliestDue(cards, srs)).toBe(day(2));
    expect(earliestDue(cards, srs, 'a')).toBe(day(4));
    expect(earliestDue(cards, {})).toBeNull();
  });
});

describe('session queue', () => {
  it('"again" brings the card back a few cards later, and it still has to be passed', () => {
    let s = startSession(['x', 'a', 'b', 'c', 'd']);
    s = answerCard(s, 'again');
    expect(s.queue).toEqual(['a', 'b', 'c', 'x', 'd']);
    expect(s.queue.indexOf('x')).toBe(AGAIN_GAP);
    expect(s.done).toEqual([]);
    s = answerCard(s, 'good');
    s = answerCard(s, 'hard');
    s = answerCard(s, 'easy');
    expect(s.queue[0]).toBe('x');
    s = answerCard(s, 'good');
    s = answerCard(s, 'good');
    expect(s.queue).toEqual([]);
    expect(s.done).toEqual(['a', 'b', 'c', 'x', 'd']);
    expect(s.tally).toEqual({ again: 1, hard: 1, good: 3, easy: 1 });
    expect(s.lapses).toBe(1);
  });

  it('re-queues at the end of a short queue, including a queue of one', () => {
    expect(answerCard(startSession(['x', 'a']), 'again').queue).toEqual(['a', 'x']);
    expect(answerCard(startSession(['x']), 'again').queue).toEqual(['x']);
  });

  it('is a no-op when empty and does not mutate the previous state', () => {
    const empty = startSession([]);
    expect(answerCard(empty, 'good')).toBe(empty);
    const s = startSession(['a', 'b']);
    answerCard(s, 'good');
    expect(s.queue).toEqual(['a', 'b']);
  });

  it('a full SM-2 session leaves no card due today', () => {
    let srs: Record<string, CardState> = {};
    let s = startSession(buildQueue(cards, srs, { now, module: 'b' }));
    let guard = 0;
    while (s.queue.length && guard++ < 50) {
      const id = s.queue[0];
      // Fail each card once, then pass it.
      const button = s.tally.again < 4 && !srs[id] ? 'again' : 'good';
      srs = { ...srs, [id]: review(srs[id], button, now) };
      s = answerCard(s, button);
    }
    expect(s.done).toHaveLength(4);
    expect(buildQueue(cards, srs, { now, module: 'b' })).toEqual([]);
  });
});

describe('labels', () => {
  it('intervalLabel', () => {
    expect(intervalLabel(1)).toBe('1d');
    expect(intervalLabel(45)).toBe('2mo');
    expect(intervalLabel(365)).toBe('1y');
    expect(intervalLabel(500)).toBe('1.4y');
  });
  it('fromDay round-trips with toDay', () => {
    expect(toDay(fromDay('2026-03-09'))).toBe('2026-03-09');
  });
});
