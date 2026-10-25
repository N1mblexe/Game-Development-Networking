import { useEffect, useRef, useState } from 'react';
import { InterpolationBuffer, Link, Ticker, deriveSeed, dist, lerpV, type InterpolationStatus, type Timed, type Vec2 } from '../../lib/netsim';
import type { SimBaseProps } from './types';
import { useSim } from './ui/useSim';
import { ControlBar, ControlGrid, Legend, Segmented, SimCanvas, SimLayout, Slider, StatGrid, Toggle, fmtMs, type Stat } from './ui/controls';
import { alpha, circle, fillRound, line, text } from './ui/draw';
import type { Palette } from './ui/theme';

export type InterpMode = 'raw' | 'interpolate' | 'extrapolate';

export interface InterpolationProps extends SimBaseProps {
  mode?: InterpMode;
  renderDelayMs?: number;
  sendRateHz?: number;
  latencyMs?: number;
  jitterMs?: number;
  lossPct?: number;
  /** Also draw the other two methods, faintly. */
  compareAll?: boolean;
}

const W = 16;
const H = 9;
const SPEED = 5;
/** Remote player's route: sharp corners make extrapolation overshoot. */
const PATH: Vec2[] = [
  { x: 2, y: 2 },
  { x: 14, y: 2 },
  { x: 14, y: 7 },
  { x: 8, y: 3.8 },
  { x: 2, y: 7 },
];
const SEG = PATH.map((a, i) => dist(a, PATH[(i + 1) % PATH.length]!));
const LOOP = SEG.reduce((s, d) => s + d, 0);
const MAX_EXTRAPOLATE_MS = 250;

function truthAt(t: number): { pos: Vec2; vel: Vec2 } {
  let d = ((t / 1000) * SPEED) % LOOP;
  for (let i = 0; i < PATH.length; i++) {
    if (d <= SEG[i]!) {
      const a = PATH[i]!;
      const b = PATH[(i + 1) % PATH.length]!;
      const f = d / SEG[i]!;
      return { pos: lerpV(a, b, f), vel: { x: ((b.x - a.x) / SEG[i]!) * SPEED, y: ((b.y - a.y) / SEG[i]!) * SPEED } };
    }
    d -= SEG[i]!;
  }
  return { pos: PATH[0]!, vel: { x: 0, y: 0 } };
}

interface Snap {
  seq: number;
  pos: Vec2;
  vel: Vec2;
}

const dead = (from: Timed<Snap>, time: number): Snap => {
  const dt = Math.min(MAX_EXTRAPOLATE_MS, time - from.time) / 1000;
  return { seq: from.state.seq, pos: { x: from.state.pos.x + from.state.vel.x * dt, y: from.state.pos.y + from.state.vel.y * dt }, vel: from.state.vel };
};

class Model {
  link: Link<Timed<Snap>>;
  ticker: Ticker;
  interp: InterpolationBuffer<Snap>;
  latest: Timed<Snap> | null = null;
  received: { t: number; seq: number; pos: Vec2; at: number }[] = [];
  sent: { t: number; seq: number; lost: boolean }[] = [];
  status: InterpolationStatus = 'empty';
  underruns = 0;
  underrunMs = 0;
  errSum = 0;
  errN = 0;
  private seq = 0;

  constructor(
    public cfg: Required<Omit<InterpolationProps, keyof SimBaseProps | 'compareAll'>>,
    seed: number,
  ) {
    this.link = new Link({ latencyMs: cfg.latencyMs, jitterMs: cfg.jitterMs, lossPct: cfg.lossPct }, deriveSeed(seed, 'snap'));
    this.ticker = new Ticker(cfg.sendRateHz);
    // The client's clock estimate of server time runs one-way latency behind; it renders a further
    // `renderDelayMs` behind that so (usually) two snapshots surround the render time.
    this.interp = new InterpolationBuffer<Snap>(cfg.latencyMs + cfg.renderDelayMs, (a, b, t) => ({ seq: a.seq, pos: lerpV(a.pos, b.pos, t), vel: a.vel }), (_a, b, t) => dead(b, t), 0);
  }

  configure(cfg: Model['cfg'], now: number) {
    this.cfg = cfg;
    this.link.configure({ latencyMs: cfg.latencyMs, jitterMs: cfg.jitterMs, lossPct: cfg.lossPct });
    this.interp.delayMs = cfg.latencyMs + cfg.renderDelayMs;
    if (Math.abs(this.ticker.rateHz - cfg.sendRateHz) > 1e-6) this.ticker.setRate(cfg.sendRateHz, now);
  }

