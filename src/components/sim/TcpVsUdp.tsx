import { useEffect, useRef, useState } from 'react';
import { Link, RingBuffer, TcpChannel, Ticker, deriveSeed, type Packet, type TcpAck, type TcpSegment } from '../../lib/netsim';
import type { SimBaseProps } from './types';
import { useSim } from './ui/useSim';
import { ControlBar, ControlGrid, Legend, SimCanvas, SimLayout, Slider, StatGrid, fmtMs, type Stat } from './ui/controls';
import { alpha, circle, cross, fillRound, line, text } from './ui/draw';
import type { Palette } from './ui/theme';

export interface TcpVsUdpProps extends SimBaseProps {
  latencyMs?: number;
  jitterMs?: number;
  lossPct?: number;
  /** Position updates per second. */
  sendRateHz?: number;
}

type Cfg = Required<Omit<TcpVsUdpProps, keyof SimBaseProps>>;

/** One position update: the sender's clock and the dot's angle at that moment. */
interface Update {
  seq: number;
  t: number;
  angle: number;
}

const PERIOD_MS = 4000;
const angleAt = (t: number) => ((t % PERIOD_MS) / PERIOD_MS) * Math.PI * 2 - Math.PI / 2;
const HISTORY_MS = 6000;

class Model {
  ticker: Ticker;
  udpLink: Link<Update>;
  tcpData: Link<TcpSegment<Update>>;
  tcpAcks: Link<TcpAck>;
  tcp: TcpChannel<Update>;
  udpShown: Update | null = null;
  tcpShown: Update | null = null;
  udpLastSeq = -1;
  udpStale = 0;
  /** Samples of display staleness for the chart: [time, udpAge, tcpAge]. */
  history = new RingBuffer<[number, number, number]>(600);
  lastSample = 0;
  maxTcpAge = 0;
  maxUdpAge = 0;
  stallMs = 0;
  private seq = 0;
  bufScratch: number[] = [];

  constructor(
    public cfg: Cfg,
    seed: number,
  ) {
    const lc = { latencyMs: cfg.latencyMs, jitterMs: cfg.jitterMs, lossPct: cfg.lossPct };
    // Both lanes use the same seed for their data path, so they start with the same losses.
    this.udpLink = new Link<Update>(lc, deriveSeed(seed, 'data'));
    this.tcpData = new Link<TcpSegment<Update>>({ ...lc, preserveOrder: false }, deriveSeed(seed, 'data'));
    this.tcpAcks = new Link<TcpAck>(lc, deriveSeed(seed, 'acks'));
    this.tcp = new TcpChannel<Update>(this.tcpData, this.tcpAcks, { segmentBytes: 60 });
    this.ticker = new Ticker(cfg.sendRateHz);
  }

  configure(cfg: Cfg, now: number) {
    this.cfg = cfg;
    const lc = { latencyMs: cfg.latencyMs, jitterMs: cfg.jitterMs, lossPct: cfg.lossPct };
    this.udpLink.configure(lc);
    this.tcpData.configure(lc);
    this.tcpAcks.configure(lc);
    if (Math.abs(this.ticker.rateHz - cfg.sendRateHz) > 1e-6) this.ticker.setRate(cfg.sendRateHz, now);
  }

  step(now: number) {
    this.ticker.update(now, (_i, t) => {
      const u: Update = { seq: this.seq++, t, angle: angleAt(t) };
      this.udpLink.send(u, t, 60);
      this.tcp.send(u, t);
    });
    // UDP: take the newest update, ignore anything older than what we already show.
    for (const p of this.udpLink.deliver(now)) {
      if (p.payload.seq > this.udpLastSeq) {
        this.udpLastSeq = p.payload.seq;
        this.udpShown = p.payload;
      } else this.udpStale++;
    }
    // TCP: the app only ever sees updates in order.
    const rel = this.tcp.update(now);
    if (rel.length) this.tcpShown = rel[rel.length - 1]!;

    const udpAge = this.udpShown ? now - this.udpShown.t : 0;
    const tcpAge = this.tcpShown ? now - this.tcpShown.t : 0;
    if (now > 1000) {
      this.maxUdpAge = Math.max(this.maxUdpAge, udpAge);
      this.maxTcpAge = Math.max(this.maxTcpAge, tcpAge);
    }
    if (tcpAge > this.cfg.latencyMs + 1000 / this.cfg.sendRateHz + this.cfg.jitterMs * 3 + 20) this.stallMs += 1;
    if (now - this.lastSample >= 20) {
      this.lastSample = now;
      this.history.push([now, udpAge, tcpAge]);
    }
  }
}

