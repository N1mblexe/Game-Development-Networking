/**
 * A one-way network link: packets go in with `send()` and come out with `deliver()`.
 *
 * Model, in the order a packet experiences it:
 *  1. Bandwidth: the sender's interface serialises one packet at a time at `bandwidthKbps`.
 *     Packets wait in a FIFO queue; when the queue holds more than `queueLimitBytes`, new
 *     packets are tail-dropped (this is where "bufferbloat" latency comes from).
 *  2. Loss on the path: independent (Bernoulli) or bursty (Gilbert–Elliott two-state model).
 *  3. Propagation delay `latencyMs` plus jitter, drawn from an exponential distribution with
 *     mean `jitterMs` (queueing delay is right-skewed: mostly small, occasionally large).
 *  4. Ordering: with `preserveOrder` the link behaves like a single FIFO path and a packet
 *     never overtakes an earlier one; otherwise jitter can reorder packets.
 *  5. Duplication: a packet is occasionally delivered twice, each copy with its own delay.
 *
 * Every send draws the same number of random values whatever the config, so changing one
 * slider (say loss) does not reshuffle the others (jitter) for the same seed.
 */
import { Random } from './rng';
import { SampleWindow } from './stats';

export interface LinkConfig {
  /** One-way propagation delay in ms. */
  latencyMs: number;
  /** Mean extra delay in ms (exponentially distributed). 0 = none. */
  jitterMs?: number;
  /** Average loss in percent, 0..100. */
  lossPct?: number;
  /**
   * Mean length of a loss burst in packets. 1 (default) = independent losses. Above 1 the
   * Gilbert–Elliott model is used, tuned so the long-run average loss still equals `lossPct`.
   */
  burstLength?: number;
  /** Serialisation rate. 0, undefined or Infinity = unlimited. */
  bandwidthKbps?: number;
  /** Sender queue capacity in bytes; packets beyond it are tail-dropped. Default: 500 ms of bandwidth. */
  queueLimitBytes?: number;
  /** Chance in percent that a packet is delivered twice. */
  duplicatePct?: number;
  /** Never let a packet overtake an earlier one (FIFO path). Default false. */
  preserveOrder?: boolean;
}

export type LossReason = 'random' | 'burst' | 'queue';

export interface Packet<T> {
  /** Unique per link, increasing in send order (duplicates share the id of their original). */
  id: number;
  payload: T;
  /** Bytes on the wire (used for bandwidth). */
  size: number;
  /** When the application handed the packet to the link. */
  sentAt: number;
  /** When the first bit left the sender (after waiting in the queue). */
  departAt: number;
  /** When the last bit left the sender. */
  serializedAt: number;
  /** When it reaches (or would have reached) the receiver. */
  arriveAt: number;
  lost: boolean;
  lossReason?: LossReason;
  /** This is the second copy of a duplicated packet. */
  duplicate: boolean;
  /** 0..1: where along the path a lost packet disappears (for drawing). */
  dropAt: number;
}

export interface LinkStats {
  sent: number;
  lost: number;
  /** Of `lost`, how many were tail-dropped by a full queue. */
  queueDropped: number;
  delivered: number;
  duplicated: number;
  /** Delivered packets that arrived after a packet sent later than them. */
  reordered: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  /** lost / sent, 0..1 */
  lossRate: number;
}

const unlimited = (kbps: number | undefined) => !kbps || !Number.isFinite(kbps) || kbps <= 0;

export class Link<T = unknown> {
  private cfg: Required<Omit<LinkConfig, 'queueLimitBytes'>> & { queueLimitBytes?: number };
  private rng: Random;
  private readonly flight: Packet<T>[] = [];
  private readonly out: Packet<T>[] = [];
  private nextId = 0;
  private busyUntil = 0;
  private lastArrive = 0;
  private maxDeliveredId = -1;
  /** Gilbert–Elliott state: true while in the "bad" (losing) state. */
  private bad = false;
  private readonly latency = new SampleWindow(512);
  private counters = { sent: 0, lost: 0, queueDropped: 0, delivered: 0, duplicated: 0, reordered: 0 };

  constructor(
    config: LinkConfig,
    private readonly seed = 1,
  ) {
    this.cfg = Link.normalize(config);
    this.rng = new Random(seed);
  }

  private static normalize(c: LinkConfig) {
    return {
      latencyMs: Math.max(0, c.latencyMs),
      jitterMs: Math.max(0, c.jitterMs ?? 0),
      lossPct: Math.min(100, Math.max(0, c.lossPct ?? 0)),
      burstLength: Math.max(1, c.burstLength ?? 1),
      bandwidthKbps: c.bandwidthKbps ?? 0,
      queueLimitBytes: c.queueLimitBytes,
      duplicatePct: Math.min(100, Math.max(0, c.duplicatePct ?? 0)),
      preserveOrder: c.preserveOrder ?? false,
    };
  }

  get config(): Readonly<LinkConfig> {
    return this.cfg;
  }

  /** Change parameters live (affects packets sent from now on). */
  configure(patch: Partial<LinkConfig>): void {
    this.cfg = Link.normalize({ ...this.cfg, ...patch });
  }

  /** Bytes still waiting to be serialised at time `now`. */
  queuedBytes(now: number): number {
    if (unlimited(this.cfg.bandwidthKbps)) return 0;
    return (Math.max(0, this.busyUntil - now) * this.cfg.bandwidthKbps) / 8;
  }

  /** How long a packet sent now would wait before its first bit leaves. */
  queueDelayMs(now: number): number {
    return unlimited(this.cfg.bandwidthKbps) ? 0 : Math.max(0, this.busyUntil - now);
  }

