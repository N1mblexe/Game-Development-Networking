import { useEffect, useRef, useState } from 'react';
import { InputHistory, InterpolationBuffer, Link, Ticker, deriveSeed, dist, lerpV, type Packet, type Vec2 } from '../../lib/netsim';
import type { SimBaseProps } from './types';
import { useSim } from './ui/useSim';
import { Button, ControlBar, ControlGrid, Legend, Segmented, SimCanvas, SimLayout, Slider, StatGrid, Toggle, type Stat } from './ui/controls';
import { alpha, circle, cross, fillRound, line, text } from './ui/draw';
import type { Palette } from './ui/theme';

export type Authority = 'client' | 'server';

export interface AuthorityCheatProps extends SimBaseProps {
  /** Who owns player A's position and gold. */
  authority?: Authority;
  rttMs?: number;
  /** Trigger the three cheats on a timer until the user presses a cheat button. */
  autoCheat?: boolean;
}

// ------------------------------------------------------------------ world (metres)

const W = 16;
const H = 8;
const SPEED = 4;
const HACK_MULT = 3;
const HACK_MS = 3000;
const TICK_HZ = 30;
const DT = 1 / TICK_HZ;
const SNAPSHOT_HZ = 20;
const INTERP_MS = 100;
/** The server buffers at most this many unprocessed inputs per client. */
const MAX_INPUT_QUEUE = 3;
const START_GOLD = 120;
const ROUTE: Vec2[] = [
  { x: 2.5, y: 2 },
  { x: 13.5, y: 2 },
  { x: 13.5, y: 6 },
  { x: 2.5, y: 6 },
];
const VAULT = { x: 6.5, y: 3.1, w: 3, h: 1.8 };
const VAULT_C: Vec2 = { x: VAULT.x + VAULT.w / 2, y: VAULT.y + VAULT.h / 2 };
const B_POS: Vec2 = { x: 15, y: 4 };

type CheatKind = 'speed' | 'teleport' | 'gold';

/** Client → server. Client authority sends state; server authority sends inputs only. */
type UpMsg =
  | { kind: 'state'; pos: Vec2; gold: number; cheat?: CheatKind }
  | { kind: 'inputs'; inputs: { seq: number; dir: Vec2 }[]; cheat?: CheatKind }
  | { kind: 'forged'; what: 'teleport' | 'gold'; pos?: Vec2; amount?: number; cheat: CheatKind };
/** Server → client A (server authority only). */
interface AckMsg {
  pos: Vec2;
  ack: number;
  gold: number;
}
/** Server → other players. */
interface SnapMsg {
  t: number;
  pos: Vec2;
  gold: number;
  cheat?: CheatKind;
}

export interface LogEntry {
  id: number;
  t: number;
  who: 'client' | 'server' | 'B';
  tone: 'danger' | 'ok' | 'muted' | 'warn';
  text: string;
}

const f1 = (v: number) => v.toFixed(1);
const fmtPos = (p: Vec2) => `(${f1(p.x)}, ${f1(p.y)})`;

function toward(p: Vec2, q: Vec2, maxStep: number): Vec2 {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d <= maxStep || d === 0) return { ...q };
  return { x: p.x + (dx / d) * maxStep, y: p.y + (dy / d) * maxStep };
}

/** The (only) server-side movement rule: one input moves at most SPEED × DT. */
function applyInput(p: Vec2, dir: Vec2): Vec2 {
  const l = Math.hypot(dir.x, dir.y);
  const k = l > 1 ? 1 / l : 1; // clamp: a hacked client could send a longer vector
  return { x: Math.min(W, Math.max(0, p.x + dir.x * k * SPEED * DT)), y: Math.min(H, Math.max(0, p.y + dir.y * k * SPEED * DT)) };
}

class Model {
  up: Link<UpMsg>;
  down: Link<AckMsg>;
  toB: Link<SnapMsg>;
  clientTick = new Ticker(TICK_HZ);
  serverTick = new Ticker(TICK_HZ, 7);
  snapTick = new Ticker(SNAPSHOT_HZ, 13);

