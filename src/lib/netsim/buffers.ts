/**
 * The buffers every netcode stack ends up writing: a time-indexed snapshot history (server-side
 * rewind, client-side interpolation) and an input history (client-side reconciliation).
 */

export interface Timed<S> {
  /** Simulation time the state belongs to (ms), or the tick it was produced at. */
  time: number;
  state: S;
}

/** Fixed-capacity ring buffer; the oldest entry is overwritten when full. */
export class RingBuffer<T> {
  private readonly items: (T | undefined)[];
  private head = 0;
  private n = 0;

  constructor(readonly capacity: number) {
    this.items = new Array<T | undefined>(capacity);
  }

  push(v: T): void {
    this.items[(this.head + this.n) % this.capacity] = v;
    if (this.n < this.capacity) this.n++;
    else this.head = (this.head + 1) % this.capacity;
  }

  get length(): number {
    return this.n;
  }

  /** i = 0 is the oldest entry. */
  get(i: number): T | undefined {
    if (i < 0 || i >= this.n) return undefined;
    return this.items[(this.head + i) % this.capacity];
  }

  get latest(): T | undefined {
    return this.get(this.n - 1);
  }

  /** Drop entries from the oldest end while `pred` holds. */
  dropWhile(pred: (v: T) => boolean): void {
    while (this.n > 0 && pred(this.items[this.head]!)) {
      this.items[this.head] = undefined;
      this.head = (this.head + 1) % this.capacity;
      this.n--;
    }
  }

  forEach(fn: (v: T, i: number) => void): void {
    for (let i = 0; i < this.n; i++) fn(this.items[(this.head + i) % this.capacity]!, i);
  }

  clear(): void {
    this.items.fill(undefined);
    this.head = 0;
    this.n = 0;
  }
}

export type Lerp<S> = (a: S, b: S, t: number) => S;

export interface Bracket<S> {
  from: Timed<S>;
  to: Timed<S>;
  /** 0..1 between `from` and `to`. */
  alpha: number;
}

/**
 * Time-ordered history of states. Entries are inserted in time order even when they arrive out of
 * order, which is what a client receiving snapshots over UDP needs.
 */
export class SnapshotBuffer<S> {
  private readonly entries: Timed<S>[] = [];

  constructor(readonly capacity = 64) {}

  /** Insert keeping time order; a duplicate time replaces nothing and is ignored. */
  add(time: number, state: S): boolean {
    const e = this.entries;
    let i = e.length;
    while (i > 0 && e[i - 1]!.time > time) i--;
    if (i > 0 && e[i - 1]!.time === time) return false;
    e.splice(i, 0, { time, state });
    if (e.length > this.capacity) e.shift();
    return true;
  }

  get length(): number {
    return this.entries.length;
  }

  get all(): readonly Timed<S>[] {
    return this.entries;
  }

  get latest(): Timed<S> | undefined {
    return this.entries[this.entries.length - 1];
  }

  get oldest(): Timed<S> | undefined {
    return this.entries[0];
  }

  /** The two entries around `time`, or null when `time` is outside the buffered range. */
  bracket(time: number): Bracket<S> | null {
    const e = this.entries;
    for (let i = e.length - 1; i > 0; i--) {
      const a = e[i - 1]!;
      const b = e[i]!;
      if (a.time <= time && time <= b.time) {
        const span = b.time - a.time;
        return { from: a, to: b, alpha: span > 0 ? (time - a.time) / span : 1 };
      }
    }
    return null;
  }

  /** State at `time` by interpolation; clamps to the ends when outside the buffered range. */
  sample(time: number, lerp: Lerp<S>): S | undefined {
    const e = this.entries;
    if (!e.length) return undefined;
    if (time <= e[0]!.time) return e[0]!.state;
    if (time >= e[e.length - 1]!.time) return e[e.length - 1]!.state;
    const b = this.bracket(time)!;
    return lerp(b.from.state, b.to.state, b.alpha);
  }