  get queueLimitBytes(): number {
    if (unlimited(this.cfg.bandwidthKbps)) return Infinity;
    return this.cfg.queueLimitBytes ?? Math.max(3000, this.cfg.bandwidthKbps * 62.5); // 500 ms
  }

  /** Is the Gilbert–Elliott model currently in its bursty "bad" state? */
  get inBurst(): boolean {
    return this.bad;
  }

  /** Hand a packet to the link. Returns the packet record, including whether it will be lost. */
  send(payload: T, now: number, size = 64): Packet<T> {
    const c = this.cfg;
    // Fixed number of draws per send keeps streams aligned across configs.
    const uLoss = this.rng.next();
    const uState = this.rng.next();
    const uJitter = this.rng.next();
    const uDup = this.rng.next();
    const uDupJitter = this.rng.next();
    const uDrop = this.rng.next();

    this.counters.sent++;
    const id = this.nextId++;

    // 1. Bandwidth queue
    let departAt = now;
    let serializedAt = now;
    let lost = false;
    let lossReason: LossReason | undefined;
    if (!unlimited(c.bandwidthKbps)) {
      if (this.queuedBytes(now) + size > this.queueLimitBytes) {
        lost = true;
        lossReason = 'queue';
      } else {
        departAt = Math.max(now, this.busyUntil);
        serializedAt = departAt + (size * 8) / c.bandwidthKbps; // bits / (kbit/s) = ms
        this.busyUntil = serializedAt;
      }
    }

    // 2. Path loss
    if (!lost) {
      const p = c.lossPct / 100;
      if (c.burstLength > 1 && p > 0 && p < 1) {
        // Gilbert–Elliott (simple Gilbert variant): every packet in the bad state is lost.
        // r = P(bad -> good) = 1 / burst; stationary P(bad) = p_gb / (p_gb + r) = p.
        const r = 1 / c.burstLength;
        const pgb = (p * r) / (1 - p);
        this.bad = this.bad ? !(uState < r) : uState < pgb;
        if (this.bad) {
          lost = true;
          lossReason = 'burst';
        }
      } else if (uLoss < p) {
        lost = true;
        lossReason = 'random';
      }
    }

    // 3. Delay
    const jitter = c.jitterMs > 0 ? -Math.log(1 - uJitter) * c.jitterMs : 0;
    let arriveAt = serializedAt + c.latencyMs + jitter;
    if (c.preserveOrder && !lost) arriveAt = Math.max(arriveAt, this.lastArrive);
    if (!lost) this.lastArrive = arriveAt;

    const pkt: Packet<T> = {
      id,
      payload,
      size,
      sentAt: now,
      departAt,
      serializedAt,
      arriveAt: lossReason === 'queue' ? now : arriveAt,
      lost,
      lossReason,
      duplicate: false,
      dropAt: lossReason === 'queue' ? 0 : 0.25 + 0.5 * uDrop,
    };
    if (lost) {
      this.counters.lost++;
      if (lossReason === 'queue') this.counters.queueDropped++;
    }
    this.flight.push(pkt);

    // 5. Duplication (a copy of a delivered packet, with its own jitter)
    if (!lost && uDup < c.duplicatePct / 100) {
      const j2 = c.jitterMs > 0 ? -Math.log(1 - uDupJitter) * c.jitterMs : 0;
      let a2 = serializedAt + c.latencyMs + j2;
      if (c.preserveOrder) a2 = this.lastArrive = Math.max(a2, this.lastArrive);
      this.flight.push({ ...pkt, arriveAt: a2, duplicate: true });
      this.counters.duplicated++;
    }
    return pkt;
  }

  /**
   * Packets that have arrived by `now` (sorted by arrival time). The returned array is reused
   * by the next call; copy it if you need to keep it.
   */
  deliver(now: number): readonly Packet<T>[] {
    const out = this.out;
    out.length = 0;
    let w = 0;
    for (let r = 0; r < this.flight.length; r++) {
      const p = this.flight[r]!;
      if (p.arriveAt <= now) {
        if (!p.lost) out.push(p);
      } else this.flight[w++] = p;
    }
    this.flight.length = w;
    if (out.length > 1) out.sort((a, b) => a.arriveAt - b.arriveAt);
    for (const p of out) {
      this.counters.delivered++;
      this.latency.push(p.arriveAt - p.sentAt);
      if (p.id < this.maxDeliveredId) this.counters.reordered++;
      else this.maxDeliveredId = p.id;
    }
    return out;
  }

  /** Packets still travelling (including lost ones until their would-be arrival, for drawing). */
  get inFlight(): readonly Packet<T>[] {
    return this.flight;
  }

  /** Latency samples of recently delivered packets, oldest first. */
  forEachLatency(fn: (ms: number) => void): void {
    this.latency.forEach(fn);
  }

  get stats(): LinkStats {
    const c = this.counters;
    return {
      ...c,
      avgLatencyMs: this.latency.mean,
      p95LatencyMs: this.latency.percentile(95),
      lossRate: c.sent ? c.lost / c.sent : 0,
    };
  }

  reset(seed = this.seed): void {
    this.rng = new Random(seed);
    this.flight.length = 0;
    this.out.length = 0;
    this.nextId = 0;
    this.busyUntil = 0;
    this.lastArrive = 0;
    this.maxDeliveredId = -1;
    this.bad = false;
    this.latency.clear();
    this.counters = { sent: 0, lost: 0, queueDropped: 0, delivered: 0, duplicated: 0, reordered: 0 };
  }
}