  // client A (possibly hacked)
  aPos: Vec2 = { ...ROUTE[0]! };
  aGold = START_GOLD;
  wp = 1;
  hackUntil = -1;
  /** Client authority: after teleporting, A loots the vault for a moment before walking on. */
  idleUntil = -1;
  inputs = new InputHistory<Vec2>();
  /** Visual-only markers on A's screen (snap-back after a rejected cheat). */
  aGhost: { at: number; pos: Vec2; label: string } | null = null;
  aGoldFlash: { at: number } | null = null;

  // server
  sPos: Vec2 = { ...ROUTE[0]! };
  sGold = START_GOLD;
  sAck = 0;
  queue: { seq: number; dir: Vec2 }[] = [];
  sGhost: { at: number; pos: Vec2; label: string } | null = null;
  droppedInputs = 0;
  dropBurst: { start: number; lastAt: number; n: number } | null = null;
  lastStateAt = -1;
  lastStatePos: Vec2 | null = null;

  // player B
  bView: InterpolationBuffer<Vec2>;
  bGold = START_GOLD;
  bTrail: { t: number; pos: Vec2 }[] = [];

  log: LogEntry[] = [];
  private logId = 1;
  tried = 0;
  worked = 0;
  rejected = 0;
  autoNext = 0;
  private autoPlan: [number, CheatKind][] = [
    [1500, 'speed'],
    [6000, 'teleport'],
    [9000, 'gold'],
  ];

  constructor(
    readonly authority: Authority,
    public rttMs: number,
    public autoCheat: boolean,
    seed: number,
  ) {
    const cfg = { latencyMs: rttMs / 2, jitterMs: 2 };
    this.up = new Link<UpMsg>(cfg, deriveSeed(seed, 'up'));
    this.down = new Link<AckMsg>(cfg, deriveSeed(seed, 'down'));
    this.toB = new Link<SnapMsg>(cfg, deriveSeed(seed, 'toB'));
    this.bView = new InterpolationBuffer<Vec2>(INTERP_MS, lerpV);
  }

  configure(rttMs: number) {
    this.rttMs = rttMs;
    for (const l of [this.up, this.down, this.toB] as Link<unknown>[]) l.configure({ latencyMs: rttMs / 2 });
  }

  private say(t: number, who: LogEntry['who'], tone: LogEntry['tone'], s: string) {
    this.log.unshift({ id: this.logId++, t, who, tone, text: s });
    if (this.log.length > 30) this.log.pop();
  }

  hacking(now: number) {
    return now < this.hackUntil;
  }

  // ---------------------------------------------------------------- cheats (client side)

  cheat(kind: CheatKind, now: number) {
    this.tried++;
    const server = this.authority === 'server';
    if (kind === 'speed') {
      this.hackUntil = now + HACK_MS;
      this.say(
        now,
        'client',
        'warn',
        server
          ? `Speed hack on: A's game clock now runs ${HACK_MULT}× fast, so it produces ${HACK_MULT} movement inputs every ${Math.round(1000 / TICK_HZ)} ms tick.`
          : `Speed hack on: A's client moves itself ${HACK_MULT}× faster (${SPEED * HACK_MULT} m/s) and reports the result.`,
      );
    } else if (kind === 'teleport') {
      const from = { ...this.aPos };
      this.aPos = { ...VAULT_C };
      if (server) {
        this.aGhost = { at: now, pos: { ...VAULT_C }, label: 'teleported (locally)' };
        this.up.send({ kind: 'forged', what: 'teleport', pos: { ...VAULT_C }, cheat: 'teleport' }, now, 40);
        this.say(now, 'client', 'warn', `Teleport: A writes ${fmtPos(VAULT_C)} (inside the locked vault) into its own memory and sends a forged "set my position" message.`);
      } else {
        this.idleUntil = now + 1500;
        this.say(now, 'client', 'warn', `Teleport: A's client sets its position from ${fmtPos(from)} to ${fmtPos(VAULT_C)}, inside the locked vault.`);
      }
    } else {
      this.aGold = 9999;
      if (server) {
        this.aGoldFlash = { at: now };
        this.up.send({ kind: 'forged', what: 'gold', amount: 9999, cheat: 'gold' }, now, 36);
        this.say(now, 'client', 'warn', 'Give 9999 gold: A edits its local gold to 9999 and sends a forged "add gold" message.');
      } else {
        this.say(now, 'client', 'warn', "Give 9999 gold: A's client sets gold = 9999 in the state it reports.");
      }
    }
  }

