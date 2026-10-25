/**
 * Snapshot delta compression against the last acknowledged state (the Quake 3 model).
 *
 * The server keeps the last few snapshots it sent to each client. Every packet from the client
 * acknowledges the newest snapshot tick it has received. The server encodes each new snapshot as
 * a delta against that acknowledged baseline: only entities and fields that differ are written.
 * Because the baseline is something the client provably has, a lost snapshot never breaks
 * decoding, it only makes later deltas bigger (their baseline is older). If the baseline has
 * fallen out of the server's history, the server sends a full snapshot instead.
 *
 * Wire format sizes, in bits (header bytes are counted separately by the caller):
 *  - full:  count + N × (id + Σ field bits)
 *  - delta: count + changed × (id + field mask + Σ changed field bits)
 */

export interface FieldDef {
  name: string;
  bits: number;
}

/** One value per field, in schema order. */
export type EntityState = readonly number[];

export interface WorldSnapshot {
  tick: number;
  entities: readonly EntityState[];
}

export interface EntityDelta {
  index: number;
  /** Changed fields only. */
  fields: { field: number; value: number }[];
}

export interface SnapshotDelta {
  tick: number;
  /** Tick this delta is relative to; null for a full snapshot. */
  baseTick: number | null;
  entities: EntityDelta[];
}

export const ENTITY_COUNT_BITS = 16;
export const ENTITY_ID_BITS = 16;

/** Encode `cur` against `base`. With no baseline every entity and field is written (a full snapshot). */
export function encodeDelta(cur: WorldSnapshot, base: WorldSnapshot | null): SnapshotDelta {
  const entities: EntityDelta[] = [];
  cur.entities.forEach((e, index) => {
    const b = base?.entities[index];
    const fields: EntityDelta['fields'] = [];
    e.forEach((value, field) => {
      if (!b || b[field] !== value) fields.push({ field, value });
    });
    if (fields.length) entities.push({ index, fields });
  });
  return { tick: cur.tick, baseTick: base ? base.tick : null, entities };
}

/** Rebuild the full state from a baseline and a delta (what the client does). */
export function applyDelta(base: WorldSnapshot | null, d: SnapshotDelta, entityCount: number, fieldCount: number): WorldSnapshot {
  if (d.baseTick !== null && (!base || base.tick !== d.baseTick)) throw new Error(`missing baseline ${d.baseTick}`);
  const entities: number[][] = [];
  for (let i = 0; i < entityCount; i++) entities.push(base ? [...base.entities[i]!] : new Array<number>(fieldCount).fill(0));
  for (const ed of d.entities) for (const f of ed.fields) entities[ed.index]![f.field] = f.value;
  return { tick: d.tick, entities };
}

export const entityBits = (schema: readonly FieldDef[]) => schema.reduce((s, f) => s + f.bits, 0);

/** Payload bits of a full snapshot of `entityCount` entities. */
export function fullSnapshotBits(entityCount: number, schema: readonly FieldDef[]): number {
  return ENTITY_COUNT_BITS + entityCount * (ENTITY_ID_BITS + entityBits(schema));
}

/** Payload bits of an encoded delta. A full snapshot (no baseline) skips the per-entity field mask. */
export function deltaBits(d: SnapshotDelta, schema: readonly FieldDef[]): number {
  let bits = ENTITY_COUNT_BITS;
  const mask = d.baseTick === null ? 0 : schema.length;
  for (const e of d.entities) {
    bits += ENTITY_ID_BITS + mask;
    for (const f of e.fields) bits += schema[f.field]!.bits;
  }
  return bits;
}

/**
 * Server side, per client: the snapshots sent recently and the newest one the client has
 * acknowledged. `capacity` is how far back a baseline may be (Quake 3 kept 32).
 */
export class BaselineHistory {
  private readonly sent = new Map<number, WorldSnapshot>();
  private acked = -1;

  constructor(readonly capacity = 32) {}

  record(s: WorldSnapshot): void {
    this.sent.set(s.tick, s);
    for (const t of this.sent.keys()) if (t <= s.tick - this.capacity) this.sent.delete(t);
  }

  /** Acks can arrive out of order or be lost; only a newer one moves the baseline forward. */
  ack(tick: number): void {
    if (tick > this.acked) this.acked = tick;
  }

  get ackedTick(): number {
    return this.acked;
  }

  /** The baseline to encode against, or null if none was acked or it is no longer in history. */
  baseline(): WorldSnapshot | null {
    return this.acked >= 0 ? (this.sent.get(this.acked) ?? null) : null;
  }

  clear(): void {
    this.sent.clear();
    this.acked = -1;
  }
}

/** Client side: decoded snapshots kept around so later deltas can reference them. */
export class SnapshotStore {
  private readonly byTick = new Map<number, WorldSnapshot>();
  newest = -1;

  constructor(readonly capacity = 64) {}

  /**
   * Decode and keep a received delta. Returns the decoded snapshot, or null when its baseline is
   * missing (which the ack-based scheme guarantees never happens).
   */
  receive(d: SnapshotDelta, entityCount: number, fieldCount: number): WorldSnapshot | null {
    const base = d.baseTick === null ? null : (this.byTick.get(d.baseTick) ?? null);
    if (d.baseTick !== null && !base) return null;
    const s = applyDelta(base, d, entityCount, fieldCount);
    this.byTick.set(s.tick, s);
    if (s.tick > this.newest) this.newest = s.tick;
    for (const t of this.byTick.keys()) if (t <= this.newest - this.capacity) this.byTick.delete(t);
    return s;
  }

  get(tick: number): WorldSnapshot | undefined {
    return this.byTick.get(tick);
  }
}
