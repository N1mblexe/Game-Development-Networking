import { useEffect, useRef, useState } from 'react';
import { InterpolationBuffer, Link, SnapshotBuffer, Ticker, deriveSeed, dist, lerpV, type Vec2 } from '../../lib/netsim';
import type { SimBaseProps } from './types';
import { useSim } from './ui/useSim';
import { ControlBar, ControlGrid, Legend, Segmented, SimCanvas, SimLayout, Slider, StatGrid, Toggle, fmtMs, type Stat } from './ui/controls';
import { alpha, circle, cross, fillRound, line, text } from './ui/draw';
import type { Palette } from './ui/theme';

export type CompMode = 'none' | 'rewind';

export interface LagCompensationProps extends SimBaseProps {
  mode?: CompMode;
  rttMs?: number;
  /** Client-side interpolation delay for remote players. */
  interpDelayMs?: number;
  /** Target speed in m/s. */
  targetSpeed?: number;
  autoFire?: boolean;
}

const W = 16;
const H = 4;
const HIT_R = 0.6;
const SERVER_HZ = 60;
const SNAPSHOT_HZ = 20;
const MAX_REWIND_MS = 1000;
const X_MIN = 1.5;
const X_MAX = 14.5;

function targetAt(t: number, speed: number): Vec2 {
  const span = X_MAX - X_MIN;
  const d = ((t / 1000) * speed) % (2 * span);
  return { x: d < span ? X_MIN + d : X_MAX - (d - span), y: H / 2 };
}

interface ShotMsg {
  id: number;
  point: Vec2;
  firedAt: number;
  /** The (server) time of the world the client was looking at when it fired. */
  viewTime: number;
}

export interface ShotResult {
  id: number;
  point: Vec2;
  firedAt: number;
  arrivedAt: number;
  viewTime: number;
  sawPos: Vec2;
  serverNow: Vec2;
  rewound: Vec2 | null;
  hitNoComp: boolean;
  hitRewind: boolean;
  byBot: boolean;
}

class Model {
  up: Link<ShotMsg>;
  down: Link<{ t: number; pos: Vec2 }>;
  serverTick = new Ticker(SERVER_HZ);
  snapTick = new Ticker(SNAPSHOT_HZ, 3);
  history = new SnapshotBuffer<Vec2>(SERVER_HZ * 2);
  view: InterpolationBuffer<Vec2>;
  results: ShotResult[] = [];
  pending: { msg: ShotMsg; sawPos: Vec2; byBot: boolean }[] = [];
  nextBotShot = 1200;
  private nextId = 1;

  constructor(
    public rttMs: number,
    public interpDelayMs: number,
    public speed: number,
    public autoFire: boolean,
    seed: number,
  ) {
    this.up = new Link({ latencyMs: rttMs / 2, jitterMs: 1 }, deriveSeed(seed, 'up'));
    this.down = new Link({ latencyMs: rttMs / 2, jitterMs: 1 }, deriveSeed(seed, 'down'));
    // The client's estimate of server time runs one-way latency behind, and it renders a further
    // interpolation delay behind that.
    this.view = new InterpolationBuffer<Vec2>(rttMs / 2 + interpDelayMs, lerpV);
  }

  configure(rttMs: number, interpDelayMs: number, speed: number) {
    this.rttMs = rttMs;
    this.interpDelayMs = interpDelayMs;
    this.view.delayMs = rttMs / 2 + interpDelayMs;
    this.speed = speed;
    this.up.configure({ latencyMs: rttMs / 2 });
    this.down.configure({ latencyMs: rttMs / 2 });
  }

  serverPos(t: number) {
    return targetAt(t, this.speed);
  }

  /** What the shooter's screen shows at `now`. */
  clientView(now: number): Vec2 | null {
    return this.view.sample(now).state ?? null;
  }

  fire(point: Vec2, now: number, byBot = false) {
    const saw = this.clientView(now);
    if (!saw) return;
    // The client tells the server which moment of the world it was rendering when it fired.
    const msg: ShotMsg = { id: this.nextId++, point, firedAt: now, viewTime: this.view.sample(now).renderTime };
    this.up.send(msg, now, 40);
    this.pending.push({ msg, sawPos: saw, byBot });
  }