  // ---------------------------------------------------------------- simulation

  step(now: number) {
    if (this.autoCheat && this.autoNext < this.autoPlan.length && now >= this.autoPlan[this.autoNext]![0]) {
      this.cheat(this.autoPlan[this.autoNext]![1], now);
      this.autoNext++;
    }
    if (this.authority === 'client') this.stepClientAuthority(now);
    else this.stepServerAuthority(now);

    // Server → B snapshots (both models: the server relays what it believes)
    this.snapTick.update(now, (_i, t) => this.toB.send({ t, pos: { ...this.sPos }, gold: this.sGold }, t, 40));
    for (const pk of this.toB.deliver(now)) {
      const s = pk.payload;
      this.bView.add(s.t, s.pos);
      if (s.gold !== this.bGold) {
        if (s.gold > 5000) this.say(now, 'B', 'danger', `Player B's scoreboard now shows A with ${s.gold} gold.`);
        this.bGold = s.gold;
      }
    }
    this.bView.prune(now);
    if (now % 50 === 0) {
      const v = this.bView.sample(now).state;
      if (v) {
        this.bTrail.push({ t: now, pos: v });
        while (this.bTrail.length && this.bTrail[0]!.t < now - 500) this.bTrail.shift();
      }
    }
  }

  /** Speed of A as rendered on B's screen, averaged over the last 0.5 s. */
  speedSeenByB(): number {
    const tr = this.bTrail;
    if (tr.length < 2) return 0;
    let d = 0;
    for (let i = 1; i < tr.length; i++) d += Math.min(1.5, dist(tr[i - 1]!.pos, tr[i]!.pos)); // ignore teleports
    return d / ((tr[tr.length - 1]!.t - tr[0]!.t) / 1000);
  }

  /** Client authority: A simulates itself and the server believes whatever it reports. */
  private stepClientAuthority(now: number) {
    this.clientTick.update(now, (_i, t) => {
      const mult = this.hacking(t) ? HACK_MULT : 1;
      if (t >= this.idleUntil) this.walk(SPEED * DT * mult);
      const cheat = this.hacking(t) ? 'speed' : undefined;
      this.up.send({ kind: 'state', pos: { ...this.aPos }, gold: this.aGold, cheat }, t, 28 + 16);
    });
    for (const pk of this.up.deliver(now)) {
      const m = pk.payload;
      if (m.kind !== 'state') continue;
      const prev = this.lastStatePos;
      const dtMs = this.lastStateAt >= 0 ? pk.sentAt - this.lastStateAt : 0;
      if (prev && dtMs > 0) {
        const moved = dist(prev, m.pos);
        const speed = moved / (dtMs / 1000);
        if (moved > 2) {
          this.worked++;
          this.say(now, 'server', 'danger', `Accepted: A moved ${f1(moved)} m in ${Math.round(dtMs)} ms and is now inside the vault. The server stores it without checking, and relays it to everyone.`);
        } else if (speed > SPEED * 1.5 && !this.reportedSpeed(now)) {
          this.worked++;
          this.say(now, 'server', 'danger', `Accepted: A is moving at ${f1(speed)} m/s (max is ${SPEED}). The server does not check, so the new position is relayed to everyone.`);
        }
      }
      if (m.gold !== this.sGold) {
        this.worked++;
        this.say(now, 'server', 'danger', `Accepted: A reports ${m.gold} gold (was ${this.sGold}). The client owns this value, so the server simply overwrites it.`);
      }
      this.sPos = m.pos;
      this.sGold = m.gold;
      this.lastStatePos = m.pos;
      this.lastStateAt = pk.sentAt;
    }
  }

  private speedReportedAt = -1e9;
  private reportedSpeed(now: number): boolean {
    if (now - this.speedReportedAt < HACK_MS + 500) return true;
    this.speedReportedAt = now;
    return false;
  }