export default function TcpVsUdp(props: TcpVsUdpProps) {
  const { seed = 1, compact } = props;
  const initial: Cfg = {
    latencyMs: props.latencyMs ?? 50,
    jitterMs: props.jitterMs ?? 2,
    lossPct: props.lossPct ?? 5,
    sendRateHz: props.sendRateHz ?? 20,
  };
  const [cfg, setCfg] = useState<Cfg>(initial);
  const model = useRef<Model>(null as unknown as Model);
  if (!model.current) model.current = new Model(initial, seed);
  const [stats, setStats] = useState<Stat[]>([]);

  const sim = useSim({
    dt: 1,
    stepMs: 1000 / cfg.sendRateHz,
    step: (now) => model.current.step(now),
    draw: (ctx, w, h, p, now) => draw(ctx, w, h, p, now, model.current),
    height: (w) => (w < 520 ? 420 : 380),
    onStats: (now) => {
      const m = model.current;
      const udpAge = m.udpShown ? now - m.udpShown.t : 0;
      const tcpAge = m.tcpShown ? now - m.tcpShown.t : 0;
      setStats([
        { label: 'UDP age now', value: fmtMs(udpAge), tone: 'ok' },
        { label: 'TCP age now', value: fmtMs(tcpAge), tone: tcpAge > m.cfg.latencyMs * 2 + 60 ? 'danger' : undefined },
        { label: 'UDP worst age', value: fmtMs(m.maxUdpAge) },
        { label: 'TCP worst age', value: fmtMs(m.maxTcpAge), tone: m.maxTcpAge > m.maxUdpAge * 1.5 ? 'danger' : undefined },
        { label: 'UDP lost', value: String(m.udpLink.stats.lost), secondary: true },
        { label: 'TCP retransmits', value: String(m.tcp.stats.retransmits), tone: m.tcp.stats.retransmits ? 'warn' : undefined, secondary: true },
        { label: 'TCP stalled', value: `${(m.stallMs / 1000).toFixed(1)} s`, secondary: true },
        { label: 'TCP RTO', value: fmtMs(m.tcp.rto), secondary: true },
      ]);
    },
  });

  useEffect(() => {
    model.current.configure(cfg, sim.now());
    sim.redraw();
  }, [cfg, sim]);

  const set = <K extends keyof Cfg>(k: K) => (v: Cfg[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const reset = () => {
    model.current = new Model(cfg, seed);
    sim.restart();
  };

  return (
    <SimLayout>
      <SimCanvas
        sim={sim}
        label="Two lanes send the same moving-dot position updates over the same lossy link. In the TCP lane a lost segment holds back every newer one in the receive buffer, so the client's dot freezes then jumps. The UDP lane drops the lost update and keeps showing fresh positions. A chart below plots how old the displayed position is in each lane."
      />
      <ControlBar sim={sim} onReset={reset} compact={compact} />
      <ControlGrid>
        <Slider label="Loss" value={cfg.lossPct} min={0} max={20} step={0.5} format={(v) => `${v}%`} onChange={set('lossPct')} />
        <Slider label="Latency (one way)" value={cfg.latencyMs} min={10} max={200} step={5} unit="ms" onChange={set('latencyMs')} />
        {!compact && (
          <>
            <Slider label="Jitter" value={cfg.jitterMs} min={0} max={40} step={1} unit="ms" onChange={set('jitterMs')} />
            <Slider label="Update rate" value={cfg.sendRateHz} min={5} max={60} step={5} unit="Hz" onChange={set('sendRateHz')} />
          </>
        )}
      </ControlGrid>
      <Legend
        items={[
          { label: 'true position (server)', color: 'var(--muted)', shape: 'ring' },
          { label: 'position the client shows', color: 'var(--accent)', shape: 'dot' },
          { label: 'held back behind a lost segment', color: 'var(--warn)', shape: 'square' },
          { label: 'lost / missing', color: 'var(--danger)', shape: 'square' },
        ]}
      />
      <StatGrid stats={stats} compact={compact} playing={sim.playing} />
    </SimLayout>
  );
}

// ------------------------------------------------------------------ drawing

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, now: number, m: Model) {
  const narrow = w < 520;
  const chartH = narrow ? 92 : 96;
  const laneH = (h - chartH - 16) / 2;
  drawLane(ctx, p, now, m, 'tcp', 0, w, laneH, narrow);
  drawLane(ctx, p, now, m, 'udp', laneH, w, laneH, narrow);
  drawChart(ctx, p, now, m, 12, h - chartH - 4, w - 24, chartH);
}

function drawLane(ctx: CanvasRenderingContext2D, p: Palette, now: number, m: Model, kind: 'tcp' | 'udp', y0: number, w: number, _lh: number, narrow: boolean) {
  const pad = 12;
  const isTcp = kind === 'tcp';
  const color = isTcp ? p.violet : p.teal;
  const r = narrow ? 24 : 30;
  const cy = y0 + 28 + r;
  const sx = pad + r + 4;
  const cx = w - pad - r - 4;
  if (!isTcp) line(ctx, pad, y0 + 2, w - pad, y0 + 2, p.border);

  text(ctx, p, isTcp ? 'TCP: reliable + ordered' : 'UDP: unreliable, newest wins', pad, y0 + 14, { size: 12, weight: 700, color });
  const shown = isTcp ? m.tcpShown : m.udpShown;
  const age = shown ? now - shown.t : 0;
  text(ctx, p, shown ? `${narrow ? '' : 'showing data '}${Math.round(age)} ms old` : 'waiting…', w - pad, y0 + 14, {
    align: 'right',
    size: 10.5,
    mono: true,
    color: age > m.cfg.latencyMs * 2 + 60 ? p.danger : p.muted,
  });

  // Server (truth) and client (shown) circles
  const truth = angleAt(now);
  circle(ctx, sx, cy, r, undefined, p.border, 1.5);
  circle(ctx, sx + Math.cos(truth) * r, cy + Math.sin(truth) * r, 6, p.text);
  text(ctx, p, 'server', sx, cy + r + 12, { align: 'center', size: 10, color: p.muted });
  circle(ctx, cx, cy, r, undefined, p.border, 1.5);
  circle(ctx, cx + Math.cos(truth) * r, cy + Math.sin(truth) * r, 6, undefined, p.muted, 1.5);
  if (shown) {
    // Lag arc: from shown to truth
    let a0 = shown.angle;
    let a1 = truth;
    if (a1 < a0) a1 += Math.PI * 2;
    if (a1 - a0 < Math.PI * 1.9) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0, a1);
      ctx.strokeStyle = alpha(age > m.cfg.latencyMs * 2 + 60 ? p.danger : color, 0.6);
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    a0 = shown.angle;
    circle(ctx, cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, 7, p.accent);
  }
  text(ctx, p, 'client view', cx, cy + r + 12, { align: 'center', size: 10, color: p.muted });

  // Wire
  const x0 = sx + r + 12;
  const x1 = cx - r - 12;
  const wy = cy - 8;
  line(ctx, x0, wy, x1, wy, p.border, 1, [3, 4]);
  const flight = isTcp ? m.tcpData.inFlight : m.udpLink.inFlight;
  const boxW = narrow ? 18 : 24;
  for (let i = 0; i < flight.length; i++) {
    const pk = flight[i] as Packet<TcpSegment<Update> | Update>;
    const seq = isTcp ? (pk.payload as TcpSegment<Update>).seq : (pk.payload as Update).seq;
    const rtx = isTcp && (pk.payload as TcpSegment<Update>).rtx > 0;
    const f = (now - pk.sentAt) / Math.max(1e-6, pk.arriveAt - pk.sentAt);
    if (pk.lost && f >= pk.dropAt) {
      const a = 1 - ((f - pk.dropAt) * (pk.arriveAt - pk.sentAt)) / 600;
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      cross(ctx, x0 + (x1 - x0) * pk.dropAt, wy, 5, p.danger, 2);
      ctx.globalAlpha = 1;
      continue;
    }
    const x = x0 + (x1 - x0) * Math.min(1, f);
    fillRound(ctx, x - boxW / 2, wy - 7, boxW, 14, 3, rtx ? p.warn : pk.lost ? p.danger : color);
    if (!narrow || seq < 100) text(ctx, p, String(seq % 1000), x, wy + 0.5, { align: 'center', size: 9, mono: true, color: p.surface, weight: 700 });
  }
  if (isTcp) {
    const acks = m.tcpAcks.inFlight;
    for (let i = 0; i < acks.length; i++) {
      const pk = acks[i]!;
      const f = (now - pk.sentAt) / Math.max(1e-6, pk.arriveAt - pk.sentAt);
      if (pk.lost && f >= pk.dropAt) continue;
      const x = x1 - (x1 - x0) * Math.min(1, f);
      circle(ctx, x, wy + 13, 3, alpha(p.muted, 0.8));
    }
    // Right end of the wire (where ACKs start), so it never collides with the receive-buffer caption on the left.
    text(ctx, p, narrow ? '← ACKs' : '← cumulative ACKs', x1, wy + 13, { size: 9, color: p.muted, align: 'right' });
    // Retransmission flashes
    for (const e of m.tcp.events) {
      const age = now - e.time;
      if (age < 0 || age > 900) continue;
      ctx.globalAlpha = 1 - age / 900;
      text(ctx, p, e.kind === 'timeout' ? `timeout → resend #${e.seq}` : `resend #${e.seq}`, x0, wy - 18, {
        size: 10,
        weight: 650,
        color: p.warn,
      });
      ctx.globalAlpha = 1;
    }

    // Receive buffer
    const buf = m.tcp.bufferedSeqs(m.bufScratch);
    const by = cy + r - 4;
    const bw = narrow ? 22 : 28;
    const startX = x0;
    if (buf.length) {
      const maxBoxes = Math.max(1, Math.floor((x1 - x0 - (narrow ? 60 : 110)) / (bw + 3)));
      fillRound(ctx, startX, by - 8, bw, 16, 3, p.dangerSoft, p.danger);
      text(ctx, p, `#${m.tcp.waitingFor % 1000}`, startX + bw / 2, by + 0.5, { align: 'center', size: 9, mono: true, color: p.danger, weight: 700 });
      for (let i = 0; i < Math.min(buf.length, maxBoxes); i++) {
        const bx = startX + (i + 1) * (bw + 3);
        fillRound(ctx, bx, by - 8, bw, 16, 3, p.warnSoft, p.warn);
        text(ctx, p, String(buf[i]! % 1000), bx + bw / 2, by + 0.5, { align: 'center', size: 9, mono: true, color: p.warn, weight: 700 });
      }
      const after = startX + (Math.min(buf.length, maxBoxes) + 1) * (bw + 3) + 2;
      text(ctx, p, narrow ? `${buf.length} held` : `${buf.length} arrived, held back`, after, by, { size: 9.5, color: p.warn, weight: 600 });
      text(ctx, p, narrow ? 'waiting for' : 'receive buffer: waiting for', startX, by - 15, { size: 9.5, color: p.muted });
    } else {
      text(ctx, p, 'receive buffer empty: delivering in order', startX, by, { size: 9.5, color: p.muted });
    }
  } else {
    const by = cy + r - 4;
    text(ctx, p, `lost updates are skipped (${m.udpLink.stats.lost}); late ones ignored (${m.udpStale})`, x0, by, { size: 9.5, color: p.muted });
  }
}

