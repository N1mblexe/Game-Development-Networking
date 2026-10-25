import { useEffect, useRef, useState } from 'react';
import { InputHistory, Link, Ticker, deriveSeed, dist, type Vec2 } from '../../lib/netsim';
import type { SimBaseProps } from './types';
import { useSim } from './ui/useSim';
import { ControlBar, ControlGrid, Legend, Segmented, SimCanvas, SimLayout, Slider, StatGrid, Toggle, fmtMs, type Stat } from './ui/controls';
import { alpha, arrow, circle, fillRound, line, roundRect, text } from './ui/draw';
import type { Palette } from './ui/theme';

export type PredictionMode = 'none' | 'predict' | 'reconcile';

export interface PredictionProps extends SimBaseProps {
  mode?: PredictionMode;
  /** Round-trip time; each direction gets half. */
  rttMs?: number;
  lossPct?: number;
  /** Drive the player with a scripted loop until the user takes over. */
  autopilot?: boolean;
}

// ------------------------------------------------------------------ world (metres)

const W = 16;
const H = 9;
const R = 0.4;
const SPEED = 5;
const TICK_HZ = 30;
const DT = 1 / TICK_HZ;
/** Things only the server knows about: the client predicts as if they weren't there. */
const MUD = { x: 6, y: 1.3, w: 4, h: 2.4, factor: 0.4 };
const CRATE = { x: 7, y: 6.4, w: 1.2, h: 2.2 };
/** Prediction-only: snap to the server when it disagrees with our history by more than this. */
const SNAP_THRESHOLD = 0.5;
const REDUNDANCY = 4;

interface Input {
  dx: number;
  dy: number;
}
interface Pending {
  input: Input;
  /** Where the client's prediction was after applying this input. */
  after: Vec2;
}
interface ServerState {
  pos: Vec2;
  ack: number;
}
type InputPacket = { inputs: { seq: number; input: Input }[] };

const clampArena = (p: Vec2): Vec2 => ({ x: Math.min(W - R, Math.max(R, p.x)), y: Math.min(H - R, Math.max(R, p.y)) });
const inRect = (p: Vec2, r: { x: number; y: number; w: number; h: number }, pad = 0) =>
  p.x > r.x - pad && p.x < r.x + r.w + pad && p.y > r.y - pad && p.y < r.y + r.h + pad;

/** The client's movement code: it doesn't know about mud or the crate. */
function moveClient(p: Vec2, i: Input): Vec2 {
  return clampArena({ x: p.x + i.dx * SPEED * DT, y: p.y + i.dy * SPEED * DT });
}

/** The server's authoritative movement code. */
function moveServer(p: Vec2, i: Input): Vec2 {
  const s = SPEED * (inRect(p, MUD) ? MUD.factor : 1) * DT;
  const blocked = (q: Vec2) => inRect(q, CRATE, R);
  const full = clampArena({ x: p.x + i.dx * s, y: p.y + i.dy * s });
  if (!blocked(full)) return full;
  const xOnly = clampArena({ x: p.x + i.dx * s, y: p.y });
  if (!blocked(xOnly)) return xOnly;
  const yOnly = clampArena({ x: p.x, y: p.y + i.dy * s });
  if (!blocked(yOnly)) return yOnly;
  return p;
}

/** Scripted loop: right, down, left, up (seconds per leg). */
const SCRIPT: [number, Input][] = [
  [2.8, { dx: 1, dy: 0 }],
  [1.0, { dx: 0, dy: 1 }],
  [2.6, { dx: -1, dy: 0 }],
  [1.0, { dx: 0, dy: -1 }],
];
const SCRIPT_LEN = SCRIPT.reduce((s, [d]) => s + d, 0);
function scripted(t: number): Input {
  let u = (t / 1000) % SCRIPT_LEN;
  for (const [d, i] of SCRIPT) {
    if (u < d) return i;
    u -= d;
  }
  return { dx: 0, dy: 0 };
}