  /** Server authority: A sends inputs, the server simulates and validates everything. */
  private stepServerAuthority(now: number) {
    // Client: produce inputs (several per tick when the clock is hacked), predict, send.
    this.clientTick.update(now, (_i, t) => {
      const n = this.hacking(t) ? HACK_MULT : 1;
      const batch: { seq: number; dir: Vec2 }[] = [];
      for (let k = 0; k < n; k++) {
        const dir = this.dirToWaypoint();
        const seq = this.inputs.push(dir);
        this.aPos = applyInput(this.aPos, dir);
        this.advanceWaypoint();
        batch.push({ seq, dir });
      }
      this.up.send({ kind: 'inputs', inputs: batch, cheat: n > 1 ? 'speed' : undefined }, t, 28 + 8 + batch.length * 3);
    });

    // Server: validate and buffer what arrives.
    for (const pk of this.up.deliver(now)) {
      const m = pk.payload;
      if (m.kind === 'inputs') {
        for (const inp of m.inputs) {
          if (inp.seq <= this.sAck || this.queue.some((q) => q.seq === inp.seq)) continue;
          if (this.queue.length >= MAX_INPUT_QUEUE) {
            this.droppedInputs++;
            this.noteDrop(now);
            this.sAck = Math.max(this.sAck, inp.seq); // acknowledged, but never applied
            continue;
          }
          this.queue.push(inp);
        }
      } else if (m.kind === 'forged') {
        this.rejected++;
        if (m.what === 'teleport') {
          this.sGhost = { at: now, pos: m.pos ?? VAULT_C, label: 'rejected' };
          this.say(now, 'server', 'ok', `Rejected "set position ${fmtPos(m.pos ?? VAULT_C)}": positions are server-owned and clients may only send inputs. A stays at ${fmtPos(this.sPos)}; its next update snaps A back.`);
        } else {
          this.say(now, 'server', 'ok', `Rejected "add ${m.amount} gold": gold only changes through server-side game logic (pickups, rewards, purchases). A still has ${this.sGold} gold.`);
        }
      } else {
        this.rejected++;
        this.say(now, 'server', 'ok', 'Rejected a state message: this server does not accept client positions.');
      }
    }

    // Server tick: apply at most one input per tick, then tell A where it really is.
    this.serverTick.update(now, (_i, t) => {
      const inp = this.queue.shift();
      if (inp) {
        this.sPos = applyInput(this.sPos, inp.dir);
        this.sAck = Math.max(this.sAck, inp.seq);
      }
      this.down.send({ pos: { ...this.sPos }, ack: this.sAck, gold: this.sGold }, t, 28 + 16);
    });

    // Client: reconcile with the server's answer (start from it, replay unacknowledged inputs).
    for (const pk of this.down.deliver(now)) {
      const s = pk.payload;
      this.inputs.ack(s.ack);
      let p = { ...s.pos };
      for (const e of this.inputs.pending) p = applyInput(p, e.input);
      this.aPos = p;
      this.aGold = s.gold;
    }
    this.flushDrops(now);
  }

  /** One "too many inputs" message when a burst of extra inputs starts, one summary when it ends. */
  private noteDrop(now: number) {
    if (!this.dropBurst) {
      this.dropBurst = { start: now, lastAt: now, n: 0 };
      this.rejected++;
      this.say(now, 'server', 'ok', `Too many inputs: A sends ${HACK_MULT} per ${Math.round(1000 / TICK_HZ)} ms tick. The server simulates one input per tick and buffers at most ${MAX_INPUT_QUEUE}; the extras are discarded.`);
    }
    this.dropBurst.n++;
    this.dropBurst.lastAt = now;
  }

  private flushDrops(now: number) {
    const b = this.dropBurst;
    if (!b || now - b.lastAt < 300) return;
    this.dropBurst = null;
    this.say(now, 'server', 'ok', `Discarded ${b.n} extra inputs over ${((b.lastAt - b.start) / 1000).toFixed(1)} s. On the server, and so for everyone else, A never moved faster than ${SPEED} m/s.`);
  }

