/** Small numeric helpers shared by links and sims. */

/** Fixed-capacity sample window with mean and percentile, without per-sample allocation. */
export class SampleWindow {
  private readonly buf: Float64Array;
  private readonly scratch: Float64Array;
  private n = 0;
  private head = 0;
  private sum = 0;

  constructor(readonly capacity = 512) {
    this.buf = new Float64Array(capacity);
    this.scratch = new Float64Array(capacity);
  }

  push(v: number): void {
    if (this.n === this.capacity) this.sum -= this.buf[this.head]!;
    else this.n++;
    this.buf[this.head] = v;
    this.sum += v;
    this.head = (this.head + 1) % this.capacity;
  }

  get count(): number {
    return this.n;
  }

  get mean(): number {
    return this.n ? this.sum / this.n : 0;
  }

  /** p in 0..100, nearest-rank. Sorts a scratch copy (call it for display, not every step). */
  percentile(p: number): number {
    if (!this.n) return 0;
    const s = this.scratch.subarray(0, this.n);
    s.set(this.n === this.capacity ? this.buf : this.buf.subarray(0, this.n));
    s.sort();
    const rank = Math.min(this.n - 1, Math.max(0, Math.ceil((p / 100) * this.n) - 1));
    return s[rank]!;
  }

  /** Oldest-to-newest iteration. */
  forEach(fn: (v: number, i: number) => void): void {
    const start = this.n === this.capacity ? this.head : 0;
    for (let i = 0; i < this.n; i++) fn(this.buf[(start + i) % this.capacity]!, i);
  }

  clear(): void {
    this.n = 0;
    this.head = 0;
    this.sum = 0;
  }
}

export function percentile(values: readonly number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]!;
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