  step(now: number) {
    this.ticker.update(now, (_i, t) => {
      const tr = truthAt(t);
      const snap = { time: t, state: { seq: this.seq++, pos: tr.pos, vel: tr.vel } };
      const pk = this.link.send(snap, t, 40);
      this.sent.push({ t, seq: snap.state.seq, lost: pk.lost });
      if (this.sent.length > 80) this.sent.shift();
    });
    for (const pk of this.link.deliver(now)) {
      const s = pk.payload;
      this.interp.add(s.time, s.state);
      if (!this.latest || s.time > this.latest.time) this.latest = s;
      this.received.push({ t: s.time, seq: s.state.seq, pos: s.state.pos, at: now });
      if (this.received.length > 80) this.received.shift();
    }
    // Keep a little history for the timeline, but bound the buffer.
    this.interp.buffer.pruneBefore(now - this.interp.delayMs - 1500);

    const st = this.interp.sample(now).status;
    if (this.cfg.mode === 'interpolate' && this.latest) {
      if ((st === 'holding' || st === 'extrapolating') && this.status === 'interpolating') this.underruns++;
      if (st === 'holding' || st === 'extrapolating') this.underrunMs++;
    }
    this.status = st;
    const shown = this.render(now, this.cfg.mode);
    if (shown && now > 1000) {
      this.errSum += dist(shown, truthAt(now).pos);
      this.errN++;
    }
  }

  render(now: number, mode: InterpMode): Vec2 | null {
    if (!this.latest) return null;
    if (mode === 'raw') return this.latest.state.pos;
    if (mode === 'extrapolate') return dead(this.latest, now).pos;
    return this.interp.sample(now).state?.pos ?? null;
  }
}

const MODES = [
  { value: 'raw' as const, label: 'Raw' },
  { value: 'interpolate' as const, label: 'Interpolate' },
  { value: 'extrapolate' as const, label: 'Extrapolate' },
];

