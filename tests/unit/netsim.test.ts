import { describe, expect, it } from 'vitest';
import {
  FixedStepper,
  InputHistory,
  InterpolationBuffer,
  Link,
  Random,
  SampleWindow,
  SnapshotBuffer,
  Ticker,
  TcpChannel,
  simulateHolePunch,
  type TcpAck,
  type TcpSegment,
  Nat,
  lerp,
  type LinkConfig,
} from '../../src/lib/netsim';

/** Send `n` packets every `intervalMs`, deliver every 1 ms, and return the delivery trace. */
function run(cfg: LinkConfig, seed: number, n = 2000, intervalMs = 10, size = 100) {
  const link = new Link<number>(cfg, seed);
  const trace: Array<[number, number]> = [];
  const end = n * intervalMs + 5000;
  let next = 0;
  for (let t = 0; t <= end; t++) {
    while (next < n && next * intervalMs <= t) link.send(next++, t, size);
    for (const p of link.deliver(t)) trace.push([p.payload, Math.round(p.arriveAt * 1000) / 1000]);
  }
  return { link, trace };
}

describe('Random', () => {
  it('is deterministic per seed', () => {
    const a = new Random(42);
    const b = new Random(42);
    const c = new Random(43);
    const sa = Array.from({ length: 10 }, () => a.next());
    expect(Array.from({ length: 10 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 10 }, () => c.next())).not.toEqual(sa);
    expect(sa.every((v) => v >= 0 && v < 1)).toBe(true);
  });
  it('forks independent streams deterministically', () => {
    expect(new Random(1).fork('up').next()).toBe(new Random(1).fork('up').next());
    expect(new Random(1).fork('up').next()).not.toBe(new Random(1).fork('down').next());
  });
});

describe('Link determinism', () => {
  const cfg: LinkConfig = { latencyMs: 40, jitterMs: 15, lossPct: 5, duplicatePct: 2 };
  it('produces the same delivery trace for the same seed', () => {
    expect(run(cfg, 7).trace).toEqual(run(cfg, 7).trace);
  });
  it('produces a different trace for a different seed', () => {
    expect(run(cfg, 7).trace).not.toEqual(run(cfg, 8).trace);
  });
  it('keeps the jitter pattern when only the loss changes', () => {
    const a = new Link<number>({ latencyMs: 30, jitterMs: 10, lossPct: 0 }, 3);
    const b = new Link<number>({ latencyMs: 30, jitterMs: 10, lossPct: 50 }, 3);
    for (let i = 0; i < 200; i++) {
      const pa = a.send(i, i * 10);
      const pb = b.send(i, i * 10);
      if (!pb.lost) expect(pb.arriveAt).toBeCloseTo(pa.arriveAt, 9);
    }
  });
});

describe('Link loss', () => {
  it('drops close to the configured independent loss rate', () => {
    const { link } = run({ latencyMs: 20, lossPct: 10 }, 11, 20000, 1);
    expect(link.stats.lossRate).toBeGreaterThan(0.09);
    expect(link.stats.lossRate).toBeLessThan(0.11);
    expect(link.stats.delivered + link.stats.lost).toBe(link.stats.sent);
  });
  it('keeps the average for Gilbert–Elliott burst loss, with longer runs', () => {
    const link = new Link<number>({ latencyMs: 20, lossPct: 10, burstLength: 5 }, 5);
    let runs = 0;
    let lostTotal = 0;
    let prevLost = false;
    for (let i = 0; i < 40000; i++) {
      const lost = link.send(i, i).lost;
      if (lost) lostTotal++;
      if (lost && !prevLost) runs++;
      prevLost = lost;
    }
    const rate = lostTotal / 40000;
    expect(rate).toBeGreaterThan(0.085);
    expect(rate).toBeLessThan(0.115);
    const meanBurst = lostTotal / runs;
    expect(meanBurst).toBeGreaterThan(4);
    expect(meanBurst).toBeLessThan(6);
  });
  it('loses nothing at 0% and everything at 100%', () => {
    expect(run({ latencyMs: 5, lossPct: 0 }, 1, 500).link.stats.lost).toBe(0);
    expect(run({ latencyMs: 5, lossPct: 100 }, 1, 500).trace.length).toBe(0);
  });
});

