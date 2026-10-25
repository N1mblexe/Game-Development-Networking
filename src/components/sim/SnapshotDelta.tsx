import { useEffect, useRef, useState } from 'react';
import {
  BaselineHistory,
  Link,
  Random,
  SnapshotStore,
  Ticker,
  deltaBits,
  deriveSeed,
  encodeDelta,
  fullSnapshotBits,
  type FieldDef,
  type SnapshotDelta as Delta,
  type WorldSnapshot,
} from '../../lib/netsim';
import type { SimBaseProps } from './types';
import { useSim } from './ui/useSim';
import { ControlBar, ControlGrid, Legend, Segmented, SimCanvas, SimLayout, Slider, StatGrid, fmtKbps, type Stat } from './ui/controls';
import { alpha, circle, cross, fillRound, line, text } from './ui/draw';
import type { Palette } from './ui/theme';

export type SnapshotMode = 'full' | 'delta';

export interface SnapshotDeltaProps extends SimBaseProps {
  mode?: SnapshotMode;
  entities?: number;
  /** Average share of entities moving at any moment, 0..100. */
  movingPct?: number;
  /** Packet loss in both directions, percent. */
  lossPct?: number;
  rttMs?: number;
  sendRateHz?: number;
}

/** What one entity looks like on the wire (uncompressed floats, to keep the comparison simple). */
const SCHEMA: FieldDef[] = [
  { name: 'pos.x', bits: 32 },
  { name: 'pos.y', bits: 32 },
  { name: 'pos.z', bits: 32 },
  { name: 'yaw', bits: 16 },
  { name: 'health', bits: 8 },
  { name: 'anim', bits: 8 },
];
/** IPv4 + UDP (28) + game header: tick, baseline tick, ack (8). */
const HEADER_BYTES = 28 + 8;
const HISTORY = 32;
const AW = 20;
const AH = 10;
const MOVE_MEAN_S = 0.8;
const MAX_BARS = 120;

interface Ent {
  x: number;
  y: number;
  vx: number;
  vy: number;
  moving: boolean;
  until: number;
  yaw: number;
  hp: number;
}

interface Bar {
  tick: number;
  sent: number;
  full: number;
  delta: number;
  /** Ticks between this snapshot and its baseline; null = no baseline (full). */
  baseAge: number | null;
  lost: boolean;
  fallback: boolean;
  mode: SnapshotMode;
  changed: number;
}

class Model {
  rng: Random;
  ents: Ent[] = [];
  ticker: Ticker;
  ackTicker: Ticker;
  tick = 0;
  down: Link<Delta>;
  up: Link<number>;
  history = new BaselineHistory(HISTORY);
  store = new SnapshotStore(HISTORY * 2);
  bars: Bar[] = [];
  /** Entities written in the most recent delta (for drawing). */
  inDelta = new Set<number>();
  lost = 0;
  sentCount = 0;
  fallbacks = 0;
  undecodable = 0;
  received = 0;

  constructor(
    public mode: SnapshotMode,
    readonly n: number,
    public movingPct: number,
    lossPct: number,
    rttMs: number,
    readonly rateHz: number,
    seed: number,
  ) {
    this.rng = new Random(deriveSeed(seed, 'world'));
    const cfg = { latencyMs: rttMs / 2, jitterMs: 3, lossPct, burstLength: 2 };
    this.down = new Link<Delta>(cfg, deriveSeed(seed, 'down'));
    this.up = new Link<number>(cfg, deriveSeed(seed, 'up'));
    this.ticker = new Ticker(rateHz);
    this.ackTicker = new Ticker(rateHz, 1000 / rateHz / 2);
    for (let i = 0; i < n; i++) {
      const e: Ent = { x: this.rng.range(1, AW - 1), y: this.rng.range(1, AH - 1), vx: 0, vy: 0, moving: false, until: 0, yaw: 0, hp: 100 };
      e.until = this.rng.range(0, 2000);
      this.ents.push(e);
    }
  }

