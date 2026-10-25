import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { questionSchema, quizSchema, type Question } from '../../src/lib/content/schemas';
import {
  correctResponse,
  describeAnswer,
  grade,
  initialResponse,
  isAnswered,
  normalizeText,
  optionOrder,
  parseNumber,
  scorePct,
} from '../../src/lib/quiz/grade';

const q = (raw: Record<string, unknown>): Question =>
  questionSchema.parse({ id: 'q', prompt: 'p', explanation: 'e', ...raw });

describe('grade: single', () => {
  const s = q({ type: 'single', options: ['a', 'b', 'c'], answer: 1 });
  it('accepts the right index only', () => {
    expect(grade(s, 1).correct).toBe(true);
    expect(grade(s, 0).correct).toBe(false);
    expect(grade(s, 2).correct).toBe(false);
  });
  it('rejects empty and wrongly typed responses', () => {
    expect(grade(s, null).correct).toBe(false);
    expect(grade(s, undefined).correct).toBe(false);
    expect(grade(s, '1').correct).toBe(false);
    expect(grade(s, [1]).correct).toBe(false);
  });
});

describe('grade: multi', () => {
  const m = q({ type: 'multi', options: ['a', 'b', 'c', 'd'], answers: [0, 2] });
  it('is all-or-nothing, in any order', () => {
    expect(grade(m, [0, 2])).toEqual({ correct: true, partial: 1 });
    expect(grade(m, [2, 0]).correct).toBe(true);
  });
  it('reports partial credit for incomplete answers', () => {
    expect(grade(m, [0])).toEqual({ correct: false, partial: 0.5 });
  });
  it('subtracts false positives and clamps at 0', () => {
    expect(grade(m, [0, 2, 1])).toEqual({ correct: false, partial: 0.5 });
    expect(grade(m, [1, 3])).toEqual({ correct: false, partial: 0 });
  });
  it('ignores duplicates and handles empty', () => {
    expect(grade(m, [0, 0, 2]).correct).toBe(true);
    expect(grade(m, []).correct).toBe(false);
    expect(grade(m, null).correct).toBe(false);
  });
});

describe('grade: truefalse', () => {
  const t = q({ type: 'truefalse', answer: false });
  it('requires the exact boolean', () => {
    expect(grade(t, false).correct).toBe(true);
    expect(grade(t, true).correct).toBe(false);
    expect(grade(t, null).correct).toBe(false);
    expect(grade(t, 0).correct).toBe(false);
  });
});

describe('grade: order', () => {
  const o = q({ type: 'order', items: ['a', 'b', 'c', 'd'] });
  it('requires the exact authored order', () => {
    expect(grade(o, [0, 1, 2, 3])).toEqual({ correct: true, partial: 1 });
    expect(grade(o, [1, 0, 2, 3])).toEqual({ correct: false, partial: 0.5 });
  });
  it('rejects malformed arrangements', () => {
    expect(grade(o, [0, 1, 2]).correct).toBe(false);
    expect(grade(o, [0, 0, 2, 3]).correct).toBe(false);
    expect(grade(o, [0, 1, 2, 4]).correct).toBe(false);
    expect(grade(o, null).correct).toBe(false);
  });
});

describe('grade: codeline', () => {
  const c = q({ type: 'codeline', code: 'a\nb\nc\nd', answerLines: [2, 4] });
  it('requires the exact set of lines', () => {
    expect(grade(c, [4, 2]).correct).toBe(true);
    expect(grade(c, [2]).correct).toBe(false);
    expect(grade(c, [2, 3, 4]).correct).toBe(false);
    expect(grade(c, [2]).partial).toBe(0.5);
  });
});

describe('grade: fill', () => {
  const f = q({ type: 'fill', answers: ['NetworkVariable', 'network var'] });
  it('trims, collapses whitespace and ignores case by default', () => {
    expect(grade(f, 'networkvariable').correct).toBe(true);
    expect(grade(f, '  NETWORK    var  ').correct).toBe(true);
    expect(grade(f, 'NetworkVar').correct).toBe(false);
  });
  it('rejects blanks', () => {
    expect(grade(f, '').correct).toBe(false);
    expect(grade(f, '   ').correct).toBe(false);
    expect(grade(f, null).correct).toBe(false);
  });
  it('respects caseSensitive', () => {
    const cs = q({ type: 'fill', answers: ['IsServer'], caseSensitive: true });
    expect(grade(cs, 'IsServer').correct).toBe(true);
    expect(grade(cs, ' IsServer ').correct).toBe(true);
    expect(grade(cs, 'isserver').correct).toBe(false);
  });
  it('normalizeText', () => {
    expect(normalizeText('  A \t b\nC ')).toBe('a b c');
    expect(normalizeText(' A  B ', true)).toBe('A B');
  });
});

