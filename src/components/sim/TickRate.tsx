import { useEffect, useRef, useState } from 'react';
import { Random, Ticker } from '../../lib/netsim';
import type { SimBaseProps } from './types';
import { useSim } from './ui/useSim';
import { ControlBar, ControlGrid, Legend, SimCanvas, SimLayout, Slider, StatGrid, Toggle, type Stat } from './ui/controls';
import { alpha, circle, fillRound, line, text } from './ui/draw';
import type { Palette } from './ui/theme';

export interface TickRateProps extends SimBaseProps {
  /** Tick rates to compare side by side, e.g. [10, 30, 60]. */
  rates?: number[];
  /** Projectile speed in m/s. */
  speed?: number;
  /** Use a swept (continuous) collision test instead of checking overlap at each tick. */
  sweep?: boolean;
}

// World, in metres
const WORLD = 20;
const START_X = 1;
const WALL_X = 12;
const WALL_HALF = 0.15;
const BALL_R = 0.15;
const END_X = WORLD - 0.5;

type Status = 'waiting' | 'moving' | 'returning' | 'hit' | 'missed';

class Lane {
  ticker: Ticker;
  x = START_X;
  v = 0;
  status: Status = 'waiting';
  samples: { x: number; back: boolean }[] = [];
  hitX = 0;
  hits = 0;
  runs = 0;
  hitFlashAt = -1e9;
  constructor(public rate: number) {
    this.ticker = new Ticker(rate);
  }
}

class Model {
  lanes: Lane[];
  launchAt = 300;
  rng: Random;
  /** Continuous ("real") ball, for comparison. */
  constructor(
    rates: number[],
    public speed: number,
    public sweep: boolean,
    seed: number,
  ) {
    this.lanes = rates.map((r) => new Lane(r));
    this.rng = new Random(seed);
    this.launchAt = 300 + this.rng.range(0, 100);
  }

  /** Where the ball really is at time t (continuous physics, bounces off the wall). */
  truthX(t: number): number {
    if (t < this.launchAt) return START_X;
    const contact = WALL_X - WALL_HALF - BALL_R;
    const x = START_X + (this.speed * (t - this.launchAt)) / 1000;
    return x <= contact ? x : Math.max(START_X - 0.5, 2 * contact - x);
  }

  step(now: number) {
    for (const lane of this.lanes) {
      lane.ticker.update(now, (_i, t) => this.tickLane(lane, t));
    }
    if (this.lanes.every((l) => l.status === 'hit' || l.status === 'missed')) {
      const last = Math.max(...this.lanes.map((l) => l.samples.length));
      if (last && now > this.launchAt + 400) this.nextRun(now);
    }
  }

  private tickLane(lane: Lane, t: number) {
    const dt = 1 / lane.rate;
    if (lane.status === 'waiting') {
      if (t < this.launchAt) return;
      lane.status = 'moving';
      lane.v = this.speed;
      lane.x = START_X + (this.speed * (t - this.launchAt)) / 1000;
      lane.samples.push({ x: lane.x, back: false });
      this.checkHit(lane, START_X, t);
      return;
    }
    if (lane.status === 'hit' || lane.status === 'missed') return;
    const prev = lane.x;
    lane.x += lane.v * dt;
    if (lane.status === 'moving') this.checkHit(lane, prev, t);
    lane.samples.push({ x: lane.x, back: lane.status === 'returning' });
    if (lane.status === 'returning' && lane.x <= START_X) lane.status = 'hit';
    if (lane.status === 'moving' && lane.x >= END_X) {
      lane.status = 'missed';
      lane.runs++;
    }
  }

