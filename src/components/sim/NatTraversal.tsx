import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ADDR, NAT_LABELS, ep, simulateHolePunch, type Endpoint, type NatMapping, type NatType, type NodeId, type TraversalPacket, type TraversalStep } from '../../lib/netsim';
import type { SimBaseProps } from './types';
import { useSim } from './ui/useSim';
import { Button, Legend, SimCanvas, SimLayout } from './ui/controls';
import { alpha, circle, cross, fillRound, line, text } from './ui/draw';
import type { Palette } from './ui/theme';

export interface NatTraversalProps extends SimBaseProps {
  natA?: NatType;
  natB?: NatType;
}

const NAT_TYPES: NatType[] = ['full-cone', 'restricted-cone', 'port-restricted', 'symmetric'];
const HOP_MS = 420;
const GAP_MS = 180;
const HOLD_MS = 1600;

interface Timing {
  start: number;
  dur: number;
}

function timings(pk: readonly TraversalPacket[]): { t: Timing[]; total: number } {
  let at = 200;
  const t = pk.map((p) => {
    const dur = Math.max(1, p.path.length - 1) * HOP_MS;
    const r = { start: at, dur };
    at += dur + GAP_MS;
    return r;
  });
  return { t, total: at + HOLD_MS };
}

/** Names for well-known addresses, so tables read as "198.51.100.9:50002 (NAT B)". */
function tag(e: Endpoint): string {
  if (e.ip === ADDR.stun.ip && e.port === ADDR.stun.port) return 'rendezvous';
  if (e.ip === ADDR.relay.ip) return 'relay';
  if (e.ip === ADDR.natA) return 'NAT A';
  if (e.ip === ADDR.natB) return 'NAT B';
  return '';
}