  step(now: number) {
    this.serverTick.update(now, (_i, t) => {
      this.history.add(t, this.serverPos(t));
      this.history.pruneBefore(t - MAX_REWIND_MS - 100);
    });
    this.snapTick.update(now, (_i, t) => this.down.send({ t, pos: this.serverPos(t) }, t, 32));
    for (const pk of this.down.deliver(now)) this.view.add(pk.payload.t, pk.payload.pos);
    this.view.prune(now - 500);

    if (this.autoFire && now >= this.nextBotShot) {
      this.nextBotShot = now + 1600;
      const saw = this.clientView(now);
      if (saw) this.fire({ x: saw.x, y: saw.y + 0.1 }, now, true);
    }

    for (const pk of this.up.deliver(now)) {
      const s = pk.payload;
      const pend = this.pending.find((x) => x.msg.id === s.id);
      this.pending = this.pending.filter((x) => x.msg.id !== s.id);
      const serverNow = this.serverPos(now);
      const tooOld = now - s.viewTime > MAX_REWIND_MS;
      const rewound = tooOld ? null : (this.history.sample(s.viewTime, lerpV) ?? null);
      this.results.unshift({
        id: s.id,
        point: s.point,
        firedAt: s.firedAt,
        arrivedAt: now,
        viewTime: s.viewTime,
        sawPos: pend?.sawPos ?? s.point,
        serverNow,
        rewound,
        hitNoComp: dist(s.point, serverNow) <= HIT_R,
        hitRewind: !!rewound && dist(s.point, rewound) <= HIT_R,
        byBot: pend?.byBot ?? false,
      });
      if (this.results.length > 6) this.results.pop();
    }
  }
}