  private checkHit(lane: Lane, prev: number, t: number) {
    const reach = WALL_HALF + BALL_R;
    const overlap = Math.abs(lane.x - WALL_X) <= reach;
    // Swept test: did the segment prev→x cross the wall's (expanded) slab?
    const crossed = this.sweep && prev <= WALL_X + reach && lane.x >= WALL_X - reach;
    if (overlap || crossed) {
      if (crossed && !overlap) lane.x = WALL_X - reach; // resolve to the contact point
      lane.status = 'returning';
      lane.v = -this.speed;
      lane.hitX = lane.x;
      lane.hits++;
      lane.runs++;
      lane.hitFlashAt = t;
    }
  }

  private nextRun(now: number) {
    this.launchAt = now + 500 + this.rng.range(0, 200);
    for (const l of this.lanes) {
      l.status = 'waiting';
      l.x = START_X;
      l.samples = [];
    }
  }
}

export default function TickRate(props: TickRateProps) {
  const { seed = 1, compact } = props;
  const [rates, setRates] = useState<number[]>(props.rates ?? [10, 30, 60]);
  const [speed, setSpeed] = useState(props.speed ?? 24);
  const [sweep, setSweep] = useState(props.sweep ?? false);
  const model = useRef<Model>(null as unknown as Model);
  if (!model.current) model.current = new Model(rates, speed, sweep, seed);
  const [stats, setStats] = useState<Stat[]>([]);

  const sim = useSim({
    dt: 1,
    stepMs: 1000 / Math.max(...rates),
    step: (now) => model.current.step(now),
    draw: (ctx, w, h, p, now) => draw(ctx, w, h, p, now, model.current),
    height: (w) => 44 + model.current.lanes.length * (w < 520 ? 92 : 84),
    onStats: () => {
      const m = model.current;
      setStats(
        m.lanes.flatMap((l) => [
          {
            label: `${l.rate} Hz caught`,
            value: l.runs ? `${l.hits}/${l.runs} (${Math.round((100 * l.hits) / l.runs)}%)` : '–',
            tone: l.runs && l.hits < l.runs ? ('danger' as const) : l.runs ? ('ok' as const) : undefined,
          },
          { label: `${l.rate} Hz step`, value: `${((m.speed / l.rate) * 100).toFixed(0)} cm/tick`, secondary: true },
        ]),
      );
    },
  });

  const rebuild = (r = rates, s = speed, sw = sweep) => {
    model.current = new Model(r, s, sw, seed);
    sim.restart();
  };
  useEffect(() => {
    rebuild(rates, speed, sweep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates, speed, sweep]);

  const catchWindow = (WALL_HALF + BALL_R) * 2;
  return (
    <SimLayout>
      <SimCanvas
        sim={sim}
        label={`A ball flies at ${speed} m/s toward a thin wall. Each lane simulates it at a different tick rate and only checks for collisions at tick moments; dots mark where each tick sampled the ball. At low tick rates the ball can jump straight past the wall between two ticks (tunnelling).`}
      />
      <ControlBar sim={sim} onReset={() => rebuild()} compact={compact} />
      <ControlGrid>
        <Slider
          label="Projectile speed"
          value={speed}
          min={4}
          max={60}
          step={1}
          unit="m/s"
          hint={compact ? undefined : `Collision needs a tick while the ball overlaps the wall: a ${(catchWindow * 100).toFixed(0)} cm window.`}
          onChange={setSpeed}
        />
        {rates.length === 1 && (
          <Slider label="Tick rate" value={rates[0]!} min={5} max={128} step={1} unit="Hz" onChange={(v) => setRates([v])} />
        )}
        {!compact && (
          <Toggle
            label="Swept collision (CCD)"
            hint="Test the whole path between ticks, not just the end point. Fixes tunnelling at any tick rate."
            checked={sweep}
            onChange={setSweep}
          />
        )}
      </ControlGrid>
      <Legend
        items={[
          { label: 'tick sample (what the simulation saw)', color: 'var(--accent)', shape: 'dot' },
          { label: 'real continuous motion', color: 'var(--muted)', shape: 'ring' },
          { label: 'wall (30 cm)', color: 'var(--text)', shape: 'square' },
        ]}
      />
      <StatGrid stats={stats} compact={compact} playing={sim.playing} />
    </SimLayout>
  );
}

function draw(ctx: CanvasRenderingContext2D, w: number, _h: number, p: Palette, now: number, m: Model) {
  const narrow = w < 520;
  const pad = 12;
  const laneH = narrow ? 92 : 84;
  const x0 = pad + 6;
  const x1 = w - pad - 6;
  const sx = (x: number) => x0 + (x / WORLD) * (x1 - x0);
  const pxPerM = (x1 - x0) / WORLD;

  // Scale bar
  text(ctx, p, '0 m', x0, 14, { size: 9.5, color: p.muted, mono: true });
  text(ctx, p, `${WORLD} m`, x1, 14, { align: 'right', size: 9.5, color: p.muted, mono: true });
  text(ctx, p, `ball ${m.speed} m/s →`, (x0 + x1) / 2, 14, { align: 'center', size: 10, color: p.muted, weight: 600 });

  m.lanes.forEach((lane, i) => {
    const top = 30 + i * laneH;
    const cy = top + laneH * 0.58;
    fillRound(ctx, pad, top, w - pad * 2, laneH - 8, 8, p.surface2);
    const stepCm = (m.speed / lane.rate) * 100;
    text(ctx, p, `${lane.rate} Hz`, pad + 10, top + 14, { size: 12, weight: 750, color: p.accent });
    text(ctx, p, `${(1000 / lane.rate).toFixed(1)} ms/tick · moves ${stepCm.toFixed(0)} cm per tick`, pad + (narrow ? 52 : 62), top + 14, {
      size: 10,
      color: p.muted,
    });

    // track
    line(ctx, sx(START_X), cy, sx(END_X), cy, p.border, 1, [2, 4]);

    // wall
    const flash = Math.max(0, 1 - (now - lane.hitFlashAt) / 400);
    const ww = Math.max(3, WALL_HALF * 2 * pxPerM);
    ctx.fillStyle = flash > 0 ? p.ok : p.text;
    ctx.fillRect(sx(WALL_X) - ww / 2, cy - 22, ww, 44);
    if (flash > 0) {
      ctx.fillStyle = alpha(p.ok, 0.25 * flash);
      ctx.fillRect(sx(WALL_X) - ww / 2 - 6, cy - 26, ww + 12, 52);
    }

    // truth ghost
    const tx = m.truthX(now);
    if (now >= m.launchAt && lane.status !== 'waiting') circle(ctx, sx(tx), cy, Math.max(4, BALL_R * pxPerM), undefined, alpha(p.muted, 0.7), 1.5);

    // tick samples
    for (let k = 0; k < lane.samples.length; k++) {
      const s = lane.samples[k]!;
      const y = s.back ? cy + 9 : cy;
      circle(ctx, sx(s.x), y, 2.6, s.back ? alpha(p.accent, 0.45) : p.accent);
    }
    // current sampled ball
    if (lane.status !== 'waiting') {
      const back = lane.status === 'returning' || lane.status === 'hit';
      circle(ctx, sx(lane.x), back ? cy + 9 : cy, Math.max(5, BALL_R * pxPerM), p.accent);
    } else circle(ctx, sx(START_X), cy, Math.max(5, BALL_R * pxPerM), alpha(p.accent, 0.5));

    // verdict
    const bx = x1 - 4;
    const by = top + laneH - 22;
    if (lane.status === 'missed')
      text(ctx, p, narrow ? 'MISSED: tunnelled' : 'MISSED: tunnelled through the wall', bx, by, { align: 'right', size: 10.5, weight: 750, color: p.danger, bg: p.dangerSoft });
    else if (lane.status === 'returning' || lane.status === 'hit')
      text(ctx, p, 'HIT: bounced', bx, by, { align: 'right', size: 10.5, weight: 750, color: p.ok, bg: p.okSoft });
  });
}