  configure(lossPct: number, rttMs: number, movingPct: number) {
    this.down.configure({ lossPct, latencyMs: rttMs / 2 });
    this.up.configure({ lossPct, latencyMs: rttMs / 2 });
    this.movingPct = movingPct;
  }

  private simulate(now: number, dt: number) {
    const p = this.movingPct / 100;
    for (const e of this.ents) {
      const u1 = this.rng.next();
      const u2 = this.rng.next();
      const u3 = this.rng.next();
      const u4 = this.rng.next();
      if (now >= e.until) {
        // Alternate moving and idle; mean idle time chosen so `p` of entities move on average.
        const startMoving = p >= 1 ? true : p <= 0 ? false : !e.moving;
        e.moving = startMoving;
        if (e.moving) {
          const a = u1 * Math.PI * 2;
          const sp = 2 + u2 * 3;
          e.vx = Math.cos(a) * sp;
          e.vy = Math.sin(a) * sp;
          e.yaw = Math.round(((a / (Math.PI * 2)) * 65535) % 65536);
          e.until = now + Math.max(150, -Math.log(1 - u3) * MOVE_MEAN_S * 1000);
        } else {
          const idleMean = p <= 0 ? 1e9 : (MOVE_MEAN_S * (1 - p)) / p;
          e.until = now + Math.max(150, -Math.log(1 - u3) * idleMean * 1000);
        }
      }
      if (e.moving) {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        let bounced = false;
        if (e.x < 0.5 || e.x > AW - 0.5) {
          e.vx = -e.vx;
          e.x = Math.min(AW - 0.5, Math.max(0.5, e.x));
          bounced = true;
        }
        if (e.y < 0.5 || e.y > AH - 0.5) {
          e.vy = -e.vy;
          e.y = Math.min(AH - 0.5, Math.max(0.5, e.y));
          bounced = true;
        }
        if (bounced) e.yaw = Math.round(((Math.atan2(e.vy, e.vx) / (Math.PI * 2) + 1) % 1) * 65535);
      }
      // Occasional damage or healing, independent of movement.
      if (u4 < 0.004) e.hp = Math.max(1, Math.min(100, e.hp + (u4 < 0.002 ? -17 : 9)));
    }
  }

  private snapshot(): WorldSnapshot {
    return {
      tick: this.tick,
      // Positions are sent as floats: quantize to float32 so equality checks mean "same bits".
      entities: this.ents.map((e) => [Math.fround(e.x), Math.fround(e.y), 0, e.yaw, e.hp, e.moving ? 1 : 0]),
    };
  }

  step(now: number) {
    this.ticker.update(now, (_i, t) => {
      this.tick++;
      this.simulate(t, 1 / this.rateHz);
      const snap = this.snapshot();
      const base = this.history.baseline();
      const delta = encodeDelta(snap, base);
      const fullBytes = HEADER_BYTES + Math.ceil(fullSnapshotBits(this.n, SCHEMA) / 8);
      const deltaBytes = HEADER_BYTES + Math.ceil(deltaBits(delta, SCHEMA) / 8);
      const useDelta = this.mode === 'delta' && base !== null;
      const msg = useDelta ? delta : encodeDelta(snap, null);
      const size = useDelta ? deltaBytes : fullBytes;
      const pkt = this.down.send(msg, t, size);
      this.history.record(snap);
      this.sentCount++;
      if (pkt.lost) this.lost++;
      const fallback = this.mode === 'delta' && !base;
      if (fallback && this.history.ackedTick >= 0) this.fallbacks++; // not the initial ones before any ack
      this.inDelta = new Set(delta.entities.map((e) => e.index));
      this.bars.push({
        tick: this.tick,
        sent: size,
        full: fullBytes,
        delta: base ? deltaBytes : fullBytes,
        baseAge: base ? this.tick - base.tick : null,
        lost: pkt.lost,
        fallback,
        mode: this.mode,
        changed: base ? delta.entities.length : this.n,
      });
      if (this.bars.length > MAX_BARS) this.bars.shift();
    });

    // Client: decode against its own copy of the baseline, then ack the newest tick it has.
    for (const pk of this.down.deliver(now)) {
      const got = this.store.receive(pk.payload, this.n, SCHEMA.length);
      if (got) this.received++;
      else this.undecodable++;
    }
    this.ackTicker.update(now, (_i, t) => {
      if (this.store.newest >= 0) this.up.send(this.store.newest, t, HEADER_BYTES + 4);
    });
    for (const pk of this.up.deliver(now)) this.history.ack(pk.payload);
  }