const START: Vec2 = { x: 2.6, y: 2.5 };

class Model {
  up: Link<InputPacket>;
  down: Link<ServerState>;
  clientTick = new Ticker(TICK_HZ);
  serverTick = new Ticker(TICK_HZ, 11);
  history = new InputHistory<Pending>();
  /** Recent inputs for the strip (seq → input), acked or not. */
  recent: { seq: number; input: Input; ackedAt: number; replayedAt: number }[] = [];
  client: Vec2 = { ...START };
  server: Vec2 = { ...START };
  serverAck = 0;
  lastServerState: ServerState | null = null;
  lastAck = 0;
  replay: { at: number; from: Vec2; points: Vec2[] } | null = null;
  snap: { at: number; from: Vec2; to: Vec2 } | null = null;
  corrections = 0;
  snaps = 0;
  snapSeq = 0;
  lastCorrection = 0;
  maxError = 0;
  trail: Vec2[] = [];
  held: Input = { dx: 0, dy: 0 };
  autopilot: boolean;
  /** When the user last pressed something (for the input-delay readout). */
  lastPressAt = -1;
  pressSeenAt = -1;

  constructor(
    public mode: PredictionMode,
    rttMs: number,
    lossPct: number,
    autopilot: boolean,
    seed: number,
  ) {
    this.up = new Link<InputPacket>({ latencyMs: rttMs / 2, jitterMs: 2, lossPct }, deriveSeed(seed, 'up'));
    this.down = new Link<ServerState>({ latencyMs: rttMs / 2, jitterMs: 2, lossPct }, deriveSeed(seed, 'down'));
    this.autopilot = autopilot;
  }

  configure(rttMs: number, lossPct: number) {
    this.up.configure({ latencyMs: rttMs / 2, lossPct });
    this.down.configure({ latencyMs: rttMs / 2, lossPct });
  }

  /** What the player sees as "me". */
  get shown(): Vec2 {
    return this.mode === 'none' ? (this.lastServerState?.pos ?? START) : this.client;
  }

  step(now: number) {
    // --- client: sample input, predict, send (with the last few unacked inputs for redundancy)
    this.clientTick.update(now, (_i, t) => {
      const input = this.autopilot ? scripted(t) : { ...this.held };
      const before = this.client;
      if (this.mode !== 'none') this.client = moveClient(this.client, input);
      const seq = this.history.push({ input, after: this.client });
      this.recent.push({ seq, input, ackedAt: -1, replayedAt: -1 });
      if (this.recent.length > 40) this.recent.shift();
      const inputs = this.history.last(REDUNDANCY).map((e) => ({ seq: e.seq, input: e.input.input }));
      this.up.send({ inputs }, t, 28 + 8 + inputs.length * 3);
      if (this.mode !== 'none' && (before.x !== this.client.x || before.y !== this.client.y)) this.pushTrail(this.client);
    });

    // --- server: apply new inputs in order, send state each server tick
    for (const pk of this.up.deliver(now)) {
      for (const { seq, input } of pk.payload.inputs) {
        if (seq <= this.serverAck) continue;
        this.server = moveServer(this.server, input);
        this.serverAck = seq;
      }
    }
    this.serverTick.update(now, (_i, t) => {
      this.down.send({ pos: { ...this.server }, ack: this.serverAck }, t, 28 + 12);
    });

    // --- client: receive authoritative state
    for (const pk of this.down.deliver(now)) {
      const s = pk.payload;
      if (this.lastServerState && s.ack < this.lastServerState.ack) continue; // older than what we have
      const prevShown = this.shown;
      this.lastServerState = s;
      for (const r of this.recent) if (r.seq <= s.ack && r.ackedAt < 0) r.ackedAt = now;
      if (this.mode === 'none') {
        this.history.ack(s.ack);
        if (dist(prevShown, s.pos) > 1e-6) this.pushTrail(s.pos);
        if (this.lastPressAt >= 0 && this.pressSeenAt < 0 && dist(prevShown, s.pos) > 1e-6) this.pressSeenAt = now;
      } else if (this.mode === 'predict') {
        // Compare with where *we* were after that input; if we disagree a lot, snap to the server.
        // Inputs sent before the last snap were predicted from a position we threw away: skip them.
        const mine = s.ack > this.snapSeq ? this.history.pending.find((e) => e.seq === s.ack)?.input.after : undefined;
        this.history.ack(s.ack);
        if (mine && dist(mine, s.pos) > SNAP_THRESHOLD) {
          this.snapSeq = this.history.lastSeq;
          this.snap = { at: now, from: { ...this.client }, to: { ...s.pos } };
          this.lastCorrection = dist(this.client, s.pos);
          this.client = { ...s.pos };
          this.snaps++;
        }
      } else {
        // Reconciliation: start from the server's state, replay every input it hasn't seen yet.
        this.history.ack(s.ack);
        const before = this.client;
        let p = { ...s.pos };
        const points: Vec2[] = [];
        for (const e of this.history.pending) {
          p = moveClient(p, e.input.input);
          e.input.after = p;
          points.push(p);
        }
        for (const r of this.recent) if (r.seq > s.ack) r.replayedAt = now;
        const err = dist(before, p);
        if (err > 0.02) {
          this.corrections++;
          this.lastCorrection = err;
          this.replay = { at: now, from: { ...s.pos }, points };
        }
        this.client = p;
      }
    }
    const e = dist(this.shown, this.server);
    if (now > 1500) this.maxError = Math.max(this.maxError, e);
  }

