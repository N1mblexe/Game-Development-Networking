/**
 * Virtual time. Simulations never read the wall clock: they advance a `FixedStepper` by
 * fixed `dt` steps, so a run is reproducible regardless of frame rate, speed or pauses.
 */

export const SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const;

export class FixedStepper {
  /** Virtual time in ms. */
  now = 0;
  /** Playback speed multiplier (0.25 .. 2). */
  speed = 1;
  private acc = 0;

  /**
   * @param dt fixed step in virtual ms
   * @param maxStepsPerAdvance cap so a long frame (tab switch, breakpoint) can't freeze the page
   */
  constructor(
    readonly dt: number,
    private readonly maxStepsPerAdvance = 240,
  ) {}

  /** Feed real elapsed ms; runs as many fixed steps as fit. Returns the number of steps run. */
  advance(realMs: number, step: (now: number, dt: number) => void): number {
    this.acc += Math.max(0, realMs) * this.speed;
    let n = 0;
    while (this.acc >= this.dt && n < this.maxStepsPerAdvance) {
      this.acc -= this.dt;
      this.now += this.dt;
      step(this.now, this.dt);
      n++;
    }
    if (n === this.maxStepsPerAdvance) this.acc = 0;
    return n;
  }

  /** Advance exactly `ms` of virtual time (rounded to whole steps), ignoring speed. */
  stepBy(ms: number, step: (now: number, dt: number) => void): void {
    const n = Math.max(1, Math.round(ms / this.dt));
    for (let i = 0; i < n; i++) {
      this.now += this.dt;
      step(this.now, this.dt);
    }
  }

  reset(): void {
    this.now = 0;
    this.acc = 0;
  }
}

/**
 * Fires at a fixed rate on the virtual clock. Tick times are computed from the tick index
 * (tick * 1000 / rate), so they never drift even when the rate does not divide the step size.
 */
export class Ticker {
  tick = 0;
  private intervalMs: number;

  constructor(
    rateHz: number,
    private offsetMs = 0,
  ) {
    this.intervalMs = 1000 / rateHz;
  }

  get rateHz(): number {
    return 1000 / this.intervalMs;
  }

  get interval(): number {
    return this.intervalMs;
  }

  /** Time of the next tick that has not fired yet. */
  get nextAt(): number {
    return this.offsetMs + this.tick * this.intervalMs;
  }

  /** Change the rate, continuing from `now` without firing a burst of catch-up ticks. */
  setRate(rateHz: number, now: number): void {
    this.intervalMs = 1000 / rateHz;
    this.offsetMs = now;
    this.tick = 0;
  }

  /** Calls `onTick(index, time)` for every tick due at or before `now`. */
  update(now: number, onTick: (tick: number, time: number) => void): void {
    while (this.nextAt <= now + 1e-9) {
      const t = this.nextAt;
      const i = this.tick++;
      onTick(i, t);
    }
  }

  reset(offsetMs = 0): void {
    this.tick = 0;
    this.offsetMs = offsetMs;
  }
}