function drawChart(ctx: CanvasRenderingContext2D, p: Palette, now: number, m: Model, x: number, y: number, w: number, h: number) {
  fillRound(ctx, x, y, w, h, 6, p.surface2);
  text(ctx, p, w < 420 ? 'Age shown (ms), last 6 s' : 'Age of what the client shows (ms), last 6 s', x + 8, y + 11, { size: 10, weight: 650, color: p.muted });
  const top = y + 20;
  const bottom = y + h - 6;
  let maxAge = 100;
  m.history.forEach(([t, a, b]) => {
    if (now - t <= HISTORY_MS) maxAge = Math.max(maxAge, a, b);
  });
  maxAge = Math.ceil(maxAge / 100) * 100;
  text(ctx, p, `${maxAge}`, x + w - 6, top + 2, { align: 'right', size: 9, mono: true, color: p.muted });
  line(ctx, x + 6, bottom, x + w - 6, bottom, p.border);
  const plot = (idx: 1 | 2, color: string) => {
    ctx.beginPath();
    let started = false;
    m.history.forEach((s) => {
      const age = now - s[0];
      if (age > HISTORY_MS) return;
      const px = x + w - 6 - (age / HISTORY_MS) * (w - 12);
      const py = bottom - (s[idx] / maxAge) * (bottom - top);
      if (!started) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
      started = true;
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.75;
    ctx.stroke();
  };
  plot(2, p.violet);
  plot(1, p.teal);
  const lx = x + w - 6;
  text(ctx, p, 'UDP', lx - 44, y + 11, { size: 10, weight: 700, color: p.teal, align: 'right' });
  text(ctx, p, 'TCP', lx - 14, y + 11, { size: 10, weight: 700, color: p.violet, align: 'right' });
}