  private pushTrail(p: Vec2) {
    this.trail.push({ ...p });
    if (this.trail.length > 90) this.trail.shift();
  }
}

const MODES = [
  { value: 'none' as const, label: 'No prediction' },
  { value: 'predict' as const, label: 'Prediction only' },
  { value: 'reconcile' as const, label: 'Reconciliation' },
];

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
  W: [0, -1],
  S: [0, 1],
  A: [-1, 0],
  D: [1, 0],
};

export default function Prediction(props: PredictionProps) {
  const { seed = 1, compact } = props;
  const [mode, setMode] = useState<PredictionMode>(props.mode ?? 'reconcile');
  const [rtt, setRtt] = useState(props.rttMs ?? 150);
  const [loss, setLoss] = useState(props.lossPct ?? 0);
  const [autopilot, setAutopilot] = useState(props.autopilot ?? true);
  const model = useRef<Model>(null as unknown as Model);
  if (!model.current) model.current = new Model(mode, rtt, loss, autopilot, seed);
  const keys = useRef(new Set<string>());
  const pad = useRef({ dx: 0, dy: 0 });
  const [stats, setStats] = useState<Stat[]>([]);
  const rttRef = useRef(rtt);
  rttRef.current = rtt;

  const sim = useSim({
    dt: 1,
    stepMs: 1000 / TICK_HZ,
    step: (now) => model.current.step(now),
    draw: (ctx, w, h, p, now) => draw(ctx, w, h, p, now, model.current),
    height: (w) => Math.round(Math.min(560, (w - 24) * (H / W)) + (w < 520 ? 92 : 78)),
    onStats: () => {
      const m = model.current;
      const pending = m.history.pending.length;
      setStats([
        {
          label: 'Input delay',
          value: m.mode === 'none' ? `≈ ${fmtMs(rttRef.current + 1000 / TICK_HZ)}` : '0 ms',
          tone: m.mode === 'none' ? 'danger' : 'ok',
        },
        { label: 'Unacked inputs', value: String(pending) },
        { label: 'Last ack', value: `#${m.lastServerState?.ack ?? 0}`, secondary: true },
        {
          label: m.mode === 'predict' ? 'Snaps' : 'Corrections',
          value: String(m.mode === 'predict' ? m.snaps : m.corrections),
          tone: m.mode === 'predict' && m.snaps ? 'danger' : undefined,
        },
        { label: 'Last correction', value: `${m.lastCorrection.toFixed(2)} m`, secondary: true },
        { label: 'Off from server', value: `${dist(m.shown, m.server).toFixed(2)} m`, secondary: true },
      ]);
    },
  });

  useEffect(() => {
    model.current.configure(rtt, loss);
  }, [rtt, loss]);
  useEffect(() => {
    model.current.autopilot = autopilot;
  }, [autopilot]);

  const rebuild = (md = mode) => {
    model.current = new Model(md, rtt, loss, autopilot, seed);
    sim.restart();
  };
  const changeMode = (md: PredictionMode) => {
    setMode(md);
    rebuild(md);
  };

  const updateHeld = () => {
    let dx = pad.current.dx;
    let dy = pad.current.dy;
    for (const k of keys.current) {
      const v = KEYS[k];
      if (v) {
        dx += v[0];
        dy += v[1];
      }
    }
    dx = Math.sign(dx);
    dy = Math.sign(dy);
    const n = dx && dy ? Math.SQRT1_2 : 1;
    const m = model.current;
    if ((dx || dy) && m.autopilot) {
      m.autopilot = false;
      setAutopilot(false);
    }
    if ((dx || dy) && !(m.held.dx || m.held.dy)) {
      m.lastPressAt = sim.now();
      m.pressSeenAt = -1;
    }
    m.held = { dx: dx * n, dy: dy * n };
    if ((dx || dy) && !sim.playing) sim.play();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!(e.key in KEYS)) return;
    e.preventDefault();
    keys.current.add(e.key);
    updateHeld();
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    if (!(e.key in KEYS)) return;
    keys.current.delete(e.key);
    updateHeld();
  };
  const press = (dx: number, dy: number) => () => {
    pad.current = { dx, dy };
    updateHeld();
  };
  const release = () => {
    pad.current = { dx: 0, dy: 0 };
    updateHeld();
  };
  const dbtn =
    'grid h-10 w-10 place-items-center rounded-md border border-border bg-surface text-lg text-text select-none touch-none active:bg-accent-soft';
  const padBtn = (label: string, dx: number, dy: number, glyph: string, cls: string) => (
    <button
      type="button"
      aria-label={`Move ${label}`}
      className={`${dbtn} ${cls}`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        press(dx, dy)();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {glyph}
    </button>
  );

  return (
    <SimLayout>
      <SimCanvas
        sim={sim}
        focusable
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onPointerDown={(e) => (e.currentTarget.parentElement as HTMLElement).focus()}
        label="Arena with your player. A solid dot is what your screen shows, a dashed ring is the server's authoritative position. A mud patch and a crate exist only on the server. Focus here and use arrow keys or WASD to move."
      >
        <div className="pointer-events-none absolute top-2 right-2 rounded bg-surface/85 px-1.5 py-0.5 text-[0.7rem] text-muted">
          {autopilot ? 'Autopilot · press a key or the pad to drive' : 'Click here, then arrows / WASD'}
        </div>
      </SimCanvas>
      <ControlBar sim={sim} onReset={() => rebuild()} compact={compact} stepLabel="Tick" />
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 space-y-3">
          <Segmented label="Client strategy" value={mode} options={MODES} onChange={changeMode} />
          <ControlGrid>
            <Slider label="Round-trip time" value={rtt} min={0} max={500} step={10} unit="ms" onChange={setRtt} />
            {!compact && (
              <Slider label="Packet loss" value={loss} min={0} max={20} step={1} format={(v) => `${v}%`} onChange={setLoss} hint="Inputs are sent 4× redundantly." />
            )}
            <Toggle label="Autopilot" checked={autopilot} onChange={setAutopilot} hint={compact ? undefined : 'Scripted loop. Any key or pad press takes over.'} />
          </ControlGrid>
        </div>
        <div className="grid grid-cols-3 gap-1" aria-label="Movement pad">
          <span />
          {padBtn('up', 0, -1, '↑', '')}
          <span />
          {padBtn('left', -1, 0, '←', '')}
          {padBtn('down', 0, 1, '↓', '')}
          {padBtn('right', 1, 0, '→', '')}
        </div>
      </div>
      <Legend
        items={[
          { label: 'client view (what you see)', color: 'var(--accent)', shape: 'dot' },
          { label: 'server truth (now)', color: 'var(--text)', shape: 'ring' },
          { label: 'replayed inputs', color: 'var(--warn)', shape: 'dot' },
          { label: 'snap / correction', color: 'var(--danger)', shape: 'line' },
        ]}
      />
      <StatGrid stats={stats} compact={compact} playing={sim.playing} />
    </SimLayout>
  );
}

