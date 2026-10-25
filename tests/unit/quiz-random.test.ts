import { describe, expect, it } from 'vitest';
import { deriveSeed, drawExam, hashString, mulberry32, range, shuffle } from '../../src/lib/quiz/random';
import { parseInline } from '../../src/lib/quiz/inline';

describe('mulberry32', () => {
  it('is deterministic and in [0, 1)', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it('differs between seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('shuffle', () => {
  const arr = range(20);
  it('is a deterministic permutation that does not mutate its input', () => {
    const copy = arr.slice();
    const a = shuffle(arr, 7);
    expect(a).toEqual(shuffle(arr, 7));
    expect(arr).toEqual(copy);
    expect([...a].sort((x, y) => x - y)).toEqual(arr);
    expect(a).not.toEqual(arr);
  });
  it('changes with the seed', () => {
    expect(shuffle(arr, 1)).not.toEqual(shuffle(arr, 2));
  });
  it('handles empty and single arrays', () => {
    expect(shuffle([], 1)).toEqual([]);
    expect(shuffle(['x'], 1)).toEqual(['x']);
  });
  it('is roughly uniform', () => {
    const firsts = new Map<number, number>();
    for (let s = 0; s < 4000; s++) {
      const f = shuffle([0, 1, 2, 3], s)[0];
      firsts.set(f, (firsts.get(f) ?? 0) + 1);
    }
    for (const v of firsts.values()) expect(v).toBeGreaterThan(800);
  });
});

describe('seeds', () => {
  it('hashString and deriveSeed are stable uint32', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
    expect(deriveSeed(1, 'x')).toBe(deriveSeed(1, 'x'));
    expect(deriveSeed(1, 'x')).not.toBe(deriveSeed(2, 'x'));
    expect(deriveSeed(1, 'x')).toBeGreaterThanOrEqual(0);
  });
});

describe('drawExam', () => {
  // 30 questions: 10 per difficulty, tags cycling over 5 lessons.
  const pool = range(30).map((i) => ({
    id: `q${i}`,
    difficulty: ((i % 3) + 1) as 1 | 2 | 3,
    tags: [`lesson-${i % 5}`],
  }));

  it('is deterministic per seed and draws unique questions', () => {
    const a = drawExam(pool, 15, 99);
    expect(a.map((q) => q.id)).toEqual(drawExam(pool, 15, 99).map((q) => q.id));
    expect(new Set(a.map((q) => q.id)).size).toBe(15);
    expect(drawExam(pool, 15, 100).map((q) => q.id)).not.toEqual(a.map((q) => q.id));
  });

  it('balances difficulty in proportion to the pool', () => {
    for (let seed = 0; seed < 50; seed++) {
      const d = drawExam(pool, 15, seed).map((q) => q.difficulty);
      for (const level of [1, 2, 3]) expect(d.filter((x) => x === level).length).toBe(5);
    }
  });

  it('spreads across tags', () => {
    for (let seed = 0; seed < 50; seed++) {
      const tags = drawExam(pool, 15, seed).map((q) => q.tags[0]);
      for (let l = 0; l < 5; l++) expect(tags.filter((t) => t === `lesson-${l}`).length).toBe(3);
    }
  });

  it('follows a skewed pool proportionally', () => {
    const skewed = range(20).map((i) => ({ id: `s${i}`, difficulty: (i < 15 ? 1 : 3) as 1 | 3, tags: [] }));
    const d = drawExam(skewed, 8, 5).map((q) => q.difficulty);
    expect(d.filter((x) => x === 1).length).toBe(6);
    expect(d.filter((x) => x === 3).length).toBe(2);
  });

  it('clamps count to the pool and handles missing metadata', () => {
    const bare = range(4).map((i) => ({ id: `b${i}` })) as { id: string; difficulty: 2; tags: string[] }[];
    expect(drawExam(bare, 10, 1)).toHaveLength(4);
    expect(drawExam(bare, 2, 1)).toHaveLength(2);
    expect(drawExam(bare, 0, 1)).toHaveLength(0);
  });
});

describe('parseInline', () => {
  it('parses code, bold and italic', () => {
    expect(parseInline('Use `Rpc` and **always** check *why*.')).toEqual([
      { kind: 'text', text: 'Use ' },
      { kind: 'code', text: 'Rpc' },
      { kind: 'text', text: ' and ' },
      { kind: 'bold', children: [{ kind: 'text', text: 'always' }] },
      { kind: 'text', text: ' check ' },
      { kind: 'italic', children: [{ kind: 'text', text: 'why' }] },
      { kind: 'text', text: '.' },
    ]);
  });
  it('keeps markup inside code literal and nests code in bold', () => {
    expect(parseInline('`**x**`')).toEqual([{ kind: 'code', text: '**x**' }]);
    expect(parseInline('**the `port`**')).toEqual([
      { kind: 'bold', children: [{ kind: 'text', text: 'the ' }, { kind: 'code', text: 'port' }] },
    ]);
  });
  it('leaves unclosed or spaced markers as text', () => {
    expect(parseInline('a ` b')).toEqual([{ kind: 'text', text: 'a ` b' }]);
    expect(parseInline('2 * 3 * 4')).toEqual([{ kind: 'text', text: '2 * 3 * 4' }]);
    expect(parseInline('**open')).toEqual([{ kind: 'text', text: '**open' }]);
  });
  it('never produces HTML', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([
      { kind: 'text', text: '<img src=x onerror=alert(1)>' },
    ]);
  });
});
