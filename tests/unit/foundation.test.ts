import { describe, expect, it } from 'vitest';
import { lessonIdFromPath, questionSchema, examSchema } from '../../src/lib/content/schemas';
import { review, isDue, toDay } from '../../src/lib/srs/sm2';
import { migrate } from '../../src/lib/progress/store';
import { emptyProgress } from '../../src/lib/progress/types';

describe('lessonIdFromPath', () => {
  it('strips the NN- prefix and extension', () => {
    expect(lessonIdFromPath('theory/01-packets-and-protocols.mdx')).toBe('theory/packets-and-protocols');
  });
});

describe('questionSchema', () => {
  const base = { id: 'q', prompt: 'p', explanation: 'e' };
  it('rejects an out-of-range single answer', () => {
    expect(questionSchema.safeParse({ ...base, type: 'single', options: ['a', 'b'], answer: 2 }).success).toBe(false);
  });
  it('rejects codeline answers beyond the code', () => {
    expect(questionSchema.safeParse({ ...base, type: 'codeline', code: 'a\nb', answerLines: [3] }).success).toBe(false);
  });
  it('applies defaults', () => {
    const q = questionSchema.parse({ ...base, type: 'truefalse', answer: true });
    expect(q.lang).toBe('csharp');
    expect(q.difficulty).toBe(2);
  });
});

describe('examSchema', () => {
  it('requires a pool at least as large as drawCount', () => {
    const q = { id: 'a', prompt: 'p', explanation: 'e', type: 'truefalse', answer: true };
    expect(examSchema.safeParse({ title: 't', drawCount: 2, questions: [q] }).success).toBe(false);
  });
});

describe('sm2', () => {
  const now = new Date(2026, 0, 1);
  it('schedules 1 day, then 6 days, then interval × ef', () => {
    const a = review(undefined, 'good', now);
    expect(a.interval).toBe(1);
    const b = review(a, 'good', now);
    expect(b.interval).toBe(6);
    const c = review(b, 'good', now);
    expect(c.interval).toBe(Math.round(6 * b.ef));
  });
  it('resets on "again" and never drops ef below 1.3', () => {
    let s = review(undefined, 'good', now);
    for (let i = 0; i < 10; i++) s = review(s, 'again', now);
    expect(s.reps).toBe(0);
    expect(s.interval).toBe(1);
    expect(s.ef).toBeGreaterThanOrEqual(1.3);
    expect(s.lapses).toBe(10);
  });
  it('treats unseen cards as due', () => {
    expect(isDue(undefined, now)).toBe(true);
    expect(isDue({ ef: 2.5, interval: 1, reps: 1, lapses: 0, due: toDay(new Date(2026, 0, 2)) }, now)).toBe(false);
  });
});

describe('progress migrate', () => {
  it('round-trips empty progress', () => {
    expect(migrate(JSON.parse(JSON.stringify(emptyProgress())))).toMatchObject({ version: 1, lessons: {} });
  });
  it('rejects garbage and unknown versions', () => {
    expect(() => migrate(null)).toThrow();
    expect(() => migrate({ version: 99 })).toThrow();
  });
});