export default function Interpolation(props: InterpolationProps) {
  const { seed = 1, compact } = props;
  const initial = {
    mode: props.mode ?? 'interpolate',
    renderDelayMs: props.renderDelayMs ?? 100,
    sendRateHz: props.sendRateHz ?? 20,
    latencyMs: props.latencyMs ?? 50,
    jitterMs: props.jitterMs ?? 3,
    lossPct: props.lossPct ?? 0,
  } satisfies Model['cfg'];
  const [cfg, setCfg] = useState<Model['cfg']>(initial);
  const [compareAll, setCompareAll] = useState(props.compareAll ?? false);
  const model = useRef<Model>(null as unknown as Model);
  if (!model.current) model.current = new Model(initial, seed);
  const compareRef = useRef(compareAll);
  compareRef.current = compareAll;
  const [stats, setStats] = useState<Stat[]>([]);

  const sim = useSim({
    dt: 1,
    stepMs: 1000 / cfg.sendRateHz,
    step: (now) => model.current.step(now),
    draw: (ctx, w, h, p, now) => draw(ctx, w, h, p, now, model.current, compareRef.current),
    height: (w) => Math.round(Math.min(480, (w - 24) * (H / W)) + 96),
    onStats: (now) => {
      const m = model.current;
      const c = m.cfg;
      const depth = m.interp.buffer.all.filter((e) => e.time > now - m.interp.delayMs).length;
      const lag = c.mode === 'interpolate' ? c.latencyMs + c.renderDelayMs : c.mode === 'raw' ? c.latencyMs + 500 / c.sendRateHz : 0;
      setStats([
        { label: 'Snapshots/s', value: String(c.sendRateHz) },
        { label: 'Shown behind by', value: c.mode === 'extrapolate' ? 'guessing ahead' : `~${fmtMs(lag)}` },
        { label: 'Avg error vs truth', value: m.errN ? `${(m.errSum / m.errN).toFixed(2)} m` : '–' },
        {
          label: 'Buffer depth',
          value: c.mode === 'interpolate' ? `${depth} snap${depth === 1 ? '' : 's'}` : 'n/a',
          tone: c.mode === 'interpolate' && depth < 1 ? 'danger' : undefined,
          secondary: true,
        },
        {
          label: 'Buffer underruns',
          value: c.mode === 'interpolate' ? String(m.underruns) : 'n/a',
          tone: c.mode === 'interpolate' && m.underruns ? 'danger' : undefined,
        },
        { label: 'Lost snapshots', value: String(m.link.stats.lost), secondary: true },
      ]);
    },
  });

  useEffect(() => {
    model.current.configure(cfg, sim.now());
    sim.redraw();
  }, [cfg, sim]);
  useEffect(() => sim.redraw(), [compareAll, sim]);

  const set = <K extends keyof Model['cfg']>(k: K) => (v: Model['cfg'][K]) => setCfg((c) => ({ ...c, [k]: v }));
  const reset = () => {
    model.current = new Model(cfg, seed);
    sim.restart();
  };
  const interval = 1000 / cfg.sendRateHz;

  return (
    <SimLayout>
      <SimCanvas
        sim={sim}
        label="A remote player runs a route with sharp corners. Dots mark snapshot positions as they arrive. The solid marker is how your client renders the player with the chosen method; a faint ring shows where the player truly is right now. A timeline at the bottom shows the snapshot buffer and the render time."
      />
      <ControlBar sim={sim} onReset={reset} compact={compact} />
      <Segmented label="Rendering method" value={cfg.mode} options={MODES} onChange={set('mode')} />
      <ControlGrid>
        <Slider
          label="Render delay (interpolation buffer)"
          value={cfg.renderDelayMs}
          min={0}
          max={300}
          step={5}
          unit="ms"
          hint={compact ? undefined : `Rule of thumb: ≥ 2 snapshot intervals (${Math.round(2 * interval)} ms) + jitter.`}
          onChange={set('renderDelayMs')}
        />
        <Slider label="Jitter" value={cfg.jitterMs} min={0} max={80} step={1} unit="ms" onChange={set('jitterMs')} />
        <Slider label="Snapshot rate" value={cfg.sendRateHz} min={5} max={60} step={5} unit="Hz" onChange={set('sendRateHz')} />
        {!compact && (
          <>
            <Slider label="Latency (one way)" value={cfg.latencyMs} min={0} max={200} step={5} unit="ms" onChange={set('latencyMs')} />
            <Slider label="Loss" value={cfg.lossPct} min={0} max={20} step={1} format={(v) => `${v}%`} onChange={set('lossPct')} />
            <Toggle label="Compare all three methods" checked={compareAll} onChange={setCompareAll} />
          </>
        )}
      </ControlGrid>
      <Legend
        items={[
          { label: 'rendered player', color: 'var(--accent)', shape: 'dot' },
          { label: 'true position now', color: 'var(--text)', shape: 'ring' },
          { label: 'snapshot received', color: 'var(--muted)', shape: 'dot' },
          ...(compareAll && !compact
            ? [
                { label: 'raw', color: 'var(--danger)', shape: 'ring' as const },
                { label: 'interpolated', color: 'var(--ok)', shape: 'ring' as const },
                { label: 'extrapolated', color: 'var(--warn)', shape: 'ring' as const },
              ]
            : []),
        ]}
      />
      <StatGrid stats={stats} compact={compact} playing={sim.playing} />
    </SimLayout>
  );
}

