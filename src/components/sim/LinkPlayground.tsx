import { useEffect, useRef, useState } from 'react';
import { Link, Ticker, type LinkConfig, type Packet } from '../../lib/netsim';
import type { SimBaseProps } from './types';
import { useSim } from './ui/useSim';
import { ControlBar, ControlGrid, Legend, SimCanvas, SimLayout, Slider, StatGrid, Toggle, fmtKbps, fmtMs, type Stat } from './ui/controls';
import { alpha, cross, fillRound, line, text } from './ui/draw';
import type { Palette } from './ui/theme';

export interface LinkPlaygroundProps extends SimBaseProps {
  latencyMs?: number;
  jitterMs?: number;
  lossPct?: number;
  /** Mean loss-burst length in packets (1 = independent losses). */
  burstLength?: number;
  /** 0 = unlimited. */
  bandwidthKbps?: number;
  duplicatePct?: number;
  sendRateHz?: number;
  packetBytes?: number;
  preserveOrder?: boolean;
}

type Cfg = Required<Omit<LinkPlaygroundProps, keyof SimBaseProps>>;

const BW_VALUES = [32, 64, 128, 256, 512, 1000, 2000, 5000, 10000, Infinity] as const;
const HIST_BINS = 36;

interface Arrival {
  id: number;
  reordered: boolean;
  duplicate: boolean;
}

/** A packet as drawn on the space-time diagram. */
interface Trace {
  pkt: Packet<number>;
  reordered: boolean;
}

class LinkModel {
  link: Link<number>;
  ticker: Ticker;
  arrivals: Arrival[] = [];
  traces: Trace[] = [];
  maxId = -1;
  constructor(
    public cfg: Cfg,
    readonly seed: number,
  ) {
    this.link = new Link<number>(toLinkConfig(cfg), seed);
    this.ticker = new Ticker(cfg.sendRateHz);
  }
  step(now: number) {
    this.ticker.update(now, (_i, t) => {
      this.traces.push({ pkt: this.link.send(0, t, this.cfg.packetBytes), reordered: false });
    });
    for (const p of this.link.deliver(now)) {
      const reordered = p.id < this.maxId;
      if (!reordered) this.maxId = p.id;
      if (p.duplicate) this.traces.push({ pkt: p, reordered });
      else if (reordered) {
        const t = this.traces.find((x) => x.pkt === p);
        if (t) t.reordered = true;
      }
      this.arrivals.push({ id: p.id, reordered, duplicate: p.duplicate });
      if (this.arrivals.length > 64) this.arrivals.shift();
    }
    // Forget packets that have scrolled off the diagram.
    const horizon = now - 7000;
    let k = 0;
    while (k < this.traces.length && Math.max(this.traces[k]!.pkt.arriveAt, this.traces[k]!.pkt.sentAt) < horizon) k++;
    if (k) this.traces.splice(0, k);
  }
}

function toLinkConfig(c: Cfg): LinkConfig {
  return {
    latencyMs: c.latencyMs,
    jitterMs: c.jitterMs,
    lossPct: c.lossPct,
    burstLength: c.burstLength,
    bandwidthKbps: c.bandwidthKbps,
    duplicatePct: c.duplicatePct,
    preserveOrder: c.preserveOrder,
  };
}