describe('Link ordering and latency', () => {
  it('reorders with jitter when ordering is not preserved', () => {
    const { trace, link } = run({ latencyMs: 30, jitterMs: 25 }, 2, 2000, 5);
    const ids = trace.map(([id]) => id);
    expect(ids).not.toEqual([...ids].sort((a, b) => a - b));
    expect(link.stats.reordered).toBeGreaterThan(0);
  });
  it('never reorders when ordering is preserved', () => {
    const { trace, link } = run({ latencyMs: 30, jitterMs: 25, preserveOrder: true }, 2, 2000, 5);
    const ids = trace.map(([id]) => id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(link.stats.reordered).toBe(0);
  });
  it('delivers no earlier than the base latency and averages latency + jitter', () => {
    const { link } = run({ latencyMs: 50, jitterMs: 10 }, 9, 5000, 2);
    let min = Infinity;
    link.forEachLatency((ms) => (min = Math.min(min, ms)));
    expect(min).toBeGreaterThanOrEqual(50);
    expect(link.stats.avgLatencyMs).toBeGreaterThan(57);
    expect(link.stats.avgLatencyMs).toBeLessThan(63);
    expect(link.stats.p95LatencyMs).toBeGreaterThan(link.stats.avgLatencyMs);
  });
  it('duplicates roughly the configured share', () => {
    const { link } = run({ latencyMs: 10, duplicatePct: 10 }, 4, 10000, 1);
    expect(link.stats.duplicated / link.stats.sent).toBeGreaterThan(0.08);
    expect(link.stats.duplicated / link.stats.sent).toBeLessThan(0.12);
    expect(link.stats.delivered).toBe(link.stats.sent + link.stats.duplicated);
  });
});

describe('Link bandwidth', () => {
  it('serialises packets at the configured rate', () => {
    // 1000 bytes at 80 kbps = 100 ms on the wire each.
    const link = new Link<number>({ latencyMs: 0, bandwidthKbps: 80 }, 1);
    const a = link.send(0, 0, 1000);
    const b = link.send(1, 0, 1000);
    const c = link.send(2, 0, 1000);
    expect(a.arriveAt).toBeCloseTo(100);
    expect(b.arriveAt).toBeCloseTo(200);
    expect(c.arriveAt).toBeCloseTo(300);
    expect(link.queuedBytes(0)).toBeCloseTo(3000);
    expect(link.queueDelayMs(150)).toBeCloseTo(150);
  });
  it('builds a queue when offered load exceeds capacity, then tail-drops', () => {
    // 200 B every 10 ms = 160 kbps offered into an 80 kbps link with a 4 kB queue.
    const link = new Link<number>({ latencyMs: 10, bandwidthKbps: 80, queueLimitBytes: 4000 }, 1);
    for (let i = 0; i < 500; i++) link.send(i, i * 10, 200);
    const s = link.stats;
    expect(s.queueDropped).toBeGreaterThan(200);
    expect(s.queueDropped).toBeLessThan(300);
    expect(link.queuedBytes(5000)).toBeLessThanOrEqual(4000);
  });
  it('adds no queueing below capacity', () => {
    const link = new Link<number>({ latencyMs: 10, bandwidthKbps: 1000 }, 1);
    for (let i = 0; i < 100; i++) {
      const p = link.send(i, i * 10, 200);
      expect(p.departAt).toBe(p.sentAt);
    }
  });
});

describe('FixedStepper and Ticker', () => {
  it('runs fixed steps scaled by speed and carries the remainder', () => {
    const s = new FixedStepper(5);
    let steps = 0;
    s.advance(12, () => steps++);
    expect(steps).toBe(2);
    s.advance(3, () => steps++);
    expect(steps).toBe(3);
    s.speed = 0.5;
    s.advance(10, () => steps++);
    expect(steps).toBe(4);
    expect(s.now).toBe(20);
  });
  it('fires ticks at exact multiples of the interval', () => {
    const t = new Ticker(60);
    const times: number[] = [];
    for (let now = 0; now <= 1000; now += 4) t.update(now, (_i, time) => times.push(time));
    expect(times.length).toBe(61);
    expect(times[60]).toBeCloseTo(1000);
  });
});

describe('buffers', () => {
  it('SnapshotBuffer keeps time order and interpolates', () => {
    const b = new SnapshotBuffer<number>();
    b.add(100, 10);
    b.add(300, 30);
    b.add(200, 20);
    expect(b.all.map((e) => e.time)).toEqual([100, 200, 300]);
    expect(b.sample(250, lerp)).toBeCloseTo(25);
    expect(b.sample(0, lerp)).toBe(10);
    b.pruneBefore(250);
    expect(b.all.map((e) => e.time)).toEqual([200, 300]);
  });
  it('InterpolationBuffer reports interpolating, holding and extrapolating', () => {
    const ib = new InterpolationBuffer<number>(100, lerp, (a, b, t) => b.state + ((b.state - a.state) / (b.time - a.time)) * (t - b.time), 50);
    ib.add(0, 0);
    ib.add(50, 5);
    expect(ib.sample(125).status).toBe('interpolating');
    expect(ib.sample(125).state).toBeCloseTo(2.5);
    expect(ib.sample(180).status).toBe('extrapolating');
    expect(ib.sample(180).state).toBeCloseTo(8);
    expect(ib.sample(400).status).toBe('holding');
  });
  it('InputHistory drops acknowledged inputs', () => {
    const h = new InputHistory<string>();
    h.push('a');
    h.push('b');
    h.push('c');
    h.ack(2);
    expect(h.pending.map((e) => e.seq)).toEqual([3]);
    expect(h.lastSeq).toBe(3);
  });
  it('SampleWindow computes mean and p95 over a sliding window', () => {
    const w = new SampleWindow(100);
    for (let i = 1; i <= 200; i++) w.push(i);
    expect(w.count).toBe(100);
    expect(w.mean).toBeCloseTo(150.5);
    expect(w.percentile(95)).toBe(195);
  });
});

describe('TcpChannel', () => {
  function runTcp(lossPct: number, seed = 3) {
    const data = new Link<TcpSegment<number>>({ latencyMs: 50, lossPct }, seed);
    const acks = new Link<TcpAck>({ latencyMs: 50, lossPct }, seed + 100);
    const tcp = new TcpChannel<number>(data, acks);
    const got: Array<[number, number]> = [];
    for (let t = 0; t <= 20000; t++) {
      if (t % 50 === 0 && t < 10000) tcp.send(t, t);
      for (const v of tcp.update(t)) got.push([v, t]);
    }
    return { tcp, got };
  }
  it('delivers everything exactly once and in order, even with loss', () => {
    const { got, tcp } = runTcp(10);
    expect(got.map(([v]) => v)).toEqual(Array.from({ length: 200 }, (_, i) => i * 50));
    expect(tcp.stats.retransmits).toBeGreaterThan(0);
  });
  it('adds no delay without loss', () => {
    const { got } = runTcp(0);
    expect(got.every(([v, t]) => t - v === 50)).toBe(true);
  });
  it('head-of-line blocking: one loss delays later segments that already arrived', () => {
    const { got } = runTcp(5);
    const delays = got.map(([v, t]) => t - v);
    // Some segments are released together, long after their own one-way latency.
    expect(Math.max(...delays)).toBeGreaterThanOrEqual(150);
    const late = got.filter(([v, t], i) => i > 0 && t === got[i - 1]![1] && t - v > 50);
    expect(late.length).toBeGreaterThan(0);
  });
});

describe('NAT model', () => {
  it('cone NATs reuse the public port; symmetric NATs do not', () => {
    const cone = new Nat('port-restricted', '1.1.1.1', 1000);
    const sym = new Nat('symmetric', '2.2.2.2', 2000);
    const me = { ip: '10.0.0.1', port: 5 };
    expect(cone.outbound(me, { ip: '9.9.9.9', port: 1 })).toEqual(cone.outbound(me, { ip: '8.8.8.8', port: 2 }));
    expect(sym.outbound(me, { ip: '9.9.9.9', port: 1 })).not.toEqual(sym.outbound(me, { ip: '8.8.8.8', port: 2 }));
  });
  it('filters unsolicited inbound traffic', () => {
    const nat = new Nat('port-restricted', '1.1.1.1', 1000);
    const pub = nat.outbound({ ip: '10.0.0.1', port: 5 }, { ip: '9.9.9.9', port: 1 });
    expect(nat.inbound({ ip: '9.9.9.9', port: 1 }, pub.port).to).not.toBeNull();
    expect(nat.inbound({ ip: '9.9.9.9', port: 2 }, pub.port).to).toBeNull();
    expect(nat.inbound({ ip: '7.7.7.7', port: 1 }, pub.port).to).toBeNull();
  });
  it('hole punching succeeds between cone NATs and falls back to a relay with symmetric NAT', () => {
    const outcome = (a: Parameters<typeof simulateHolePunch>[0], b: Parameters<typeof simulateHolePunch>[1]) =>
      simulateHolePunch(a, b).at(-1)!.outcome;
    expect(outcome('port-restricted', 'port-restricted')).toBe('direct');
    expect(outcome('full-cone', 'symmetric')).toBe('direct');
    expect(outcome('restricted-cone', 'symmetric')).toBe('direct');
    expect(outcome('port-restricted', 'symmetric')).toBe('relay');
    expect(outcome('symmetric', 'symmetric')).toBe('relay');
  });
  it('the outcome does not depend on which peer punches first', () => {
    const types = ['full-cone', 'restricted-cone', 'port-restricted', 'symmetric'] as const;
    for (const a of types)
      for (const b of types) expect(simulateHolePunch(a, b).at(-1)!.outcome, `${a} vs ${b}`).toBe(simulateHolePunch(b, a).at(-1)!.outcome);
    expect(simulateHolePunch('symmetric', 'restricted-cone').at(-1)!.outcome).toBe('direct');
  });
});