  /** Remove entries older than `time`, but keep the newest one at or before it (needed to bracket). */
  pruneBefore(time: number): void {
    const e = this.entries;
    let k = 0;
    while (k + 1 < e.length && e[k + 1]!.time <= time) k++;
    if (k > 0) e.splice(0, k);
  }

  clear(): void {
    this.entries.length = 0;
  }
}

export type InterpolationStatus = 'empty' | 'waiting' | 'interpolating' | 'extrapolating' | 'holding';

export interface InterpolationSample<S> {
  state: S | undefined;
  status: InterpolationStatus;
  /** Render time that was sampled (now - delay). */
  renderTime: number;
  bracket: Bracket<S> | null;
}

/**
 * Client-side entity interpolation: render remote entities `delayMs` in the past so there are
 * (usually) two snapshots to blend between. When the buffer runs dry, it either holds the last
 * state or extrapolates for at most `maxExtrapolateMs`.
 */
export class InterpolationBuffer<S> {
  readonly buffer: SnapshotBuffer<S>;

  constructor(
    public delayMs: number,
    private readonly lerp: Lerp<S>,
    private readonly extrapolate?: (from: Timed<S>, to: Timed<S>, time: number) => S,
    public maxExtrapolateMs = 0,
    capacity = 64,
  ) {
    this.buffer = new SnapshotBuffer<S>(capacity);
  }

  add(time: number, state: S): boolean {
    return this.buffer.add(time, state);
  }

  sample(now: number): InterpolationSample<S> {
    const renderTime = now - this.delayMs;
    const all = this.buffer.all;
    if (!all.length) return { state: undefined, status: 'empty', renderTime, bracket: null };
    const first = all[0]!;
    const last = all[all.length - 1]!;
    if (renderTime < first.time) return { state: first.state, status: 'waiting', renderTime, bracket: null };
    const b = this.buffer.bracket(renderTime);
    if (b) return { state: this.lerp(b.from.state, b.to.state, b.alpha), status: 'interpolating', renderTime, bracket: b };
    // renderTime is past the newest snapshot: the buffer ran dry.
    if (this.extrapolate && all.length >= 2 && renderTime - last.time <= this.maxExtrapolateMs) {
      const prev = all[all.length - 2]!;
      return { state: this.extrapolate(prev, last, renderTime), status: 'extrapolating', renderTime, bracket: null };
    }
    return { state: last.state, status: 'holding', renderTime, bracket: null };
  }

  /** Forget snapshots that can no longer be needed. */
  prune(now: number): void {
    this.buffer.pruneBefore(now - this.delayMs);
  }

  clear(): void {
    this.buffer.clear();
  }
}

export interface InputEntry<I> {
  seq: number;
  input: I;
}

/**
 * Client-side input history for reconciliation: every input the client predicted with is kept
 * until the server acknowledges it, so it can be replayed on top of a corrected server state.
 */
export class InputHistory<I> {
  private readonly entries: InputEntry<I>[] = [];
  private nextSeq = 1;

  /** Record a new input; returns its sequence number. */
  push(input: I): number {
    const seq = this.nextSeq++;
    this.entries.push({ seq, input });
    if (this.entries.length > 1024) this.entries.shift();
    return seq;
  }

  /** The server has processed everything up to and including `seq`. */
  ack(seq: number): void {
    let k = 0;
    while (k < this.entries.length && this.entries[k]!.seq <= seq) k++;
    if (k) this.entries.splice(0, k);
  }

  /** Inputs not yet acknowledged, oldest first. */
  get pending(): readonly InputEntry<I>[] {
    return this.entries;
  }

  /** The most recent `n` pending inputs (for redundant sending). */
  last(n: number): readonly InputEntry<I>[] {
    return this.entries.slice(Math.max(0, this.entries.length - n));
  }

  get lastSeq(): number {
    return this.nextSeq - 1;
  }

  clear(): void {
    this.entries.length = 0;
    this.nextSeq = 1;
  }
}