  /** Bytes per second sent over the last second of bars. */
  recentBytesPerTick(): number {
    const k = Math.min(this.bars.length, Math.round(this.rateHz));
    if (!k) return 0;
    let s = 0;
    for (let i = this.bars.length - k; i < this.bars.length; i++) s += this.bars[i]!.sent;
    return s / k;
  }
}

const RATES = [10, 20, 30, 60] as const;

export default function SnapshotDelta(props: SnapshotDeltaProps) {
  const { seed = 1, compact } = props;
  const [mode, setMode] = useState<SnapshotMode>(props.mode ?? 'delta');
  const [n, setN] = useState(props.entities ?? 32);
  const [moving, setMoving] = useState(props.movingPct ?? 25);
  const [loss, setLoss] = useState(props.lossPct ?? 5);
  const [rtt, setRtt] = useState(props.rttMs ?? 100);
  const [rate, setRate] = useState(props.sendRateHz ?? 20);
  const model = useRef<Model>(null as unknown as Model);
  if (!model.current) model.current = new Model(mode, n, moving, loss, rtt, rate, seed);
  const [stats, setStats] = useState<Stat[]>([]);

  const sim = useSim({
    dt: 1,
    stepMs: 1000 / rate,
    step: (now) => model.current.step(now),
    draw: (ctx, w, h, p) => draw(ctx, w, h, p, model.current),
    height: (w) => (w >= 640 ? 250 : 360),
    onStats: () => {
      const m = model.current;
      const last = m.bars[m.bars.length - 1];
      const bpt = m.recentBytesPerTick();
      const full = last?.full ?? HEADER_BYTES + Math.ceil(fullSnapshotBits(m.n, SCHEMA) / 8);
      const saved = full ? 1 - bpt / full : 0;
      setStats([
        { label: 'Bytes / snapshot', value: last ? `${Math.round(bpt)} B` : '–' },
        { label: 'Downstream', value: last ? fmtKbps((bpt * 8 * m.rateHz) / 1000) : '–' },
        { label: 'Saved vs full', value: last ? `${Math.round(saved * 100)}%` : '–', tone: saved > 0.3 ? 'ok' : undefined },
        {
          label: 'Baseline age',
          value: last ? (last.baseAge === null ? 'none (full)' : `${last.baseAge} ticks`) : '–',
          tone: last?.baseAge === null ? 'warn' : undefined,
        },
        { label: 'Snapshots lost', value: `${m.lost} / ${m.sentCount}`, tone: m.lost ? 'warn' : undefined, secondary: true },
        { label: 'Full fallbacks', value: String(m.fallbacks), tone: m.fallbacks ? 'warn' : undefined, secondary: true },
      ]);
    },
  });

  useEffect(() => {
    model.current.configure(loss, rtt, moving);
    sim.redraw();
  }, [loss, rtt, moving, sim]);
  useEffect(() => {
    model.current.mode = mode;
    sim.redraw();
  }, [mode, sim]);

  const rebuild = (nn = n, rr = rate) => {
    model.current = new Model(mode, nn, moving, loss, rtt, rr, seed);
    sim.restart();
  };

  return (
    <SimLayout>
      <SimCanvas
        sim={sim}
        label="Left: the server's world, with moving entities highlighted and the entities written into the latest delta ringed. Right: bytes sent per snapshot over time, with the cost of the other encoding as an outline, lost snapshots crossed out, and the age of the baseline each delta was encoded against."
      />
      <ControlBar sim={sim} onReset={() => rebuild()} compact={compact} stepLabel="Tick" />
      <Segmented
        label="Server sends"
        value={mode}
        options={[
          { value: 'full', label: 'Full snapshots' },
          { value: 'delta', label: 'Delta vs last ack' },
        ]}
        onChange={setMode}
      />
      <ControlGrid>
        <Slider label="Entities" value={n} min={8} max={128} step={8} onChange={(v) => (setN(v), rebuild(v))} />
        <Slider label="Moving at any time" value={moving} min={0} max={100} step={5} format={(v) => `${v}%`} onChange={setMoving} />
        <Slider
          label="Packet loss (both ways)"
          value={loss}
          min={0}
          max={40}
          step={1}
          format={(v) => `${v}%`}
          onChange={setLoss}
          hint={compact ? undefined : 'Lost snapshots and lost acks both make the next baseline older.'}
        />
        {!compact && (
          <>
            <Slider label="Round-trip time" value={rtt} min={20} max={400} step={10} unit="ms" onChange={setRtt} />
            <Slider label="Snapshot rate" value={rate} values={RATES} unit="Hz" onChange={(v) => (setRate(v), rebuild(n, v))} />
          </>
        )}
      </ControlGrid>
      <Legend
        items={[
          { label: 'moving entity', color: 'var(--accent)' },
          { label: 'idle entity', color: 'var(--muted)' },
          { label: 'written in this delta', color: 'var(--warn)', shape: 'ring' },
          { label: 'bytes sent', color: 'var(--accent)', shape: 'square' },
          { label: 'the other encoding', color: 'color-mix(in srgb, var(--muted) 30%, transparent)', shape: 'square' },
          { label: 'full snapshot (fallback)', color: 'var(--warn)', shape: 'square' },
          { label: 'lost', color: 'var(--danger)', shape: 'dash' },
        ]}
      />
      {!compact && (
        <p className="text-xs text-muted">
          Each entity is {SCHEMA.map((f) => `${f.name} (${f.bits})`).join(', ')} bits plus a 16-bit id; a delta also carries a {SCHEMA.length}-bit field mask per changed
          entity. Every packet has {HEADER_BYTES} bytes of headers (28 IPv4/UDP + 8 game header). The server keeps {HISTORY} snapshots; a baseline older than that forces a full
          snapshot.
        </p>
      )}
      <StatGrid stats={stats} compact={compact} playing={sim.playing} />
    </SimLayout>
  );
}