describe('grade: numeric', () => {
  const n = q({ type: 'numeric', answer: 50, tolerance: 5, unit: 'ms' });
  it('accepts values within ±tolerance, inclusive', () => {
    expect(grade(n, '50').correct).toBe(true);
    expect(grade(n, '45').correct).toBe(true);
    expect(grade(n, '55').correct).toBe(true);
    expect(grade(n, 55).correct).toBe(true);
    expect(grade(n, '55.1').correct).toBe(false);
    expect(grade(n, '44').correct).toBe(false);
  });
  it('ignores a typed unit and rejects garbage', () => {
    expect(grade(n, '50 ms').correct).toBe(true);
    expect(grade(n, '50MS').correct).toBe(true);
    expect(grade(n, 'fifty').correct).toBe(false);
    expect(grade(n, '').correct).toBe(false);
    expect(grade(n, '5o').correct).toBe(false);
  });
  it('defaults to zero tolerance and survives float noise', () => {
    const exact = q({ type: 'numeric', answer: 0.3 });
    expect(grade(exact, 0.1 + 0.2).correct).toBe(true);
    expect(grade(exact, '0.31').correct).toBe(false);
  });
  it('parseNumber handles separators', () => {
    expect(parseNumber('1,500')).toBe(1500);
    expect(parseNumber('12,000,000')).toBe(12000000);
    expect(parseNumber('0,5')).toBe(0.5);
    expect(parseNumber('1 500')).toBe(1500);
    expect(parseNumber('-2.5e3')).toBe(-2500);
    expect(parseNumber('.5')).toBe(0.5);
    expect(parseNumber('1.2.3')).toBeNull();
    expect(parseNumber(Number.NaN)).toBeNull();
  });
});

describe('helpers', () => {
  it('isAnswered per type', () => {
    expect(isAnswered(q({ type: 'single', options: ['a', 'b'], answer: 0 }), 0)).toBe(true);
    expect(isAnswered(q({ type: 'single', options: ['a', 'b'], answer: 0 }), null)).toBe(false);
    expect(isAnswered(q({ type: 'multi', options: ['a', 'b', 'c'], answers: [0] }), [])).toBe(false);
    expect(isAnswered(q({ type: 'truefalse', answer: true }), false)).toBe(true);
    expect(isAnswered(q({ type: 'fill', answers: ['x'] }), '  ')).toBe(false);
    expect(isAnswered(q({ type: 'numeric', answer: 1 }), '1')).toBe(true);
  });

  it('initialResponse never starts an order question solved', () => {
    const o = q({ type: 'order', items: ['a', 'b', 'c'] });
    for (let seed = 0; seed < 200; seed++) {
      const r = initialResponse(o, seed) as number[];
      expect([...r].sort()).toEqual([0, 1, 2]);
      expect(grade(o, r).correct).toBe(false);
    }
  });

  it('optionOrder is a deterministic permutation, and grading uses original indices', () => {
    const s = q({ type: 'single', options: ['a', 'b', 'c', 'd'], answer: 2 });
    const order = optionOrder(s, 42);
    expect(order).toEqual(optionOrder(s, 42));
    expect([...order].sort()).toEqual([0, 1, 2, 3]);
    // The learner clicks whichever displayed slot shows option 2.
    const slot = order.indexOf(2);
    expect(grade(s, order[slot]).correct).toBe(true);
  });

  it('correctResponse grades as correct for every type', () => {
    const all = [
      q({ type: 'single', options: ['a', 'b'], answer: 1 }),
      q({ type: 'multi', options: ['a', 'b', 'c'], answers: [0, 2] }),
      q({ type: 'truefalse', answer: false }),
      q({ type: 'order', items: ['a', 'b', 'c'] }),
      q({ type: 'codeline', code: 'a\nb', answerLines: [2] }),
      q({ type: 'fill', answers: ['x'] }),
      q({ type: 'numeric', answer: 3.5, unit: 'KB' }),
    ];
    for (const item of all) {
      expect(grade(item, correctResponse(item)).correct).toBe(true);
      expect(describeAnswer(item).length).toBeGreaterThan(0);
    }
  });

  it('scorePct', () => {
    expect(scorePct(5, 6)).toBe(83);
    expect(scorePct(0, 0)).toBe(0);
  });

  it('the golden quiz is fully gradable with its own answers', () => {
    const raw = parse(readFileSync('src/content/quizzes/theory/packets-and-protocols.yaml', 'utf8'));
    const quiz = quizSchema.parse(raw);
    for (const item of quiz.questions) expect(grade(item, correctResponse(item)).correct).toBe(true);
  });
});