// ------------------------------------------------------------------ drawing

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, now: number, m: Model, compareAll: boolean) {
  const narrow = w < 520;
  const stripH = 86;
  const arenaW = Math.min(w - 24, ((h - stripH - 8) * W) / H);
  const scale = arenaW / W;
  const ox = (w - arenaW) / 2;
  const oy = 6;
  const X = (x: number) => ox + x * scale;
  const Y = (y: number) => oy + y * scale;
  fillRound(ctx, ox, oy, arenaW, H * scale, 8, p.surface2, p.border);

  // Route
  ctx.beginPath();
  PATH.forEach((q, i) => (i ? ctx.lineTo(X(q.x), Y(q.y)) : ctx.moveTo(X(q.x), Y(q.y))));
  ctx.closePath();
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = p.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);

  // Received snapshots
  for (const r of m.received) {
    const age = now - r.at;
    if (age > 2500) continue;
    const a = 1 - age / 2500;
    circle(ctx, X(r.pos.x), Y(r.pos.y), 3, alpha(p.muted, 0.25 + 0.6 * a));
    if (age < 200) circle(ctx, X(r.pos.x), Y(r.pos.y), 3 + age / 25, undefined, alpha(p.muted, 1 - age / 200), 1.25);
  }

  const rr = Math.max(7, 0.42 * scale);
  // Truth now
  const truth = truthAt(now).pos;
  circle(ctx, X(truth.x), Y(truth.y), rr, undefined, alpha(p.text, 0.55), 1.5);
  text(ctx, p, 'true now', X(truth.x), Y(truth.y) - rr - 8, { align: 'center', size: 9.5, color: p.muted });

  const mode = m.cfg.mode;
  if (compareAll) {
    const others: [InterpMode, string][] = [
      ['raw', p.danger],
      ['interpolate', p.ok],
      ['extrapolate', p.warn],
    ];
    for (const [md, c] of others) {
      if (md === mode) continue;
      const q = m.render(now, md);
      if (q) circle(ctx, X(q.x), Y(q.y), rr - 1, alpha(c, 0.12), c, 2);
    }
  }
  const shown = m.render(now, mode);
  if (shown) {
    const col = mode === 'interpolate' && (m.status === 'holding' || m.status === 'extrapolating') ? p.danger : p.accent;
    circle(ctx, X(shown.x), Y(shown.y), rr, col, p.surface, 2);
    const label = mode === 'raw' ? 'raw (latest snapshot)' : mode === 'extrapolate' ? 'extrapolated' : 'interpolated';
    text(ctx, p, label, X(shown.x), Y(shown.y) + rr + 10, { align: 'center', size: 10, weight: 700, color: col, bg: alpha(p.surface, 0.85) });
  }

  // Timeline strip
  const ty = oy + H * scale + 10;
  const tx0 = 12 + (narrow ? 0 : 4);
  const tx1 = w - 12;
  const c = m.cfg;
  const win = Math.max(600, c.renderDelayMs + c.latencyMs + 4 * c.jitterMs + 250);
  const TX = (t: number) => tx1 - ((now - t) / win) * (tx1 - tx0);
  fillRound(ctx, tx0, ty, tx1 - tx0, stripH - 18, 6, p.surface2);
  const lineY = ty + 34;
  line(ctx, tx0 + 6, lineY, tx1 - 6, lineY, p.border, 1);
  text(ctx, p, 'snapshot timeline (server time)', tx0 + 8, ty + 10, { size: 10, weight: 650, color: p.muted });
  // sent-but-not-here (lost or still in flight): hollow; received: filled
  const have = new Set(m.received.map((r) => r.seq));
  for (const s of m.sent) {
    const x = TX(s.t);
    if (x < tx0 + 4) continue;
    if (have.has(s.seq)) circle(ctx, x, lineY, 4, p.muted);
    else circle(ctx, x, lineY, 4, undefined, s.lost ? p.danger : alpha(p.muted, 0.6), 1.25);
  }
  // now + render time
  line(ctx, tx1 - 6, ty + 18, tx1 - 6, ty + stripH - 22, p.text, 1.5);
  text(ctx, p, 'now', tx1 - 9, ty + 10, { align: 'right', size: 9.5, color: p.text, weight: 650 });
  // The newest snapshot that could have arrived is one-way latency old.
  const cx = TX(now - c.latencyMs);
  if (c.latencyMs > 0) {
    ctx.fillStyle = alpha(p.muted, 0.12);
    ctx.fillRect(cx, ty + 18, tx1 - 6 - cx, stripH - 40);
    if (!narrow) text(ctx, p, 'in flight', (cx + tx1 - 6) / 2, ty + stripH - 30 + 18, { align: 'center', size: 9, color: p.muted });
  }
  if (mode === 'interpolate') {
    const rt = now - m.interp.delayMs;
    const sample = m.interp.sample(now);
    const bad = sample.status !== 'interpolating';
    const x = TX(rt);
    if (sample.bracket) {
      const a = TX(sample.bracket.from.time);
      const b = TX(sample.bracket.to.time);
      fillRound(ctx, a - 6, lineY - 9, b - a + 12, 18, 9, alpha(p.ok, 0.18), p.ok);
    }
    line(ctx, x, ty + 18, x, ty + stripH - 22, bad ? p.danger : p.accent, 2);
    const label = bad
      ? sample.status === 'waiting'
        ? 'waiting for first snapshots'
        : narrow
          ? 'buffer ran dry!'
          : 'buffer ran dry: nothing newer to blend toward!'
      : narrow
        ? `render time (−${c.renderDelayMs} ms)`
        : `render time: ${c.renderDelayMs} ms behind the newest data`;
    text(ctx, p, label, x, ty + stripH - 30 + 18, { align: x > (tx0 + tx1) / 2 ? 'right' : 'left', size: 9.5, weight: 650, color: bad ? p.danger : p.accent });
  } else {
    text(ctx, p, mode === 'raw' ? 'draws the newest snapshot as soon as it arrives' : 'predicts from the newest snapshot + its velocity', tx0 + 8, ty + stripH - 30 + 18, {
      size: 9.5,
      color: p.muted,
    });
  }
}