// ------------------------------------------------------------------ drawing

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, m: Model) {
  const wide = w >= 640;
  const pad = 10;
  const arena = wide
    ? { x: pad, y: 26, w: Math.min(360, w * 0.34), h: 0 }
    : { x: pad, y: 24, w: w - 2 * pad, h: 0 };
  arena.h = Math.min(arena.w * (AH / AW), wide ? h - 40 : 130);
  arena.w = arena.h * (AW / AH);
  if (!wide) arena.x = (w - arena.w) / 2;
  const movingNow = m.ents.filter((e) => e.moving).length;
  text(ctx, p, `World: ${m.n} entities, ${movingNow} moving`, arena.x, arena.y - 12, { size: 11, weight: 700, color: p.text });
  fillRound(ctx, arena.x, arena.y, arena.w, arena.h, 8, p.surface2, p.border);
  const s = arena.w / AW;
  const r = Math.max(2.5, Math.min(5, s * 0.32));
  m.ents.forEach((e, i) => {
    const x = arena.x + e.x * s;
    const y = arena.y + e.y * s;
    if (m.inDelta.has(i) && m.mode === 'delta') circle(ctx, x, y, r + 3, undefined, p.warn, 1.5);
    circle(ctx, x, y, r, e.moving ? p.accent : alpha(p.muted, 0.6));
  });

  // Chart area
  const cx0 = wide ? arena.x + arena.w + 48 : pad + 34;
  const cx1 = w - pad;
  const cy0 = wide ? 26 : arena.y + arena.h + 34;
  const ageH = 26;
  const cy1 = h - 18 - ageH - 18;
  const last = m.bars[m.bars.length - 1];
  const full = last?.full ?? HEADER_BYTES + Math.ceil(fullSnapshotBits(m.n, SCHEMA) / 8);
  const maxB = niceMax(full * 1.15);
  const Y = (b: number) => cy1 - (b / maxB) * (cy1 - cy0);
  text(ctx, p, 'Bytes per snapshot', wide ? cx0 : pad, cy0 - 14, { size: 11, weight: 700, color: p.text });
  if (last)
    text(ctx, p, last.baseAge === null ? `tick ${last.tick}: full` : `tick ${last.tick} vs base ${last.tick - last.baseAge}`, cx1, cy0 - 14, {
      align: 'right',
      size: 10,
      color: p.muted,
      mono: true,
    });
  for (let k = 0; k <= 2; k++) {
    const v = (maxB * k) / 2;
    line(ctx, cx0, Y(v), cx1, Y(v), alpha(p.border, k ? 0.8 : 1));
    text(ctx, p, k === 0 ? '0' : `${Math.round(v)}${k === 2 ? ' B' : ''}`, cx0 - 4, Y(v), { align: 'right', size: 9, mono: true, color: p.muted });
  }
  line(ctx, cx0, Y(full), cx1, Y(full), alpha(p.muted, 0.8), 1, [4, 3]);
  text(ctx, p, `full = ${full} B`, cx0 + 4, Y(full) - 7, { size: 9.5, color: p.muted, weight: 600, bg: alpha(p.surface, 0.85), pad: 2 });

  const slots = Math.max(10, Math.min(MAX_BARS, Math.floor((cx1 - cx0) / 7)));
  const slotW = (cx1 - cx0) / slots;
  const bars = m.bars.slice(-slots);
  const xOf = (i: number) => cx1 - (bars.length - i) * slotW;
  const bw = Math.max(2, slotW - 2);
  // Baseline age strip
  const ay1 = h - 18;
  const ay0 = ay1 - ageH;
  text(ctx, p, wide ? 'baseline age' : 'age', cx0 - 4, ay0 + ageH / 2, { align: 'right', size: 9, color: p.muted });
  text(ctx, p, 'baseline age in ticks (how far back the delta reaches)', cx0, ay0 - 7, { size: 8.5, color: p.muted });
  line(ctx, cx0, ay1, cx1, ay1, p.border);
  const ageMax = 12;
  bars.forEach((b, i) => {
    const x = xOf(i) + 1;
    const alt = b.mode === 'delta' ? b.full : b.delta;
    // The other encoding, as an outline, for comparison.
    ctx.fillStyle = alpha(p.muted, 0.16);
    ctx.fillRect(x, Y(alt), bw, cy1 - Y(alt));
    const col = b.fallback ? p.warn : b.mode === 'full' ? p.violet : p.accent;
    fillRound(ctx, x, Y(b.sent), bw, cy1 - Y(b.sent), 1.5, b.lost ? alpha(col, 0.25) : col);
    if (b.lost) cross(ctx, x + bw / 2, Y(b.sent) - 6, Math.min(3.5, bw / 2 + 1), p.danger, 1.5);
    if (b.baseAge !== null) {
      const ah = (Math.min(ageMax, b.baseAge) / ageMax) * ageH;
      fillRound(ctx, x, ay1 - ah, bw, ah, 1, b.baseAge > ageMax / 2 ? p.warn : alpha(p.muted, 0.7));
    } else if (b.mode === 'delta') {
      fillRound(ctx, x, ay0, bw, ageH, 1, alpha(p.warn, 0.35));
    }
  });
  text(ctx, p, `last ${bars.length} snapshots →`, cx1, ay1 + 10, { align: 'right', size: 9, color: p.muted });
  if (!bars.length) text(ctx, p, 'press play…', (cx0 + cx1) / 2, (cy0 + cy1) / 2, { align: 'center', size: 11, color: p.muted });
}

function niceMax(v: number): number {
  const mags = [1, 2, 2.5, 5, 10];
  const e = Math.pow(10, Math.floor(Math.log10(Math.max(1, v))));
  for (const m of mags) if (m * e >= v) return m * e;
  return 10 * e;
}