export default function LinkPlayground(props: LinkPlaygroundProps) {
  const { seed = 1, compact } = props;
  const initial: Cfg = {
    latencyMs: props.latencyMs ?? 20,
    jitterMs: props.jitterMs ?? 4,
    lossPct: props.lossPct ?? 0.5,
    burstLength: props.burstLength ?? 1,
    bandwidthKbps: props.bandwidthKbps ?? 0,
    duplicatePct: props.duplicatePct ?? 0,
    sendRateHz: props.sendRateHz ?? 30,
    packetBytes: props.packetBytes ?? 200,
    preserveOrder: props.preserveOrder ?? false,
  };
  const [cfg, setCfg] = useState<Cfg>(initial);
  const model = useRef<LinkModel>(null as unknown as LinkModel);
  if (!model.current) model.current = new LinkModel(initial, seed);
  const [stats, setStats] = useState<Stat[]>([]);

  const sim = useSim({
    dt: 1,
    stepMs: 1000 / cfg.sendRateHz,
    step: (now) => model.current.step(now),
    draw: (ctx, w, h, p, now) => drawLink(ctx, w, h, p, now, model.current),
    height: (w) => (w < 520 ? 340 : 320),
    onStats: (now) => {
      const m = model.current;
      const s = m.link.stats;
      const q = m.link.queueDelayMs(now);
      setStats([
        { label: 'Sent', value: String(s.sent) },
        { label: 'Delivered', value: String(s.delivered) },
        { label: 'Lost', value: `${s.lost} (${(s.lossRate * 100).toFixed(1)}%)`, tone: s.lossRate > 0.02 ? 'danger' : s.lost ? 'warn' : undefined },
        { label: 'Avg latency', value: s.delivered ? fmtMs(s.avgLatencyMs) : '–' },
        {
          label: 'p95 latency',
          value: s.delivered ? fmtMs(s.p95LatencyMs) : '–',
          tone: s.p95LatencyMs - s.avgLatencyMs > 20 ? 'warn' : undefined,
        },
        { label: 'Out of order', value: String(s.reordered), tone: s.reordered ? 'warn' : undefined, secondary: true },
        { label: 'Duplicates', value: String(s.duplicated), secondary: true },
        { label: 'Send queue', value: fmtMs(q), tone: q > 50 ? 'danger' : undefined, secondary: true },
        { label: 'Offered load', value: fmtKbps((m.cfg.packetBytes * 8 * m.cfg.sendRateHz) / 1000), secondary: true },
        { label: 'Queue drops', value: String(s.queueDropped), tone: s.queueDropped ? 'danger' : undefined, secondary: true },
      ]);
    },
  });

  useEffect(() => {
    const m = model.current;
    m.cfg = cfg;
    m.link.configure(toLinkConfig(cfg));
    if (Math.abs(m.ticker.rateHz - cfg.sendRateHz) > 1e-6) m.ticker.setRate(cfg.sendRateHz, sim.now());
    sim.redraw();
  }, [cfg, sim]);

  const set = <K extends keyof Cfg>(k: K) => (v: Cfg[K]) => setCfg((c) => ({ ...c, [k]: v }));

  const reset = () => {
    model.current = new LinkModel(cfg, seed);
    sim.restart();
  };

  const bw = cfg.bandwidthKbps > 0 ? cfg.bandwidthKbps : Infinity;
  return (
    <SimLayout>
      <SimCanvas
        sim={sim}
        label="Space-time diagram: each packet is a line from the moment A sends it (top lane) to the moment B receives it (bottom lane). Steeper lines are faster. Lost packets end in a cross. Below: the order packets arrived in, and a histogram of one-way latency."
      />
      <ControlBar sim={sim} onReset={reset} compact={compact} />
      <ControlGrid>
        <Slider label="Latency (one way)" value={cfg.latencyMs} min={0} max={300} step={0.5} unit="ms" onChange={set('latencyMs')} />
        <Slider label="Jitter (mean extra delay)" value={cfg.jitterMs} min={0} max={100} step={0.5} unit="ms" onChange={set('jitterMs')} />
        <Slider label="Loss" value={cfg.lossPct} min={0} max={30} step={0.1} format={(v) => `${v.toFixed(1)}%`} onChange={set('lossPct')} />
        <Slider
          label="Bandwidth (uplink)"
          value={bw}
          values={BW_VALUES}
          format={fmtKbps}
          hint={compact ? undefined : 'Drop below the offered load to watch the send queue build up.'}
          onChange={(v) => set('bandwidthKbps')(Number.isFinite(v) ? v : 0)}
        />
        {!compact && (
          <>
            <Slider
              label="Loss burst length"
              value={cfg.burstLength}
              min={1}
              max={10}
              step={0.5}
              format={(v) => (v <= 1 ? 'independent' : `${v} pkts avg`)}
              onChange={set('burstLength')}
            />
            <Slider label="Send rate" value={cfg.sendRateHz} min={5} max={60} step={5} unit="Hz" onChange={set('sendRateHz')} />
            <Slider label="Packet size" value={cfg.packetBytes} min={50} max={1200} step={50} unit="B" onChange={set('packetBytes')} />
            <Slider label="Duplication" value={cfg.duplicatePct} min={0} max={10} step={0.5} format={(v) => `${v}%`} onChange={set('duplicatePct')} />
            <Toggle
              label="Preserve ordering"
              hint="One FIFO path: a delayed packet holds up everything behind it instead of being overtaken."
              checked={cfg.preserveOrder}
              onChange={set('preserveOrder')}
            />
          </>
        )}
      </ControlGrid>
      <Legend
        items={[
          { label: 'delivered', color: 'var(--accent)', shape: 'line' },
          { label: 'waiting in send queue', color: 'var(--muted)', shape: 'line' },
          { label: 'lost', color: 'var(--danger)', shape: 'dash' },
          { label: 'arrived out of order', color: 'var(--warn)', shape: 'line' },
          ...(compact ? [] : [{ label: 'duplicate copy', color: '#8b5cf6', shape: 'line' as const }]),
        ]}
      />
      <StatGrid stats={stats} compact={compact} playing={sim.playing} />
    </SimLayout>
  );
}