export default function NatTraversal(props: NatTraversalProps) {
  const { seed = 7, compact } = props;
  const [natA, setNatA] = useState<NatType>(props.natA ?? 'port-restricted');
  const [natB, setNatB] = useState<NatType>(props.natB ?? 'port-restricted');
  const steps = useMemo(() => simulateHolePunch(natA, natB, seed), [natA, natB, seed]);
  const [idx, setIdx] = useState(0);
  const step = steps[Math.min(idx, steps.length - 1)]!;
  const prev = idx > 0 ? steps[idx - 1] : undefined;
  const relayUsed = steps.slice(0, idx + 1).some((s) => s.packets.some((p) => p.path.includes('relay')));
  const id = useId();

  const view = useRef({ step, relayUsed, playing: false });
  view.current.step = step;
  view.current.relayUsed = relayUsed;

  const sim = useSim({
    dt: 10,
    stepMs: HOP_MS,
    step: () => {},
    draw: (ctx, w, h, p, now) => {
      const v = view.current;
      const { total } = timings(v.step.packets);
      // Paused at the start of a step (or reduced motion): show the step's end state.
      const t = !v.playing && now === 0 ? Infinity : now % total;
      draw(ctx, w, h, p, t, v.step, v.relayUsed);
    },
    height: (w) => (w >= 640 ? 260 : 236),
  });
  view.current.playing = sim.playing;

  useEffect(() => {
    sim.restart();
  }, [idx, steps, sim]);
  useEffect(() => setIdx((i) => Math.min(i, steps.length - 1)), [steps]);

  const go = (i: number) => setIdx(Math.max(0, Math.min(steps.length - 1, i)));

  const selectCls = 'rounded-md border border-border bg-surface px-1.5 py-1 text-sm text-text';
  const matrix = useMemo(
    () => (compact ? null : NAT_TYPES.map((a) => NAT_TYPES.map((b) => simulateHolePunch(a, b, seed).at(-1)!.outcome))),
    [compact, seed],
  );

  return (
    <SimLayout>
      <SimCanvas
        sim={sim}
        label="Peer A and its NAT on the left, peer B and its NAT on the right, the rendezvous server at the top and a relay at the bottom. Packets for the current step travel between them; dropped packets end in a cross."
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => go(idx - 1)} disabled={idx === 0}>
          ← Prev
        </Button>
        <Button primary onClick={() => go(idx + 1)} disabled={idx >= steps.length - 1}>
          Next →
        </Button>
        <Button onClick={() => go(0)} disabled={idx === 0}>
          Restart
        </Button>
        <Button onClick={sim.toggle} label={sim.playing ? 'Pause animation' : 'Play animation'}>
          {sim.playing ? 'Pause' : 'Play'}
        </Button>
        <span className="ml-auto font-mono text-xs text-muted tabular-nums">
          step {idx + 1} / {steps.length}
        </span>
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {(
            [
              ['A', natA, setNatA],
              ['B', natB, setNatB],
            ] as const
          ).map(([who, val, setter]) => (
            <label key={who} className="flex items-center gap-1.5 text-muted" htmlFor={`${id}-${who}`}>
              NAT {who}
              <select
                id={`${id}-${who}`}
                aria-label={`NAT ${who} type`}
                className={selectCls}
                value={val}
                onChange={(e) => {
                  setter(e.target.value as NatType);
                  setIdx(0);
                }}
              >
                {NAT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {NAT_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface-2 p-3" aria-live="polite">
        <div className="flex flex-wrap items-baseline gap-2">
          <h4 className="font-semibold">{step.title}</h4>
          {step.outcome && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${step.outcome === 'direct' ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
              {step.outcome === 'direct' ? 'Direct peer-to-peer' : 'Relayed'}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm">{step.text}</p>
        {step.packets.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">
            {step.packets.map((pk, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="font-semibold">{pk.label}</span>
                <span className="font-mono break-all text-muted">
                  {pk.wireSrc} → {pk.wireDst}
                </span>
                {pk.delivered ? <span className="text-ok">delivered</span> : <span className="text-danger">dropped: {pk.dropReason}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <MappingTable title={`NAT A · ${NAT_LABELS[natA]}`} rows={step.natA} prev={prev?.natA} />
        <MappingTable title={`NAT B · ${NAT_LABELS[natB]}`} rows={step.natB} prev={prev?.natB} />
      </div>

      <Legend
        items={[
          { label: 'packet in flight', color: 'var(--accent)' },
          { label: 'delivered', color: 'var(--ok)', shape: 'line' },
          { label: 'dropped by a NAT', color: 'var(--danger)', shape: 'dash' },
          { label: 'new in this step', color: 'var(--accent-soft)', shape: 'square' },
        ]}
      />

      {matrix && (
        <div>
          <p className="mb-1 text-sm text-muted" id={`${id}-matrix`}>
            Does hole punching work? (A's NAT in rows, B's NAT in columns)
          </p>
          <div className="relative overflow-x-auto">
          <table className="text-left text-xs" aria-labelledby={`${id}-matrix`}>
            <thead>
              <tr>
                <th className="px-1.5 py-1" />
                {NAT_TYPES.map((t) => (
                  <th key={t} scope="col" className="px-1.5 py-1 font-medium text-muted">
                    {NAT_LABELS[t]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NAT_TYPES.map((a, i) => (
                <tr key={a}>
                  <th scope="row" className="px-1.5 py-1 font-medium text-muted">
                    {NAT_LABELS[a]}
                  </th>
                  {matrix[i]!.map((o, j) => {
                    const cur = a === natA && NAT_TYPES[j] === natB;
                    return (
                      <td key={j} className={`px-1.5 py-1 font-semibold ${o === 'direct' ? 'text-ok' : 'text-warn'} ${cur ? 'rounded bg-accent-soft ring-1 ring-accent' : ''}`}>
                        {o === 'direct' ? 'direct' : 'relay'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </SimLayout>
  );
}

function MappingTable({ title, rows, prev }: { title: string; rows: NatMapping[]; prev?: NatMapping[] }) {
  const isNewRow = (i: number) => !prev || i >= prev.length;
  const isNewAllow = (i: number, e: Endpoint) => !isNewRow(i) && !prev![i]!.sentTo.some((s) => s.ip === e.ip && s.port === e.port);
  const fmt = (e: Endpoint) => {
    const t = tag(e);
    return t ? `${ep(e)} (${t})` : ep(e);
  };
  return (
    <div className="relative min-w-0 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-xs">
        <caption className="bg-surface-2 px-2 py-1.5 text-left text-sm font-semibold">{title}</caption>
        <thead className="text-muted">
          <tr className="border-t border-border">
            <th className="px-2 py-1 font-medium">Private → public</th>
            <th className="px-2 py-1 font-medium">Lets in replies from</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.length === 0 && (
            <tr className="border-t border-border">
              <td colSpan={2} className="px-2 py-1.5 font-sans text-muted">
                No mappings yet: all inbound traffic is dropped.
              </td>
            </tr>
          )}
          {rows.map((m, i) => (
            <tr key={i} className={`border-t border-border align-top ${isNewRow(i) ? 'bg-accent-soft' : ''}`}>
              <td className="px-2 py-1 whitespace-nowrap">
                {ep(m.internal)} →<br />
                {ep(m.external)}
                {m.boundTo && <div className="font-sans whitespace-normal text-muted">only for {fmt(m.boundTo)}</div>}
              </td>
              <td className="px-2 py-1 whitespace-nowrap">
                {m.sentTo.map((s, k) => (
                  <div key={k} className={isNewAllow(i, s) ? 'rounded bg-accent-soft' : ''}>
                    {fmt(s)}
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ drawing

type Pos = Record<NodeId, { x: number; y: number }>;

function layout(w: number, h: number): { pos: Pos; wide: boolean } {
  const wide = w >= 640;
  const mid = h / 2 + 4;
  const fx = wide ? [0.08, 0.27, 0.73, 0.92] : [0.1, 0.3, 0.7, 0.9];
  return {
    wide,
    pos: {
      A: { x: w * fx[0]!, y: mid },
      natA: { x: w * fx[1]!, y: mid },
      natB: { x: w * fx[2]!, y: mid },
      B: { x: w * fx[3]!, y: mid },
      stun: { x: w / 2, y: 38 },
      relay: { x: w / 2, y: h - 34 },
    },
  };
}

const NODE_LABEL: Record<NodeId, [string, string]> = {
  A: ['Peer A', 'A'],
  B: ['Peer B', 'B'],
  natA: ['NAT A', 'NAT A'],
  natB: ['NAT B', 'NAT B'],
  stun: ['Rendezvous (STUN)', 'STUN'],
  relay: ['Relay (TURN / SDR)', 'Relay'],
};

function nodeAddr(n: NodeId): string {
  switch (n) {
    case 'A':
      return ep(ADDR.A);
    case 'B':
      return ep(ADDR.B);
    case 'natA':
      return ADDR.natA;
    case 'natB':
      return ADDR.natB;
    case 'stun':
      return ep(ADDR.stun);
    case 'relay':
      return ep(ADDR.relay);
  }
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, t: number, step: TraversalStep, relayUsed: boolean) {
  const { pos, wide } = layout(w, h);

  // Private networks
  const lanW = pos.natA.x - pos.A.x + (wide ? 70 : 44);
  const lanH = wide ? 96 : 84;
  const lanY = pos.A.y - lanH / 2;
  ctx.setLineDash([4, 4]);
  fillRound(ctx, pos.A.x - (wide ? 52 : 32), lanY, lanW, lanH, 10, alpha(p.accent, 0.04), alpha(p.muted, 0.6));
  fillRound(ctx, pos.natB.x - (wide ? 18 : 12), lanY, lanW, lanH, 10, alpha(p.accent, 0.04), alpha(p.muted, 0.6));
  ctx.setLineDash([]);
  text(ctx, p, wide ? 'home network A (private)' : 'LAN A', pos.A.x - (wide ? 46 : 28), lanY + lanH - 9, { size: 9, color: p.muted });
  text(ctx, p, wide ? 'home network B (private)' : 'LAN B', pos.B.x + (wide ? 46 : 28), lanY + lanH - 9, { size: 9, color: p.muted, align: 'right' });
  text(ctx, p, 'public internet', w / 2, pos.natA.y - (wide ? 22 : 18), { align: 'center', size: 9.5, color: p.muted });

  // Links
  const links: [NodeId, NodeId][] = [
    ['A', 'natA'],
    ['natB', 'B'],
    ['natA', 'natB'],
    ['natA', 'stun'],
    ['natB', 'stun'],
    ['natA', 'relay'],
    ['natB', 'relay'],
  ];
  for (const [a, b] of links) {
    const dim = (a === 'natA' || a === 'natB') && b === 'relay' && !relayUsed;
    line(ctx, pos[a].x, pos[a].y, pos[b].x, pos[b].y, alpha(p.muted, dim ? 0.12 : 0.35), 1, b === 'relay' || (a === 'natA' && b === 'natB') ? [3, 4] : undefined);
  }

  // Packets: finished ones as a coloured path, the current one as a moving dot.
  const { t: tm } = timings(step.packets);
  const overlays: (() => void)[] = [];
  step.packets.forEach((pk, i) => {
    const { start, dur } = tm[i]!;
    if (t < start) return;
    const f = Math.min(1, (t - start) / dur);
    const hops = pk.path.length - 1;
    const along = f * hops;
    const col = f >= 1 ? (pk.delivered ? p.ok : p.danger) : p.accent;
    const off = pathOffset(step.packets, i);
    let head = { ...pos[pk.path[0]!] };
    for (let k = 0; k < hops; k++) {
      const a = pos[pk.path[k]!];
      const b = pos[pk.path[k + 1]!];
      const u = Math.min(1, Math.max(0, along - k));
      if (u <= 0) break;
      const e = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u + off };
      line(ctx, a.x, a.y + off, e.x, e.y, col, 2.25, f >= 1 && !pk.delivered ? [5, 3] : undefined);
      head = e;
    }
    let hx = head.x;
    let hy = head.y;
    if (f >= 1 && !pk.delivered && hops > 0) {
      // Mark the drop just in front of the NAT box rather than on top of it.
      const a = pos[pk.path[hops - 1]!];
      const d = Math.hypot(hx - a.x, hy - a.y) || 1;
      const back = Math.min(wide ? 40 : 30, d / 2);
      hx -= ((hx - a.x) / d) * back;
      hy -= ((hy - a.y) / d) * back;
    }
    if (f < 1)
      overlays.push(() => {
        circle(ctx, hx, hy, 5.5, p.accent, p.surface, 2);
        text(ctx, p, pk.label, Math.min(w - 50, Math.max(50, hx)), hy - 15, { align: 'center', size: 10, weight: 700, color: p.text, bg: p.surface, border: p.accent, pad: 5 });
      });
    else if (!pk.delivered)
      overlays.push(() => {
        cross(ctx, hx, hy, 8, p.danger, 3);
        text(ctx, p, 'dropped', hx, hy + (off >= 0 ? 24 : -24), { align: 'center', size: 9.5, weight: 700, color: p.danger, bg: p.dangerSoft });
      });
  });

  // Nodes on top
  (Object.keys(pos) as NodeId[]).forEach((n) => {
    const { x, y } = pos[n];
    const dim = n === 'relay' && !relayUsed;
    const isNat = n === 'natA' || n === 'natB';
    const [long, short] = NODE_LABEL[n];
    const label = wide ? long : short;
    const bw = Math.max(isNat ? 46 : 40, label.length * (wide ? 6.6 : 6.2) + 14);
    const bh = 24;
    ctx.globalAlpha = dim ? 0.45 : 1;
    fillRound(ctx, x - bw / 2, y - bh / 2, bw, bh, isNat ? 4 : 8, isNat ? p.surface2 : p.surface, n === 'stun' || n === 'relay' ? p.violet : isNat ? p.text : p.accent);
    text(ctx, p, label, x, y + 0.5, { align: 'center', size: 10.5, weight: 700, color: n === 'stun' || n === 'relay' ? p.violet : p.text });
    if (wide) {
      const below = n === 'stun' ? -bh / 2 - 8 : bh / 2 + 9;
      text(ctx, p, nodeAddr(n), x, y + below, { align: 'center', size: 9, mono: true, color: p.muted });
    }
    ctx.globalAlpha = 1;
  });
  for (const o of overlays) o();
}

/** Two packets on the same link in one step (request and reply) are drawn slightly apart. */
function pathOffset(pk: readonly TraversalPacket[], i: number): number {
  if (pk.length < 2) return 0;
  return i % 2 === 0 ? -4 : 4;
}
