/**
 * Seeded pseudo-random numbers. Every random decision in a simulation goes through a `Random`,
 * so the same seed always produces the same packet trace.
 */

/** mulberry32: a tiny, fast 32-bit PRNG with good statistical quality for simulations. */
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

/** Mixes a seed with a salt so independent streams (uplink, downlink, ...) don't correlate. */
export function deriveSeed(seed: number, salt: number | string): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  const s = typeof salt === 'number' ? String(salt) : salt;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x85ebca6b);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export class Random {
  private gen: () => number;
  readonly seed: number;

  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.gen = mulberry32(this.seed);
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.gen();
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.gen();
  }

  /** Integer in [min, maxExclusive). */
  int(min: number, maxExclusive: number): number {
    return Math.floor(this.range(min, maxExclusive));
  }

  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.gen() < p;
  }

  /** Exponential with the given mean: right-skewed like real queueing delay. */
  exponential(mean: number): number {
    return -Math.log(1 - this.gen()) * mean;
  }

  /** Independent child stream, e.g. `rng.fork('downlink')`. */
  fork(salt: number | string): Random {
    return new Random(deriveSeed(this.seed, salt));
  }
}
