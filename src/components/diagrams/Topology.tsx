/**
 * Network topologies: dedicated server, listen server (host), peer-to-peer, relay, and NGO distributed authority.
 * Nodes and connections are drawn in SVG; each variant has a few example messages to step through,
 * plus a pros/cons strip.
 */
import ActorIcon, { type ActorKind } from './primitives/ActorIcon';
import StepperControls from './primitives/StepperControls';
import { Arrow, Node, PacketDot } from './primitives/svg';
import { useStepper } from './primitives/useStepper';
import { useWidth } from './primitives/useWidth';
import { useVariant, VariantSwitcher } from './primitives/VariantSwitcher';
import type { LineKind } from './primitives/svg';
import './diagrams.css';

const VARIANTS = ['dedicated', 'listen-server', 'p2p', 'relay', 'distributed-authority'] as const;
type V = (typeof VARIANTS)[number];
const LABELS: Record<V, string> = {
  dedicated: 'Dedicated server',
  'listen-server': 'Listen server',
  p2p: 'Peer-to-peer',
  relay: 'Relay',
  'distributed-authority': 'Distributed authority',
};

interface TNode {
  id: string;
  x: number;
  y: number;
  label: string;
  sub?: string;
  kind: ActorKind;
  authority?: boolean;
  w?: number;
}
interface TStep {
  text: string;
  /** Each hop is a polyline of node ids; all hops in a step animate together. */
  hops: string[][];
  kind?: LineKind;
  /** Nodes to highlight even without a hop (local work). */
  focus?: string[];
}
interface TVariant {
  nodes: TNode[];
  edges: Array<[string, string]>;
  authority: string;
  steps: TStep[];
  pros: string[];
  cons: string[];
  usedBy: string;
}

const W = 420;
const H = 300;
const bottom4 = (labels: string[], y = 245) => labels.map((l, i) => ({ x: 57 + i * 102, l, y }));

