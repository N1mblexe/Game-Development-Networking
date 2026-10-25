/**
 * Deterministic randomness for quizzes and exams. The same seed always gives the same
 * shuffle, so server and client render identical markup and draws can be reproduced in tests.
 */
import type { Question } from '../content/schemas';

/** mulberry32: tiny, fast 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → uint32, for turning ids into seeds. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mix a base seed with a string (e.g. a question id) into a new seed. */
export function deriveSeed(seed: number, salt: string): number {
  return (hashString(salt) ^ Math.imul(seed >>> 0, 0x9e3779b1)) >>> 0;
}

/** A fresh, non-deterministic seed (client-side only: never call during render). */
export function randomSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
}

/** Fisher–Yates shuffle into a new array. Does not mutate `arr`. */
export function shuffle<T>(arr: readonly T[], seed: number): T[] {
  const out = arr.slice();
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** [0, 1, …, n-1] */
export const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/**
 * Draw `count` questions from `pool`, deterministically for a given seed.
 *
 * Balancing (when the pool allows it):
 *  1. difficulty: each level gets a share proportional to its share of the pool;
 *  2. tags: among equally good candidates, prefer ones whose tags are least represented so far
 *     (tags usually name the lesson, so draws spread across the module).
 * Ties fall back to a seeded shuffle, and the final selection is shuffled again.
 */
export function drawExam<Q extends Pick<Question, 'id' | 'difficulty' | 'tags'>>(
  pool: readonly Q[],
  count: number,
  seed: number,
): Q[] {
  const n = Math.max(0, Math.min(count, pool.length));
  const candidates = shuffle(pool, seed);
  if (n === pool.length) return shuffle(candidates, deriveSeed(seed, 'order'));

  const diffOf = (q: Q) => q.difficulty ?? 2;
  const poolByDiff = new Map<number, number>();
  for (const q of pool) poolByDiff.set(diffOf(q), (poolByDiff.get(diffOf(q)) ?? 0) + 1);
  const target = (d: number) => (n * (poolByDiff.get(d) ?? 0)) / pool.length;

  const chosenByDiff = new Map<number, number>();
  const tagCount = new Map<string, number>();
  const picked: Q[] = [];
  const remaining = candidates.slice();

  while (picked.length < n) {
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const q = remaining[i];
      const d = diffOf(q);
      // How far below its fair share this difficulty is (positive = under-represented).
      const deficit = target(d) - (chosenByDiff.get(d) ?? 0);
      const tags = q.tags ?? [];
      const tagLoad = tags.length ? Math.min(...tags.map((t) => tagCount.get(t) ?? 0)) : 0;
      // Difficulty dominates; tag novelty breaks near-ties. Earlier (shuffled) candidates win exact ties.
      const score = deficit * 10 - tagLoad;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    const [q] = remaining.splice(best, 1);
    picked.push(q);
    chosenByDiff.set(diffOf(q), (chosenByDiff.get(diffOf(q)) ?? 0) + 1);
    for (const t of q.tags ?? []) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  }
  return shuffle(picked, deriveSeed(seed, 'order'));
}