export default function LagCompensation(props: LagCompensationProps) {
  const { seed = 1, compact } = props;
  const [mode, setMode] = useState<CompMode>(props.mode ?? 'rewind');
  const [rtt, setRtt] = useState(props.rttMs ?? 150);
  const [interp, setInterp] = useState(props.interpDelayMs ?? 100);
  const [speed, setSpeed] = useState(props.targetSpeed ?? 6);
  const [autoFire, setAutoFire] = useState(props.autoFire ?? true);
  const model = useRef<Model>(null as unknown as Model);
  if (!model.current) model.current = new Model(rtt, interp, speed, autoFire, seed);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [stats, setStats] = useState<Stat[]>([]);
  const [results, setResults] = useState<ShotResult[]>([]);

  const sim = useSim({
    dt: 1,
    stepMs: 1000 / SERVER_HZ,
    step: (now) => model.current.step(now),
    draw: (ctx, w, h, p, now) => draw(ctx, w, h, p, now, model.current, modeRef.current),
    height: (w) => layout(w).height,
    onStats: (now) => {
      const m = model.current;
      const rs = m.results;
      const hits = rs.filter((r) => (modeRef.current === 'rewind' ? r.hitRewind : r.hitNoComp)).length;
      const lead = (m.rttMs / 2 + m.interpDelayMs + m.rttMs / 2) / 1000;
      setResults((prev) => (prev[0]?.id === rs[0]?.id && prev.length === rs.length ? prev : [...rs]));
      setStats([
        { label: 'You see the target', value: `${fmtMs(m.rttMs / 2 + m.interpDelayMs)} late` },
        { label: 'Lead needed (no comp)', value: `${(lead * m.speed).toFixed(1)} m` },
        { label: 'Server rewinds by', value: mode === 'rewind' ? fmtMs(m.rttMs + m.interpDelayMs) : '0 ms' },
        { label: 'Recent hits', value: rs.length ? `${hits}/${rs.length}` : '–', tone: rs.length ? (hits === rs.length ? 'ok' : hits ? 'warn' : 'danger') : undefined },
        { label: 'Shots in flight', value: String(m.pending.length), secondary: true },
        { label: 'Sim time', value: `${(now / 1000).toFixed(1)} s`, secondary: true },
      ]);
    },
  });

  useEffect(() => {
    model.current.configure(rtt, interp, speed);
    sim.redraw();
  }, [rtt, interp, speed, sim]);
  useEffect(() => {
    model.current.autoFire = autoFire;
  }, [autoFire]);
  useEffect(() => sim.redraw(), [mode, sim]);

  const reset = () => {
    model.current = new Model(rtt, interp, speed, autoFire, seed);
    setResults([]);
    sim.restart();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { w } = sim.size();
    const L = layout(w);
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (py < L.clientY || py > L.clientY + L.panelH) return;
    const m = model.current;
    if (autoFire) setAutoFire(false);
    m.autoFire = false;
    m.fire({ x: (px - L.ox) / L.scale, y: (py - L.clientY) / L.scale }, sim.now());
    if (!sim.playing) sim.play();
  };

  const verdict = (hit: boolean) => (
    <span className={`font-semibold ${hit ? 'text-ok' : 'text-danger'}`}>{hit ? 'HIT' : 'MISS'}</span>
  );

  return (
    <SimLayout>
      <SimCanvas
        sim={sim}
        onPointerDown={onPointerDown}
        label="Top: your screen, where you click to shoot the moving target. Bottom: the server when your shot arrives, showing where the target is now and where it was when you fired (the rewound hitbox)."
      >
        <div className="pointer-events-none absolute right-2 bottom-1 rounded bg-surface/85 px-1.5 py-0.5 text-[0.7rem] text-muted">
          {autoFire ? 'Auto-firing · click the top view to shoot yourself' : 'Click the top view to shoot'}
        </div>
      </SimCanvas>
      <ControlBar sim={sim} onReset={reset} compact={compact} />
      <Segmented
        label="Server hit detection"
        value={mode}
        options={[
          { value: 'none', label: 'No compensation' },
          { value: 'rewind', label: 'Rewind (lag compensation)' },
        ]}
        onChange={setMode}
      />
      <ControlGrid>
        <Slider label="Round-trip time" value={rtt} min={0} max={400} step={10} unit="ms" onChange={setRtt} />
        {!compact && (
          <>
            <Slider label="Interpolation delay" value={interp} min={0} max={200} step={10} unit="ms" onChange={setInterp} />
            <Slider label="Target speed" value={speed} min={1} max={12} step={1} unit="m/s" onChange={setSpeed} />
          </>
        )}
        <Toggle label="Auto-fire" checked={autoFire} onChange={setAutoFire} hint={compact ? undefined : 'A bot aims exactly at what it sees.'} />
      </ControlGrid>
      <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Recent shots (scrollable)">
        <table className="w-full min-w-[300px] text-left text-sm">
          <caption className="sr-only">Recent shots and the verdict under each hit-detection mode</caption>
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 pr-2 font-medium">Shot</th>
              <th className="py-1 pr-2 font-medium">Aimed at what you saw?</th>
              <th className={`py-1 pr-2 font-medium ${mode === 'none' ? 'text-text' : ''}`}>No comp.</th>
              <th className={`py-1 font-medium ${mode === 'rewind' ? 'text-text' : ''}`}>Rewind</th>
            </tr>
          </thead>
          <tbody aria-live="polite">
            {results.length === 0 && (
              <tr>
                <td colSpan={4} className="py-1 text-muted">
                  No shots yet.
                </td>
              </tr>
            )}
            {results.slice(0, compact ? 3 : 5).map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="py-1 pr-2 font-mono">#{r.id}{r.byBot ? ' (bot)' : ''}</td>
                <td className="py-1 pr-2">{dist(r.point, r.sawPos) <= HIT_R ? 'yes, on target' : 'no, off target'}</td>
                <td className={`py-1 pr-2 ${mode === 'none' ? '' : 'opacity-60'}`}>{verdict(r.hitNoComp)}</td>
                <td className={`py-1 ${mode === 'rewind' ? '' : 'opacity-60'}`}>{verdict(r.hitRewind)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Legend
        items={[
          { label: 'target as you see it', color: 'var(--accent)', shape: 'dot' },
          { label: 'target on the server now', color: 'var(--text)', shape: 'ring' },
          { label: 'rewound hitbox', color: 'var(--warn)', shape: 'ring' },
          { label: 'your shot', color: 'var(--danger)', shape: 'line' },
        ]}
      />
      <StatGrid stats={stats} compact={compact} playing={sim.playing} />
    </SimLayout>
  );
}

// ------------------------------------------------------------------ drawing

function layout(w: number) {
  const narrow = w < 520;
  // Cap the scale so both panels fit on wide screens; centre the world horizontally.
  const scale = Math.min((w - 24) / W, 26);
  const pw = W * scale;
  const ox = (w - pw) / 2;
  const panelH = H * scale;
  const clientY = 22;
  const serverY = clientY + panelH + 30;
  return { narrow, ox, pw, scale, panelH, clientY, serverY, height: Math.round(serverY + panelH + 28) };
}

function draw(ctx: CanvasRenderingContext2D, w: number, _h: number, p: Palette, now: number, m: Model, mode: CompMode) {
  const L = layout(w);
  const { ox, scale, panelH } = L;
  const X = (x: number) => ox + x * scale;
  const rr = HIT_R * scale;

  // Client panel
  const cy0 = L.clientY;
  text(ctx, p, 'Your screen (client)', ox, cy0 - 10, { size: 11, weight: 700, color: p.accent });
  text(ctx, p, L.narrow ? `${Math.round(m.rttMs / 2 + m.interpDelayMs)} ms in the past` : `target shown ${Math.round(m.rttMs / 2 + m.interpDelayMs)} ms in the past`, ox + L.pw, cy0 - 10, { align: 'right', size: 10, color: p.muted });
  fillRound(ctx, ox, cy0, L.pw, panelH, 8, p.surface2, p.border);
  const Yc = (y: number) => cy0 + y * scale;
  const real = m.serverPos(now);
  circle(ctx, X(real.x), Yc(real.y), rr, undefined, alpha(p.text, 0.35), 1.25);
  text(ctx, p, 'really here', X(real.x), Yc(real.y) - rr - 7, { align: 'center', size: 9, color: p.muted });
  const view = m.clientView(now);
  if (view) {
    circle(ctx, X(view.x), Yc(view.y), rr, alpha(p.accent, 0.85), p.surface, 2);
  }
  for (const s of m.pending) {
    const age = now - s.msg.firedAt;
    cross(ctx, X(s.msg.point.x), Yc(s.msg.point.y), 6, p.danger, 2);
    text(ctx, p, `shot sent… ${Math.max(0, Math.round(m.rttMs / 2 - age))} ms to server`, X(s.msg.point.x), Yc(s.msg.point.y) + rr + 6, {
      align: 'center',
      size: 9.5,
      color: p.danger,
      weight: 650,
    });
  }

  // Server panel
  const sy0 = L.serverY;
  text(ctx, p, 'Server', ox, sy0 - 10, { size: 11, weight: 700, color: p.text });
  fillRound(ctx, ox, sy0, L.pw, panelH, 8, p.surface2, p.border);
  const Ys = (y: number) => sy0 + y * scale;
  const last = m.results[0];
  const showLast = last && now - last.arrivedAt < 2600;
  if (showLast) {
    const a = Math.min(1, 1 - (now - last.arrivedAt - 2000) / 600);
    ctx.globalAlpha = Math.max(0, a);
    if (last.rewound) {
      ctx.setLineDash([4, 3]);
      circle(ctx, X(last.rewound.x), Ys(last.rewound.y), rr, alpha(p.warn, 0.12), p.warn, 2);
      ctx.setLineDash([]);
      text(ctx, p, `rewound −${Math.round(last.arrivedAt - last.viewTime)} ms`, X(last.rewound.x), Ys(last.rewound.y) + rr + 9, {
        align: 'center',
        size: 9.5,
        weight: 650,
        color: p.warn,
      });
    }
    circle(ctx, X(last.serverNow.x), Ys(last.serverNow.y), rr, alpha(p.text, 0.08), p.text, 2);
    text(ctx, p, 'target when shot arrived', X(last.serverNow.x), Ys(last.serverNow.y) - rr - 7, { align: 'center', size: 9.5, color: p.muted });
    if (last.rewound) line(ctx, X(last.rewound.x), Ys(H / 2), X(last.serverNow.x), Ys(H / 2), alpha(p.muted, 0.6), 1, [2, 3]);
    cross(ctx, X(last.point.x), Ys(last.point.y), 7, p.danger, 2.5);
    const hit = mode === 'rewind' ? last.hitRewind : last.hitNoComp;
    text(ctx, p, hit ? 'HIT' : 'MISS', ox + L.pw - 8, sy0 + 14, { align: 'right', size: 13, weight: 800, color: hit ? p.ok : p.danger, bg: hit ? p.okSoft : p.dangerSoft, pad: 6 });
    if (!L.narrow) text(
      ctx,
      p,
      mode === 'rewind' ? 'tested against the rewound hitbox' : 'tested against where the target is now',
      ox + L.pw - 8,
      sy0 + panelH - 12,
      { align: 'right', size: 9.5, color: p.muted },
    );
    ctx.globalAlpha = 1;
  } else {
    const cur = m.serverPos(now);
    circle(ctx, X(cur.x), Ys(cur.y), rr, alpha(p.text, 0.08), p.text, 2);
    text(ctx, p, 'waiting for a shot…', ox + L.pw / 2, sy0 + panelH - 12, { align: 'center', size: 10, color: p.muted });
  }
}