// ------------------------------------------------------------------ drawing

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, now: number, m: Model) {
  const narrow = w < 520;
  const padX = 12;
  const stripH = narrow ? 92 : 78;
  const arenaW = Math.min(w - padX * 2, ((h - stripH - 12) * W) / H);
  const scale = arenaW / W;
  const ox = (w - arenaW) / 2;
  const oy = 8;
  const X = (x: number) => ox + x * scale;
  const Y = (y: number) => oy + y * scale;

  fillRound(ctx, ox, oy, arenaW, H * scale, 8, p.surface2, p.border);

  // Server-only things
  ctx.save();
  roundRect(ctx, X(MUD.x), Y(MUD.y), MUD.w * scale, MUD.h * scale, 6);
  ctx.fillStyle = alpha(p.warn, 0.14);
  ctx.fill();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = alpha(p.warn, 0.8);
  ctx.lineWidth = 1.25;
  ctx.stroke();
  roundRect(ctx, X(CRATE.x), Y(CRATE.y), CRATE.w * scale, CRATE.h * scale, 3);
  ctx.fillStyle = alpha(p.text, 0.1);
  ctx.fill();
  ctx.strokeStyle = p.text;
  ctx.stroke();
  ctx.restore();
  text(ctx, p, narrow ? 'mud ×0.4' : 'mud: 40% speed', X(MUD.x + MUD.w / 2), Y(MUD.y) + 10, { align: 'center', size: 10, weight: 650, color: p.warn });
  text(ctx, p, '(server only)', X(MUD.x + MUD.w / 2), Y(MUD.y) + 23, { align: 'center', size: 9, color: p.warn });
  text(ctx, p, 'crate', X(CRATE.x + CRATE.w / 2), Y(CRATE.y + CRATE.h / 2) - 6, { align: 'center', size: 10, weight: 650, color: p.text });
  text(ctx, p, 'server only', X(CRATE.x + CRATE.w / 2), Y(CRATE.y + CRATE.h / 2) + 7, { align: 'center', size: 8.5, color: p.muted });

  // Trail of what the client showed
  for (let i = 0; i < m.trail.length; i++) {
    const t = m.trail[i]!;
    circle(ctx, X(t.x), Y(t.y), 1.6, alpha(p.accent, 0.12 + (0.35 * i) / m.trail.length));
  }

  // Replay visual
  if (m.replay && now - m.replay.at < 600) {
    const a = 1 - (now - m.replay.at) / 600;
    ctx.globalAlpha = a;
    let px = X(m.replay.from.x);
    let py = Y(m.replay.from.y);
    circle(ctx, px, py, 4, p.warn);
    for (const q of m.replay.points) {
      line(ctx, px, py, X(q.x), Y(q.y), p.warn, 1.5);
      px = X(q.x);
      py = Y(q.y);
      circle(ctx, px, py, 2.5, p.warn);
    }
    text(ctx, p, `replayed ${m.replay.points.length} inputs`, X(m.replay.from.x) + 10, Y(m.replay.from.y) - 14, { size: 10, weight: 650, color: p.warn, bg: p.surface });
    ctx.globalAlpha = 1;
  }
  // Snap visual
  if (m.snap && now - m.snap.at < 900) {
    const a = 1 - (now - m.snap.at) / 900;
    ctx.globalAlpha = a;
    arrow(ctx, X(m.snap.from.x), Y(m.snap.from.y), X(m.snap.to.x), Y(m.snap.to.y), p.danger, 2);
    circle(ctx, X(m.snap.from.x), Y(m.snap.from.y), R * scale, undefined, p.danger, 1.5);
    text(ctx, p, 'SNAP back to server', X(m.snap.to.x), Y(m.snap.to.y) + R * scale + 12, { align: 'center', size: 10, weight: 700, color: p.danger, bg: p.surface });
    ctx.globalAlpha = 1;
  }

  // Server truth ghost
  const rr = R * scale;
  ctx.setLineDash([4, 3]);
  circle(ctx, X(m.server.x), Y(m.server.y), rr, alpha(p.text, 0.06), p.text, 1.75);
  ctx.setLineDash([]);
  text(ctx, p, 'server', X(m.server.x), Y(m.server.y) - rr - 8, { align: 'center', size: 9.5, color: p.muted, weight: 600 });

  // Client view
  const s = m.shown;
  circle(ctx, X(s.x), Y(s.y), rr, p.accent, p.surface, 2);
  text(ctx, p, 'you', X(s.x), Y(s.y) + rr + 9, { align: 'center', size: 9.5, color: p.accent, weight: 700 });

  // Input strip
  const sy = oy + H * scale + 12;
  const box = narrow ? 22 : 26;
  const gap = 3;
  const labelW = narrow ? 0 : 92;
  const n = Math.max(6, Math.floor((w - padX * 2 - labelW) / (box + gap)));
  const items = m.recent.slice(-n);
  if (!narrow) {
    text(ctx, p, 'Inputs sent', padX, sy + 8, { size: 10.5, weight: 650, color: p.muted });
    text(ctx, p, `ack #${m.lastServerState?.ack ?? 0}`, padX, sy + 23, { size: 10, mono: true, color: p.muted });
  }
  const sx0 = padX + labelW;
  items.forEach((it, i) => {
    const x = sx0 + i * (box + gap);
    const acked = it.ackedAt >= 0;
    const replayed = !acked && m.mode === 'reconcile' && it.replayedAt >= 0 && now - it.replayedAt < 250;
    const fillC = replayed ? p.warnSoft : acked ? p.surface2 : p.accentSoft;
    const stroke = replayed ? p.warn : acked ? p.border : p.accent;
    fillRound(ctx, x, sy, box, box + 6, 4, fillC, stroke);
    const g = it.input.dx > 0 ? '→' : it.input.dx < 0 ? '←' : it.input.dy > 0 ? '↓' : it.input.dy < 0 ? '↑' : '·';
    text(ctx, p, g, x + box / 2, sy + 9, { align: 'center', size: 11, weight: 700, color: acked ? p.muted : p.text });
    text(ctx, p, String(it.seq % 1000), x + box / 2, sy + box - 1, { align: 'center', size: 8.5, mono: true, color: acked ? p.muted : p.accent });
  });
  const legendY = sy + box + 16;
  text(
    ctx,
    p,
    m.mode === 'none'
      ? 'You only move when the server says so: every input waits a full round trip.'
      : m.mode === 'predict'
        ? 'Moves instantly, but never replays: when the server disagrees, you snap to its old position.'
        : 'Server state + replay of unacked inputs (blue) = corrected prediction.',
    w / 2,
    legendY,
    { align: 'center', size: narrow ? 9.5 : 10.5, color: p.muted },
  );
}
