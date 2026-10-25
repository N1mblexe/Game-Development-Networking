import { describe, expect, it } from 'vitest';
import {
  BaselineHistory,
  Random,
  SnapshotStore,
  applyDelta,
  deltaBits,
  encodeDelta,
  estimateBandwidth,
  fullSnapshotBits,
  type BandwidthInput,
  type FieldDef,
  type WorldSnapshot,
} from '../../src/lib/netsim';

const SCHEMA: FieldDef[] = [
  { name: 'x', bits: 32 },
  { name: 'y', bits: 32 },
  { name: 'hp', bits: 8 },
];

/** A world where entity i moves on every tick for which (tick + i) % 4 === 0. */
function world(tick: number, n = 10): WorldSnapshot {
  const entities = [];
  for (let i = 0; i < n; i++) {
    const moves = Math.floor((tick + i) / 4);
    entities.push([moves, i, 100]);
  }
  return { tick, entities };
}

describe('snapshot delta compression', () => {
  it('round-trips: baseline + delta reproduces the current snapshot exactly', () => {
    const base = world(3);
    const cur = world(9);
    const d = encodeDelta(cur, base);
    expect(applyDelta(base, d, 10, 3)).toEqual(cur);
  });

  it('a delta against an identical baseline carries no entities', () => {
    const s = world(5);
    const d = encodeDelta({ ...s, tick: 6 }, s);
    expect(d.entities).toHaveLength(0);
    expect(deltaBits(d, SCHEMA)).toBe(16);
  });

  it('only changed fields are written, and older baselines cost more', () => {
    const cur = world(20);
    const recent = encodeDelta(cur, world(19));
    const old = encodeDelta(cur, world(12));
    expect(recent.entities.every((e) => e.fields.length === 1 && e.fields[0]!.field === 0)).toBe(true);
    expect(deltaBits(old, SCHEMA)).toBeGreaterThan(deltaBits(recent, SCHEMA));
    // full = count + N × (id + Σ fields)
    expect(fullSnapshotBits(10, SCHEMA)).toBe(16 + 10 * (16 + 72));
    expect(deltaBits(encodeDelta(cur, null), SCHEMA)).toBe(fullSnapshotBits(10, SCHEMA));
  });

  it('refuses to decode against the wrong baseline', () => {
    const d = encodeDelta(world(9), world(3));
    expect(() => applyDelta(world(4), d, 10, 3)).toThrow();
  });

  it('BaselineHistory uses the newest ack and falls back to full when it is too old', () => {
    const h = new BaselineHistory(8);
    expect(h.baseline()).toBeNull();
    for (let t = 0; t < 5; t++) h.record(world(t));
    h.ack(3);
    h.ack(1); // late, older ack: ignored
    expect(h.baseline()?.tick).toBe(3);
    for (let t = 5; t < 20; t++) h.record(world(t));
    expect(h.baseline()).toBeNull();
  });

  it('survives random loss in both directions: every received delta decodes', () => {
    const rng = new Random(42);
    const server = new BaselineHistory(32);
    const client = new SnapshotStore(64);
    let decoded = 0;
    for (let t = 0; t < 500; t++) {
      const snap = world(t);
      const d = encodeDelta(snap, server.baseline());
      server.record(snap);
      if (rng.chance(0.2)) continue; // snapshot lost
      const got = client.receive(d, 10, 3);
      expect(got).toEqual(snap);
      decoded++;
      if (!rng.chance(0.2)) server.ack(client.newest); // ack lost 20% of the time
    }
    expect(decoded).toBeGreaterThan(350);
  });
});

describe('bandwidth estimate', () => {
  const base: BandwidthInput = {
    players: 10,
    entities: 20,
    fields: [
      { name: 'position', count: 3, rawBits: 32, quantBits: 16 },
      { name: 'yaw', count: 1, rawBits: 32, quantBits: 8 },
    ],
    sendRateHz: 20,
    inputRateHz: 30,
    inputBytes: 12,
    ipHeaderBytes: 28,
    transportHeaderBytes: 8,
    quantize: false,
    delta: false,
    changedPct: 25,
  };

  it('matches a hand calculation', () => {
    const r = estimateBandwidth(base);
    // entity = 4 × 32 = 128 bits; payload = 16 + 20 × (16 + 128) = 2896 bits = 362 bytes
    expect(r.entityBits).toBe(128);
    expect(r.payloadBytes).toBe(362);
    expect(r.packetsPerSnapshot).toBe(1);
    expect(r.wireBytesPerSnapshot).toBe(362 + 36);
    expect(r.downKbps).toBeCloseTo((398 * 8 * 20) / 1000);
    expect(r.upKbps).toBeCloseTo(((12 + 36) * 8 * 30) / 1000);
    expect(r.serverEgressKbps).toBeCloseTo(r.downKbps * 10);
    const b = r.breakdown;
    expect(b.ipUdp + b.transport + b.ids + b.state).toBeCloseTo(r.downKbps);
  });

  it('quantization and delta compression both shrink the payload', () => {
    const raw = estimateBandwidth(base).payloadBytes;
    const q = estimateBandwidth({ ...base, quantize: true }).payloadBytes;
    const qd = estimateBandwidth({ ...base, quantize: true, delta: true }).payloadBytes;
    expect(q).toBe(Math.ceil((16 + 20 * (16 + 56)) / 8));
    expect(qd).toBe(Math.ceil((16 + 5 * (16 + 56)) / 8));
    expect(raw).toBeGreaterThan(q);
    expect(q).toBeGreaterThan(qd);
  });

  it('splits snapshots larger than the MTU budget into several packets, each with headers', () => {
    const r = estimateBandwidth({ ...base, entities: 200 });
    expect(r.payloadBytes).toBe(Math.ceil((16 + 200 * 144) / 8));
    expect(r.packetsPerSnapshot).toBe(Math.ceil(r.payloadBytes / (1200 - 8)));
    expect(r.headerBytesPerSnapshot).toBe(r.packetsPerSnapshot * 36);
  });
});