// ------------------------------------------------------------------ drawing

/** Visible time window of the space-time diagram, scaled so the slowest packets still fit. */
function windowMs(c: Cfg, queueMs: number): number {
  const need = (c.latencyMs + c.jitterMs * 3 + queueMs) * 3.2;
  const steps = [500, 750, 1000, 1500, 2000, 3000, 4000, 6000];
  return steps.find((s) => s >= need) ?? 6000;
}

const binsScratch = new Array<number>(HIST_BINS).fill(0);

function drawLink(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, now: number, m: LinkModel) {
  const narrow = w < 520;
  const pad = 12;
  const labelW = narrow ? 22 : 78;
  const x0 = pad + labelW;
  const x1 = w - pad;
  const yA = 30;
  const yB = narrow ? 118 : 110;
  const cfg = m.cfg;
  const qms = m.link.queueDelayMs(now);
  const win = windowMs(cfg, qms);
  const tx = (t: number) => x1 - ((now - t) / win) * (x1 - x0);

  // Lanes and time axis
  ctx.fillStyle = alpha(p.accent, 0.04);
  ctx.fillRect(x0, yA, x1 - x0, yB - yA);
  line(ctx, x0, yA, x1, yA, p.accent, 2);
  line(ctx, x0, yB, x1, yB, p.ok, 2);
  text(ctx, p, narrow ? 'A' : 'A sends', pad, yA, { size: 11, weight: 700, color: p.accent });
  text(ctx, p, narrow ? 'B' : 'B receives', pad, yB, { size: 11, weight: 700, color: p.ok });
  const tickStep = win <= 1000 ? 250 : win <= 2000 ? 500 : 1000;
  for (let k = 0; k <= win + 1e-6; k += tickStep) {
    const x = x1 - (k / win) * (x1 - x0);
    line(ctx, x, yB, x, yB + 4, p.muted);
    if (k === 0 || x - x0 > 16)
      text(ctx, p, k === 0 ? 'now' : `−${k >= 1000 ? `${k / 1000} s` : `${k} ms`}`, x, yB + 13, {
        size: 9.5,
        align: k === 0 ? 'right' : 'center',
        color: p.muted,
      });
  }
  text(ctx, p, `${cfg.sendRateHz} packets/s · ${cfg.latencyMs} ms one way${cfg.jitterMs ? ` + ~${cfg.jitterMs} ms jitter` : ''}`, x1, yA - 15, {
    align: 'right',
    size: 10,
    color: p.muted,
  });

  // Packets: a flat segment on A's lane while queued, then a slanted line down to B.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, x1 - x0 + 5, h);
  ctx.clip();
  const span = yB - yA;
  for (const tr of m.traces) {
    const pk = tr.pkt;
    if (pk.arriveAt <= now && tx(Math.max(pk.arriveAt, pk.sentAt)) < x0 - 20) continue;
    const colr = pk.lost ? p.danger : pk.duplicate ? p.violet : tr.reordered ? p.warn : p.accent;
    if (!pk.duplicate) line(ctx, tx(pk.sentAt), yA - 4, tx(pk.sentAt), yA + 1, colr, 1.5);
    if (pk.lossReason === 'queue') {
      cross(ctx, tx(pk.sentAt), yA - 9, 3.5, p.danger, 1.5);
      continue;
    }
    if (pk.serializedAt > pk.sentAt + 0.5) line(ctx, tx(pk.sentAt), yA + 3, tx(Math.min(now, pk.serializedAt)), yA + 3, alpha(p.muted, 0.8), 3);
    if (now < pk.serializedAt) continue;
    const endT = pk.lost ? pk.serializedAt + (pk.arriveAt - pk.serializedAt) * pk.dropAt : pk.arriveAt;
    const tEnd = Math.min(now, endT);
    const f = (tEnd - pk.serializedAt) / Math.max(1e-6, pk.arriveAt - pk.serializedAt);
    const xs = tx(pk.serializedAt);
    const xe = tx(tEnd);
    const ye = yA + span * f;
    line(ctx, xs, yA, xe, ye, colr, 1.75, pk.lost ? [4, 3] : undefined);
    if (pk.lost && now >= endT) cross(ctx, xe, ye, 4.5, p.danger, 2);
    else if (now < endT) fillRound(ctx, xe - 4, ye - 4, 8, 8, 2, colr);
    else {
      ctx.beginPath();
      ctx.arc(xe, ye, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = colr;
      ctx.fill();
    }
  }
  ctx.restore();

  if (qms > 1)
    text(ctx, p, `send queue: ${Math.round(qms)} ms`, x0 + 6, yA + 14, { size: 10, weight: 650, color: qms > 100 ? p.danger : p.muted, bg: p.surface });

  // Arrival order strip
  const stripY = yB + 30;
  const box = narrow ? 24 : 28;
  const stripLabelW = narrow ? 64 : 100;
  const nBoxes = Math.max(4, Math.floor((w - 2 * pad - stripLabelW) / (box + 3)));
  text(ctx, p, narrow ? 'Arrival order' : 'Arrival order at B', pad, stripY + box / 2 - 2, { size: 10.5, color: p.muted, weight: 600 });
  const startX = w - pad - nBoxes * (box + 3) + 3;
  const arr = m.arrivals;
  const first = Math.max(0, arr.length - nBoxes);
  for (let i = first; i < arr.length; i++) {
    const a = arr[i]!;
    const x = startX + (i - first) * (box + 3);
    const prev = i > 0 ? arr[i - 1]! : null;
    const gap = prev && !a.reordered && !prev.reordered && a.id > prev.id + 1;
    const fillC = a.reordered ? p.warnSoft : a.duplicate ? alpha(p.violet, 0.15) : p.surface2;
    const stroke = a.reordered ? p.warn : a.duplicate ? p.violet : p.border;
    fillRound(ctx, x, stripY, box, box - 4, 4, fillC, stroke);
    text(ctx, p, String(a.id % 1000), x + box / 2, stripY + (box - 4) / 2 + 0.5, {
      align: 'center',
      size: narrow ? 9 : 10,
      mono: true,
      color: a.reordered ? p.warn : p.text,
    });
    if (gap) line(ctx, x - 1.5, stripY - 2, x - 1.5, stripY + box - 2, p.danger, 2);
  }

  // Latency histogram
  const hy = stripY + box + 20;
  const hh = h - hy - 22;
  const hx0 = pad + 4;
  const hx1 = w - pad;
  text(ctx, p, 'One-way latency of the last 512 arrivals', hx0, hy - 4, { size: 10.5, color: p.muted, weight: 600 });
  const s = m.link.stats;
  const maxMs = niceMax(Math.max(10, cfg.latencyMs + cfg.jitterMs * 4 + qms, s.p95LatencyMs * 1.15));
  const bins = binsScratch;
  bins.fill(0);
  m.link.forEachLatency((ms) => {
    bins[Math.min(HIST_BINS - 1, Math.floor((ms / maxMs) * HIST_BINS))]!++;
  });
  let peak = 1;
  for (let i = 0; i < HIST_BINS; i++) peak = Math.max(peak, bins[i]!);
  const bw = (hx1 - hx0) / HIST_BINS;
  const baseY = hy + hh;
  line(ctx, hx0, baseY, hx1, baseY, p.border);
  for (let i = 0; i < HIST_BINS; i++) {
    if (!bins[i]) continue;
    const bh = Math.max(2, (bins[i]! / peak) * (hh - 10));
    fillRound(ctx, hx0 + i * bw + 1, baseY - bh, Math.max(1, bw - 2), bh, 2, alpha(p.accent, 0.75));
  }
  for (let k = 0; k <= 4; k++) {
    text(ctx, p, `${Math.round((maxMs * k) / 4)}${k === 4 ? ' ms' : ''}`, hx0 + ((hx1 - hx0) * k) / 4, baseY + 10, {
      align: k === 0 ? 'left' : k === 4 ? 'right' : 'center',
      size: 9.5,
      mono: true,
      color: p.muted,
    });
  }
  if (s.delivered > 0) {
    const markers: [number, string, string][] = [
      [s.avgLatencyMs, 'avg', p.text],
      [s.p95LatencyMs, 'p95', p.warn],
    ];
    let lastX = -100;
    for (const [v, lbl, col] of markers) {
      const x = hx0 + (hx1 - hx0) * Math.min(1, v / maxMs);
      line(ctx, x, hy + 4, x, baseY, col, 1.5, [4, 3]);
      text(ctx, p, lbl, x + 3, x - lastX < 30 ? hy + 22 : hy + 10, { size: 9.5, color: col, weight: 650 });
      lastX = x;
    }
  } else {
    text(ctx, p, 'waiting for packets…', (hx0 + hx1) / 2, hy + hh / 2, { align: 'center', size: 11, color: p.muted });
  }
}

function niceMax(v: number): number {
  const steps = [10, 20, 40, 50, 80, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1500, 2000, 3000, 5000];
  return steps.find((s) => s >= v) ?? Math.ceil(v / 1000) * 1000;
}