  private dirToWaypoint(): Vec2 {
    const q = ROUTE[this.wp]!;
    const dx = q.x - this.aPos.x;
    const dy = q.y - this.aPos.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return { x: 0, y: 0 };
    // Slow down on the last step so the corner is hit exactly.
    const k = Math.min(1, d / (SPEED * DT));
    return { x: (dx / d) * k, y: (dy / d) * k };
  }

  private advanceWaypoint() {
    if (dist(this.aPos, ROUTE[this.wp]!) < 1e-3) this.wp = (this.wp + 1) % ROUTE.length;
  }

  /** Client-authority movement: walk the route, `budget` metres this tick. */
  private walk(budget: number) {
    let left = budget;
    for (let guard = 0; guard < 8 && left > 1e-9; guard++) {
      const q = ROUTE[this.wp]!;
      const d = dist(this.aPos, q);
      if (d <= left) {
        this.aPos = { ...q };
        left -= d;
        this.wp = (this.wp + 1) % ROUTE.length;
      } else {
        this.aPos = toward(this.aPos, q, left);
        left = 0;
      }
    }
  }
}

// ------------------------------------------------------------------ component

export default function AuthorityCheat(props: AuthorityCheatProps) {
  const { seed = 1, compact } = props;
  const [authority, setAuthority] = useState<Authority>(props.authority ?? 'client');
  const [rtt, setRtt] = useState(props.rttMs ?? 100);
  const [autoCheat, setAutoCheat] = useState(props.autoCheat ?? true);
  const model = useRef<Model>(null as unknown as Model);
  if (!model.current) model.current = new Model(authority, rtt, autoCheat, seed);
  const [stats, setStats] = useState<Stat[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [hacking, setHacking] = useState(false);

  const sim = useSim({
    dt: 1,
    stepMs: 1000 / TICK_HZ,
    step: (now) => model.current.step(now),
    draw: (ctx, w, h, p, now) => draw(ctx, w, h, p, now, model.current),
    height: (w) => layout(w).height,
    onStats: (now) => {
      const m = model.current;
      const v = m.speedSeenByB();
      setLog((prev) => (prev[0]?.id === m.log[0]?.id ? prev : [...m.log]));
      setHacking(m.hacking(now));
      setStats([
        { label: "A's speed (B sees)", value: `${f1(v)} m/s`, tone: v > SPEED * 1.3 ? 'danger' : undefined },
        { label: "A's gold (B sees)", value: String(m.bGold), tone: m.bGold > 5000 ? 'danger' : undefined },
        { label: 'Cheats tried', value: String(m.tried) },
        { label: 'Cheats that worked', value: String(m.worked), tone: m.worked ? 'danger' : m.tried ? 'ok' : undefined },
        { label: 'Messages rejected', value: String(m.rejected), tone: m.rejected ? 'ok' : undefined, secondary: true },
        { label: 'Inputs discarded', value: String(m.droppedInputs), secondary: true },
      ]);
    },
  });

  useEffect(() => {
    model.current.configure(rtt);
    sim.redraw();
  }, [rtt, sim]);
  useEffect(() => {
    model.current.autoCheat = autoCheat;
  }, [autoCheat]);

  const rebuild = (a: Authority = authority) => {
    model.current = new Model(a, rtt, autoCheat, seed);
    setLog([]);
    sim.restart();
  };

  const changeAuthority = (a: Authority) => {
    setAuthority(a);
    rebuild(a);
  };

  const doCheat = (kind: CheatKind) => {
    const m = model.current;
    if (autoCheat) setAutoCheat(false);
    m.autoCheat = false;
    m.cheat(kind, sim.now());
    setLog([...m.log]);
    if (!sim.playing) sim.play();
  };

  const whoLabel = { client: 'Client A', server: 'Server', B: 'Player B' } as const;
  const toneCls = { danger: 'text-danger', ok: 'text-ok', warn: '', muted: 'text-muted' } as const;
  const shown = log.slice(0, compact ? 4 : 7);

  return (
    <SimLayout>
      <SimCanvas
        sim={sim}
        label="Three views of the same game: the cheater's screen (client A), the server, and another player's screen (player B). Player A walks a loop around a locked vault. Dots between the views are packets."
      />
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Cheats">
        <span className="text-sm font-semibold text-danger">Cheat:</span>
        <Button onClick={() => doCheat('speed')} disabled={hacking} label="Speed hack for 3 seconds">
          Speed hack
        </Button>
        <Button onClick={() => doCheat('teleport')} label="Teleport into the vault">
          Teleport
        </Button>
        <Button onClick={() => doCheat('gold')} label="Give 9999 gold">
          Give 9999 gold
        </Button>
      </div>
      <ControlBar sim={sim} onReset={() => rebuild()} compact={compact} />
      <Segmented
        label="Who is authoritative over player A?"
        value={authority}
        options={[
          { value: 'client', label: 'Client authority', title: 'A sends its own position and gold; the server trusts it' },
          { value: 'server', label: 'Server authority', title: 'A sends inputs; the server simulates and validates' },
        ]}
        onChange={changeAuthority}
      />
      {!compact && (
        <ControlGrid>
          <Slider label="Round-trip time" value={rtt} min={20} max={300} step={10} unit="ms" onChange={setRtt} />
          <Toggle label="Auto-cheat" checked={autoCheat} onChange={setAutoCheat} hint="Runs each cheat once on a timer. Pressing a cheat button turns this off." />
        </ControlGrid>
      )}
      <div className="rounded-lg border border-border bg-surface-2 p-2.5">
        <div className="mb-1 text-[0.7rem] font-medium uppercase tracking-wide text-muted">Message log (newest first)</div>
        <ol role="log" aria-live="polite" aria-relevant="additions" className="space-y-1 text-sm">
          {shown.length === 0 && <li className="text-muted">Nothing yet. Press a cheat button.</li>}
          {shown.map((e) => (
            <li key={e.id} className="flex gap-2">
              <span className="w-12 shrink-0 font-mono text-xs leading-5 text-muted tabular-nums">{(e.t / 1000).toFixed(1)} s</span>
              <span className="min-w-0">
                <span className={`font-semibold ${e.who === 'client' ? 'text-accent' : e.who === 'B' ? 'text-muted' : 'text-text'}`}>{whoLabel[e.who]}:</span>{' '}
                <span className={toneCls[e.tone]}>{e.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <Legend
        items={[
          { label: 'player A (the cheater)', color: 'var(--accent)' },
          { label: 'player B', color: 'var(--muted)' },
          { label: 'packet', color: 'var(--accent)', shape: 'square' },
          { label: 'cheat packet', color: 'var(--danger)', shape: 'square' },
        ]}
      />
      <StatGrid stats={stats} compact={compact} playing={sim.playing} />
    </SimLayout>
  );
}

// ------------------------------------------------------------------ drawing

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function layout(w: number) {
  const pad = 8;
  const wide = w >= 680;
  const title = 18;
  if (wide) {
    const gap = 40;
    const pw = (w - 2 * pad - 2 * gap) / 3;
    const ph = (pw * H) / W;
    const y = title + 6;
    const boxes: Box[] = [0, 1, 2].map((i) => ({ x: pad + i * (pw + gap), y, w: pw, h: ph }));
    return { wide, boxes, height: Math.round(y + ph + 10) };
  }
  const gap = 34;
  const pw = w - 2 * pad;
  const ph = (pw * H) / W;
  const boxes: Box[] = [0, 1, 2].map((i) => ({ x: pad, y: title + 4 + i * (ph + gap + title), w: pw, h: ph }));
  return { wide, boxes, height: Math.round(boxes[2]!.y + ph + 10) };
}

function draw(ctx: CanvasRenderingContext2D, w: number, _h: number, p: Palette, now: number, m: Model) {
  const L = layout(w);
  const [ba, bs, bb] = L.boxes as [Box, Box, Box];
  const server = m.authority === 'server';
  const hack = m.hacking(now);

  // A's screen
  drawArena(ctx, p, ba, server ? 'Cheater: client A (predicts)' : 'Cheater: client A (authoritative)', p.accent);
  if (hack) text(ctx, p, `SPEED HACK ${HACK_MULT}×`, ba.x + ba.w - 6, ba.y + 12, { align: 'right', size: 9.5, weight: 800, color: p.danger, bg: p.dangerSoft });
  if (m.aGhost && now - m.aGhost.at < 1500) ghost(ctx, p, ba, m.aGhost.pos, m.aGhost.label, p.warn, now - m.aGhost.at);
  avatar(ctx, p, ba, B_POS, p.muted, 'B');
  avatar(ctx, p, ba, m.aPos, p.accent, 'A', hack ? p.danger : undefined);
  const flash = m.aGoldFlash && now - m.aGoldFlash.at < 1500;
  hud(ctx, p, ba, flash ? `gold ${m.aGold} (server's value)` : `gold ${m.aGold}`, m.aGold > 5000 ? p.danger : p.text);

  // Server
  drawArena(ctx, p, bs, server ? 'Server (authoritative)' : 'Server (trusts the client)', p.text);
  if (m.sGhost && now - m.sGhost.at < 1800) ghost(ctx, p, bs, m.sGhost.pos, m.sGhost.label, p.ok, now - m.sGhost.at);
  avatar(ctx, p, bs, B_POS, p.muted, 'B');
  avatar(ctx, p, bs, m.sPos, p.accent, 'A');
  hud(ctx, p, bs, `A: gold ${m.sGold}`, m.sGold > 5000 ? p.danger : p.text);
  if (server && m.queue.length)
    text(ctx, p, `input buffer ${m.queue.length}/${MAX_INPUT_QUEUE}`, bs.x + 6, bs.y + bs.h - 10, { size: 9, mono: true, color: m.queue.length >= MAX_INPUT_QUEUE ? p.warn : p.muted });

  // B's screen
  drawArena(ctx, p, bb, "Player B's screen", p.muted);
  const bv = m.bView.sample(now).state;
  avatar(ctx, p, bb, B_POS, p.muted, 'B (me)');
  if (bv) avatar(ctx, p, bb, bv, p.accent, 'A', inRect(bv, VAULT) || m.speedSeenByB() > SPEED * 1.3 ? p.danger : undefined);
  hud(ctx, p, bb, `A: gold ${m.bGold}`, m.bGold > 5000 ? p.danger : p.text);

  // Wires and packets
  wire(ctx, p, L.wide, ba, bs, now, m.up.inFlight, m.down.inFlight, server ? 'inputs' : 'state', server ? 'corrections' : '');
  wire(ctx, p, L.wide, bs, bb, now, m.toB.inFlight, [], 'snapshots', '');
}

const inRect = (q: Vec2, r: { x: number; y: number; w: number; h: number }) => q.x > r.x && q.x < r.x + r.w && q.y > r.y && q.y < r.y + r.h;

function drawArena(ctx: CanvasRenderingContext2D, p: Palette, b: Box, title: string, titleColor: string) {
  text(ctx, p, title, b.x + 2, b.y - 9, { size: 11, weight: 700, color: titleColor });
  fillRound(ctx, b.x, b.y, b.w, b.h, 8, p.surface2, p.border);
  const s = b.w / W;
  // route
  ctx.beginPath();
  ROUTE.forEach((q, i) => (i ? ctx.lineTo(b.x + q.x * s, b.y + q.y * s) : ctx.moveTo(b.x + q.x * s, b.y + q.y * s)));
  ctx.closePath();
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = alpha(p.muted, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
  // vault
  const vx = b.x + VAULT.x * s;
  const vy = b.y + VAULT.y * s;
  fillRound(ctx, vx, vy, VAULT.w * s, VAULT.h * s, 4, alpha(p.warn, 0.1), p.warn);
  text(ctx, p, 'locked vault', vx + (VAULT.w * s) / 2, vy + (VAULT.h * s) / 2, { align: 'center', size: Math.max(8.5, Math.min(10, s * 0.6)), color: p.warn, weight: 600 });
}

function avatar(ctx: CanvasRenderingContext2D, p: Palette, b: Box, q: Vec2, color: string, label: string, ring?: string) {
  const s = b.w / W;
  const x = b.x + q.x * s;
  const y = b.y + q.y * s;
  const r = Math.max(5, s * 0.42);
  if (ring) circle(ctx, x, y, r + 4, alpha(ring, 0.15), ring, 1.5);
  circle(ctx, x, y, r, color, p.surface, 2);
  text(ctx, p, label, x, y - r - 7, { align: 'center', size: 9.5, weight: 700, color });
}

function ghost(ctx: CanvasRenderingContext2D, p: Palette, b: Box, q: Vec2, label: string, color: string, age: number) {
  const s = b.w / W;
  const x = b.x + q.x * s;
  const y = b.y + q.y * s;
  ctx.globalAlpha = Math.max(0, 1 - age / 1800);
  ctx.setLineDash([3, 3]);
  circle(ctx, x, y, Math.max(5, s * 0.42), undefined, color, 1.5);
  ctx.setLineDash([]);
  cross(ctx, x, y, 4, color, 2);
  text(ctx, p, label, x, y + Math.max(5, s * 0.42) + 9, { align: 'center', size: 9, weight: 700, color, bg: p.surface });
  ctx.globalAlpha = 1;
}

function hud(ctx: CanvasRenderingContext2D, p: Palette, b: Box, s: string, color: string) {
  text(ctx, p, s, b.x + 6, b.y + 12, { size: 9.5, mono: true, weight: 650, color, bg: alpha(p.surface, 0.9) });
}

type AnyPacket = Packet<{ cheat?: CheatKind } | object>;

/** Packets travelling from box `a` to box `b` (forward) and back (backward). */
function wire(ctx: CanvasRenderingContext2D, p: Palette, wide: boolean, a: Box, b: Box, now: number, fwd: readonly AnyPacket[], back: readonly AnyPacket[], fwdLabel: string, backLabel: string) {
  // Endpoints of the wire in the gap between the boxes.
  const off = back.length || backLabel ? 6 : 0;
  const seg = (dir: 1 | -1) =>
    wide
      ? { x1: a.x + a.w + 3, y1: a.y + a.h / 2 - off * dir, x2: b.x - 3, y2: a.y + a.h / 2 - off * dir }
      : { x1: a.x + a.w / 2 + off * dir, y1: a.y + a.h + 3, x2: a.x + a.w / 2 + off * dir, y2: b.y - 21 };
  const f = seg(1);
  line(ctx, f.x1, f.y1, f.x2, f.y2, alpha(p.muted, 0.35), 1);
  if (wide) text(ctx, p, fwdLabel, (f.x1 + f.x2) / 2, f.y1 - 9, { align: 'center', size: 8.5, color: p.muted });
  else text(ctx, p, fwdLabel, f.x1 - 6, (f.y1 + f.y2) / 2, { align: 'right', size: 8.5, color: p.muted });
  const r = back.length || backLabel ? seg(-1) : null;
  if (r) {
    line(ctx, r.x1, r.y1, r.x2, r.y2, alpha(p.muted, 0.35), 1);
    if (backLabel) {
      if (wide) text(ctx, p, backLabel, (r.x1 + r.x2) / 2, r.y1 + 10, { align: 'center', size: 8.5, color: p.muted });
      else text(ctx, p, backLabel, r.x1 + 6, (r.y1 + r.y2) / 2, { size: 8.5, color: p.muted });
    }
  }
  const dot = (pk: AnyPacket, s: { x1: number; y1: number; x2: number; y2: number }, reverse: boolean) => {
    const t = Math.min(1, Math.max(0, (now - pk.sentAt) / Math.max(1, pk.arriveAt - pk.sentAt)));
    const u = reverse ? 1 - t : t;
    const x = s.x1 + (s.x2 - s.x1) * u;
    const y = s.y1 + (s.y2 - s.y1) * u;
    const cheat = 'cheat' in pk.payload && pk.payload.cheat;
    if (cheat) fillRound(ctx, x - 4, y - 4, 8, 8, 2, p.danger);
    else fillRound(ctx, x - 2.5, y - 2.5, 5, 5, 1.5, alpha(p.accent, 0.8));
  };
  for (const pk of fwd) dot(pk, f, false);
  if (r) for (const pk of back) dot(pk, r, true);
}