const DATA: Record<V, TVariant> = {
  dedicated: {
    nodes: [
      { id: 's', x: 210, y: 55, label: 'Server', sub: 'data center', kind: 'server', authority: true, w: 120 },
      ...bottom4(['Client A', 'Client B', 'Client C', 'Client D']).map((c, i) => ({
        id: 'abcd'[i],
        x: c.x,
        y: c.y,
        label: c.l,
        kind: 'client' as const,
        w: 94,
      })),
    ],
    edges: [
      ['a', 's'],
      ['b', 's'],
      ['c', 's'],
      ['d', 's'],
    ],
    authority: 'The server. It runs the simulation and every client only sends input and displays what the server says.',
    steps: [
      { text: 'Client A sends its input (move, aim) to the server. Clients never talk to each other.', hops: [['a', 's']], kind: 'unreliable' },
      { text: 'The server simulates the tick with everyone’s input. Its result is the truth.', hops: [], focus: ['s'] },
      {
        text: 'The server sends the new state to every client.',
        hops: [
          ['s', 'a'],
          ['s', 'b'],
          ['s', 'c'],
          ['s', 'd'],
        ],
        kind: 'unreliable',
      },
      { text: 'Client C fires. The request goes to the server, which validates it (cheat-resistant).', hops: [['c', 's']], kind: 'reliable' },
      {
        text: 'Everyone, including C, learns the hit result from the server.',
        hops: [
          ['s', 'a'],
          ['s', 'b'],
          ['s', 'c'],
          ['s', 'd'],
        ],
        kind: 'reliable',
      },
    ],
    pros: ['Most cheat-resistant: one referee', 'Fair: no player has a latency advantage', 'Session survives any player leaving'],
    cons: ['Servers cost money and need operations', 'You build and ship a headless server', 'Everyone pays the latency to the data center'],
    usedBy: 'Competitive shooters, MMOs, anything ranked.',
  },
  'listen-server': {
    nodes: [
      { id: 'h', x: 210, y: 55, label: 'Host', sub: 'player + server', kind: 'host', authority: true, w: 132 },
      { id: 'a', x: 85, y: 245, label: 'Client A', kind: 'client', w: 98 },
      { id: 'b', x: 210, y: 245, label: 'Client B', kind: 'client', w: 98 },
      { id: 'c', x: 335, y: 245, label: 'Client C', kind: 'client', w: 98 },
    ],
    edges: [
      ['a', 'h'],
      ['b', 'h'],
      ['c', 'h'],
    ],
    authority: 'The host: one player’s game also runs the server (NGO StartHost()).',
    steps: [
      { text: 'The host player presses a key: applied locally right away, with zero latency.', hops: [], focus: ['h'] },
      { text: 'Client A sends its input to the host.', hops: [['a', 'h']], kind: 'unreliable' },
      {
        text: 'The host simulates and sends state to every client, using the host player’s home upload bandwidth.',
        hops: [
          ['h', 'a'],
          ['h', 'b'],
          ['h', 'c'],
        ],
        kind: 'unreliable',
      },
      { text: 'If the host quits, every connection goes with it, unless the game implements host migration.', hops: [], focus: ['h'] },
    ],
    pros: ['No server bill: players host', 'Simple: same build for host and clients', 'Great for co-op with friends'],
    cons: ['Host has zero ping (unfair in PvP)', 'Host’s upload limits player count', 'Session ends when the host leaves', 'Host is usually behind NAT: needs a relay'],
    usedBy: 'Co-op games, small-party games, most Steam lobby games.',
  },
  p2p: {
    nodes: [
      { id: 'a', x: 95, y: 60, label: 'Peer A', kind: 'client', authority: true, w: 100 },
      { id: 'b', x: 325, y: 60, label: 'Peer B', kind: 'client', authority: true, w: 100 },
      { id: 'c', x: 95, y: 240, label: 'Peer C', kind: 'client', authority: true, w: 100 },
      { id: 'd', x: 325, y: 240, label: 'Peer D', kind: 'client', authority: true, w: 100 },
    ],
    edges: [
      ['a', 'b'],
      ['a', 'c'],
      ['a', 'd'],
      ['b', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ],
    authority: 'No single authority. Each peer owns its own avatar, or all peers run the same deterministic simulation (lockstep / rollback).',
    steps: [
      {
        text: 'Peer A sends its update directly to every other peer: 3 connections for 4 players.',
        hops: [
          ['a', 'b'],
          ['a', 'c'],
          ['a', 'd'],
        ],
        kind: 'unreliable',
      },
      {
        text: 'Peer D does the same. Upload per peer grows with the player count: N − 1 copies of every message.',
        hops: [
          ['d', 'a'],
          ['d', 'b'],
          ['d', 'c'],
        ],
        kind: 'unreliable',
      },
      { text: 'Every pair needs its own path through both players’ NATs. One failed pair breaks the session.', hops: [['b', 'c']], kind: 'event' },
    ],
    pros: ['Lowest latency: direct paths', 'No server at all', 'Natural fit for lockstep and rollback'],
    cons: ['Bandwidth grows with N − 1', 'NAT traversal for every pair', 'Hard to stop cheating: no referee', 'Exposes players’ IP addresses'],
    usedBy: 'Fighting games (rollback), classic RTS (lockstep), small sessions.',
  },
  relay: {
    nodes: [
      { id: 'h', x: 210, y: 45, label: 'Host', sub: 'authority', kind: 'host', authority: true, w: 112 },
      { id: 'r', x: 210, y: 150, label: 'Relay', sub: 'forwards only', kind: 'relay', w: 124 },
      { id: 'a', x: 80, y: 255, label: 'Client A', kind: 'client', w: 96 },
      { id: 'b', x: 210, y: 255, label: 'Client B', kind: 'client', w: 96 },
      { id: 'c', x: 340, y: 255, label: 'Client C', kind: 'client', w: 96 },
    ],
    edges: [
      ['h', 'r'],
      ['a', 'r'],
      ['b', 'r'],
      ['c', 'r'],
    ],
    authority: 'Still the host. The relay (Steam Datagram Relay, Unity Relay) only forwards packets and never runs game logic.',
    steps: [
      { text: 'Everyone connects outward to the relay, which works behind any NAT. No port forwarding.', hops: [['a', 'r'], ['b', 'r'], ['c', 'r'], ['h', 'r']], kind: 'event' },
      { text: 'Client A’s input goes to the relay, which forwards it to the host: one extra hop.', hops: [['a', 'r', 'h']], kind: 'unreliable' },
      {
        text: 'The host’s state goes to the relay, which fans it out to the clients.',
        hops: [
          ['h', 'r', 'a'],
          ['h', 'r', 'b'],
          ['h', 'r', 'c'],
        ],
        kind: 'unreliable',
      },
    ],
    pros: ['Works through any NAT or firewall', 'Players’ IP addresses stay hidden', 'Far cheaper than running game servers'],
    cons: ['Extra hop adds latency', 'Session still ends if the host leaves', 'Depends on a third-party service'],
    usedBy: 'Steam lobby games (SDR), Unity Relay with NGO.',
  },
  'distributed-authority': {
    nodes: [
      { id: 'svc', x: 210, y: 55, label: 'Session service', sub: 'state relay (cloud)', kind: 'service', w: 160 },
      { id: 'a', x: 80, y: 245, label: 'Client A', sub: 'session owner', kind: 'client', authority: true, w: 112 },
      { id: 'b', x: 210, y: 245, label: 'Client B', kind: 'client', authority: true, w: 96 },
      { id: 'c', x: 340, y: 245, label: 'Client C', kind: 'client', authority: true, w: 96 },
    ],
    edges: [
      ['a', 'svc'],
      ['b', 'svc'],
      ['c', 'svc'],
    ],
    authority: 'Distributed: each client is the authority for the objects it owns. The service relays and stores state; one client is the session owner.',
    steps: [
      { text: 'Client B moves its own player: it is the authority, so the change applies instantly on B.', hops: [], focus: ['b'] },
      {
        text: 'B’s update goes through the session service to everyone else.',
        hops: [
          ['b', 'svc', 'a'],
          ['b', 'svc', 'c'],
        ],
        kind: 'unreliable',
      },
      {
        text: 'Client C spawns a projectile it owns. Its updates flow the same way.',
        hops: [
          ['c', 'svc', 'a'],
          ['c', 'svc', 'b'],
        ],
        kind: 'reliable',
      },
      { text: 'If Client A (session owner) leaves, the service promotes another client and its objects get new owners. No host to lose.', hops: [], focus: ['svc', 'b'] },
    ],
    pros: ['No single host to lose', 'Owners see zero latency on their own objects', 'No server code or hosting to run'],
    cons: ['Requires Unity’s cloud session service', 'Clients are trusted with their objects (cheating)', 'Ownership hand-offs need careful design'],
    usedBy: 'NGO 2.x with Unity Multiplayer Services, co-op and casual games.',
  },
};

/** Point where the segment from the centre of `n` towards (tx, ty) leaves its box. */
function edgePoint(n: TNode, tx: number, ty: number, pad = 5): [number, number] {
  const w = (n.w ?? 104) / 2 + pad;
  const h = 26 + pad;
  const dx = tx - n.x;
  const dy = ty - n.y;
  const t = Math.min(dx ? w / Math.abs(dx) : Infinity, dy ? h / Math.abs(dy) : Infinity);
  return [n.x + dx * t, n.y + dy * t];
}

export default function Topology({ variant }: { variant?: string }) {
  const v = useVariant(VARIANTS, variant);
  return (
    <div>
      {!v.pinned && <VariantSwitcher variants={VARIANTS} value={v.value} onChange={v.set} labels={LABELS} label="Topology" />}
      <TopologyView key={v.value} name={v.value} />
    </div>
  );
}

function TopologyView({ name }: { name: V }) {
  const d = DATA[name];
  const s = useStepper(d.steps.length, { stepMs: 2600 });
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const step = s.index >= 0 ? d.steps[s.index] : undefined;
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const compact = width > 0 && width < 400;
  const activeNodes = new Set([...(step?.hops.flat() ?? []), ...(step?.focus ?? [])]);

  return (
    <div className="space-y-3" data-topology={name}>
      <div ref={boxRef} className="mx-auto max-w-xl">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-labelledby={`topo-${name}-t topo-${name}-d`}>
          <title id={`topo-${name}-t`}>{LABELS[name]} topology</title>
          <desc id={`topo-${name}-d`}>
            {`Machines: ${d.nodes.map((n) => `${n.label}${n.authority ? ' (authoritative)' : ''}`).join(', ')}. Connections: ${d.edges
              .map(([a, b]) => `${byId.get(a)!.label} to ${byId.get(b)!.label}`)
              .join(', ')}.`}
          </desc>
          {d.edges.map(([a, b]) => {
            const A = byId.get(a)!;
            const B = byId.get(b)!;
            return <line key={`${a}-${b}`} className="dg-edge" x1={A.x} y1={A.y} x2={B.x} y2={B.y} />;
          })}
          {step?.hops.map((hop, hi) =>
            hop.slice(1).map((id, i) => {
              const A = byId.get(hop[i])!;
              const B = byId.get(id)!;
              const [x1, y1] = edgePoint(A, B.x, B.y);
              const [x2, y2] = edgePoint(B, A.x, A.y);
              return <Arrow key={`${hi}-${i}`} className="dg-active" x1={x1} y1={y1} x2={x2} y2={y2} kind={step.kind ?? 'reliable'} />;
            }),
          )}
          {d.nodes.map((n) => (
            <Node
              key={n.id}
              x={n.x}
              y={n.y}
              w={n.w}
              kind={n.kind}
              label={n.label}
              sublabel={n.sub}
              authority={n.authority}
              active={activeNodes.has(n.id)}
              dim={Boolean(step) && !activeNodes.has(n.id)}
              compact={compact}
            />
          ))}
          {step?.hops.map((hop, hi) => (
            <PacketDot
              key={`${s.index}-${hi}`}
              runKey={s.index}
              disabled={s.reducedMotion}
              durationMs={900 * (hop.length - 1)}
              r={6}
              points={hop.map((id) => {
                const n = byId.get(id)!;
                return [n.x, n.y] as [number, number];
              })}
            />
          ))}
        </svg>
      </div>

      <div className="min-h-[3.5rem] rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm" aria-live="polite">
        {step ? (
          <p>
            <span className="mr-1.5 font-mono text-xs text-muted">
              {s.index + 1}/{d.steps.length}
            </span>
            {step.text}
          </p>
        ) : (
          <p className="text-muted">
            <span className="font-semibold text-text">Authority: </span>
            {d.authority}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <StepperControls s={s} label="Message" />
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <svg width="18" height="18" viewBox="-10 -10 20 20" aria-hidden="true">
            <circle r={9} fill="var(--warn)" />
            <path d="M-5 2.5 -5.5 -3.5 -2.2 -0.8 0 -4.5 2.2 -0.8 5.5 -3.5 5 2.5Z" fill="var(--surface)" />
          </svg>
          = authoritative
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <p className="mb-1.5 text-xs font-bold tracking-wider text-ok uppercase">Strengths</p>
          <ul className="list-none space-y-1 pl-0 text-sm">
            {d.pros.map((p) => (
              <li key={p} className="flex gap-2">
                <span aria-hidden="true" className="text-ok">
                  ✓
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="mb-1.5 text-xs font-bold tracking-wider text-danger uppercase">Weaknesses</p>
          <ul className="list-none space-y-1 pl-0 text-sm">
            {d.cons.map((p) => (
              <li key={p} className="flex gap-2">
                <span aria-hidden="true" className="text-danger">
                  ✗
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {/* Text alternative: the whole message sequence, independent of the stepper position. */}
      <div className="sr-only">
        <p>
          {LABELS[name]}. Authority: {d.authority} Messages, in order:
        </p>
        <ol>
          {d.steps.map((st, i) => (
            <li key={i}>{st.text}</li>
          ))}
        </ol>
      </div>

      <p className="flex items-center gap-2 text-sm text-muted">
        <ActorIcon kind="service" className="h-4 w-4 shrink-0" />
        <span>
          <span className="font-semibold text-text">Typical use: </span>
          {d.usedBy}
        </span>
      </p>
    </div>
  );
}
