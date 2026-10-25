/**
 * A small NAT model (RFC 4787 terminology) and a UDP hole-punching scenario built on top of it.
 *
 * | type             | mapping (which public port)          | filtering (who may send in)       |
 * |------------------|--------------------------------------|-----------------------------------|
 * | full-cone        | endpoint-independent                 | anyone                            |
 * | restricted-cone  | endpoint-independent                 | IPs we have sent to               |
 * | port-restricted  | endpoint-independent                 | IP:port pairs we have sent to     |
 * | symmetric        | new port per destination IP:port     | IP:port pairs we have sent to     |
 */
import { Random } from './rng';

export type NatType = 'full-cone' | 'restricted-cone' | 'port-restricted' | 'symmetric';

export const NAT_LABELS: Record<NatType, string> = {
  'full-cone': 'Full cone',
  'restricted-cone': 'Restricted cone',
  'port-restricted': 'Port-restricted cone',
  symmetric: 'Symmetric',
};

export interface Endpoint {
  ip: string;
  port: number;
}

export const ep = (e: Endpoint) => `${e.ip}:${e.port}`;
const same = (a: Endpoint, b: Endpoint) => a.ip === b.ip && a.port === b.port;

export interface NatMapping {
  internal: Endpoint;
  external: Endpoint;
  /** Symmetric NATs bind each mapping to one destination. */
  boundTo?: Endpoint;
  /** Remote endpoints this mapping has sent to (the filter's allow list). */
  sentTo: Endpoint[];
}

export class Nat {
  readonly mappings: NatMapping[] = [];
  private nextPort: number;
  private readonly rng: Random;

  constructor(
    readonly type: NatType,
    readonly publicIp: string,
    firstPort: number,
    seed = 1,
  ) {
    this.nextPort = firstPort;
    this.rng = new Random(seed);
  }

  private allocatePort(): number {
    const p = this.nextPort;
    // Symmetric NATs often allocate unpredictably, which defeats port prediction.
    this.nextPort += this.type === 'symmetric' ? this.rng.int(37, 900) : 1;
    return p;
  }

  /** A packet from `internal` to `dst` leaves through the NAT: returns its public source endpoint. */
  outbound(internal: Endpoint, dst: Endpoint): Endpoint {
    let m = this.mappings.find(
      (x) => same(x.internal, internal) && (this.type !== 'symmetric' || (x.boundTo && same(x.boundTo, dst))),
    );
    if (!m) {
      m = {
        internal,
        external: { ip: this.publicIp, port: this.allocatePort() },
        boundTo: this.type === 'symmetric' ? dst : undefined,
        sentTo: [],
      };
      this.mappings.push(m);
    }
    if (!m.sentTo.some((s) => same(s, dst))) m.sentTo.push(dst);
    return m.external;
  }

  /** A packet from `src` arrives at public port `port`: returns the internal endpoint, or null if dropped. */
  inbound(src: Endpoint, port: number): { to: Endpoint; mapping: NatMapping } | { to: null; reason: string } {
    const m = this.mappings.find((x) => x.external.port === port);
    if (!m) return { to: null, reason: `no mapping for port ${port}` };
    const ok =
      this.type === 'full-cone'
        ? true
        : this.type === 'restricted-cone'
          ? m.sentTo.some((s) => s.ip === src.ip)
          : m.sentTo.some((s) => same(s, src));
    if (!ok)
      return {
        to: null,
        reason:
          this.type === 'restricted-cone'
            ? `${src.ip} was never contacted from port ${port}`
            : `${ep(src)} was never contacted from port ${port}`,
      };
    return { to: m.internal, mapping: m };
  }

  snapshot(): NatMapping[] {
    return this.mappings.map((m) => ({ ...m, sentTo: [...m.sentTo] }));
  }
}

// ------------------------------------------------------------------ hole punching scenario

export type NodeId = 'A' | 'natA' | 'B' | 'natB' | 'stun' | 'relay';

export interface TraversalPacket {
  /** Nodes the packet visits, e.g. ['A', 'natA', 'natB']. */
  path: NodeId[];
  label: string;
  /** Source and destination as written in the IP header on the public internet. */
  wireSrc: string;
  wireDst: string;
  delivered: boolean;
  /** Why the last node on `path` dropped it. */
  dropReason?: string;
}

export interface TraversalStep {
  title: string;
  text: string;
  packets: TraversalPacket[];
  natA: NatMapping[];
  natB: NatMapping[];
  /** Set on the final step. */
  outcome?: 'direct' | 'relay';
}

export const ADDR = {
  A: { ip: '192.168.1.10', port: 5000 },
  B: { ip: '10.0.0.7', port: 6000 },
  natA: '203.0.113.5',
  natB: '198.51.100.9',
  stun: { ip: '192.0.2.1', port: 3478 },
  relay: { ip: '192.0.2.50', port: 3478 },
} as const;

/** Runs the NAT model through STUN discovery, a hole punch and (if needed) a relay fallback. */
export function simulateHolePunch(typeA: NatType, typeB: NatType, seed = 7): TraversalStep[] {
  const natA = new Nat(typeA, ADDR.natA, 40001, seed);
  const natB = new Nat(typeB, ADDR.natB, 50002, seed + 1);
  const steps: TraversalStep[] = [];
  const push = (s: Omit<TraversalStep, 'natA' | 'natB'>) => steps.push({ ...s, natA: natA.snapshot(), natB: natB.snapshot() });
  const sideOf = (who: 'A' | 'B') => (who === 'A' ? { nat: natA, priv: ADDR.A, natId: 'natA' as const } : { nat: natB, priv: ADDR.B, natId: 'natB' as const });

  push({
    title: 'Two peers behind two NATs',
    text: `Each peer only knows its private address (${ep(ADDR.A)} and ${ep(ADDR.B)}). Private addresses are not routable on the internet, and each home router (NAT) drops unsolicited inbound packets, so neither peer can simply connect to the other.`,
    packets: [],
  });

  // STUN binding for both peers
  const reflexive: Record<'A' | 'B', Endpoint> = { A: ADDR.A, B: ADDR.B };
  for (const who of ['A', 'B'] as const) {
    const s = sideOf(who);
    const pub = s.nat.outbound(s.priv, ADDR.stun);
    reflexive[who] = pub;
    push({
      title: `${who} asks the rendezvous server "what is my address?"`,
      text: `${who} sends a STUN-style binding request. On the way out, its NAT creates a mapping ${ep(s.priv)} ⇄ ${ep(pub)} and remembers that this port has talked to the server. The server sees the packet arrive from ${ep(pub)} and replies with exactly that: ${who}'s public ("server-reflexive") address.`,
      packets: [
        { path: [who, s.natId, 'stun'], label: 'Binding request', wireSrc: ep(pub), wireDst: ep(ADDR.stun), delivered: true },
        { path: ['stun', s.natId, who], label: `You are ${ep(pub)}`, wireSrc: ep(ADDR.stun), wireDst: ep(pub), delivered: true },
      ],
    });
  }

  push({
    title: 'Exchange addresses through the rendezvous server',
    text: `Through the matchmaking or lobby connection, the server tells A that B is at ${ep(reflexive.B)} and tells B that A is at ${ep(reflexive.A)}. Both now try to send directly to each other at about the same time.`,
    packets: [
      { path: ['stun', 'natA', 'A'], label: `B is ${ep(reflexive.B)}`, wireSrc: ep(ADDR.stun), wireDst: ep(reflexive.A), delivered: true },
      { path: ['stun', 'natB', 'B'], label: `A is ${ep(reflexive.A)}`, wireSrc: ep(ADDR.stun), wireDst: ep(reflexive.B), delivered: true },
    ],
  });

  // Punch: A -> B's reflexive, then B -> A's reflexive.
  const learned: Record<'A' | 'B', Endpoint | null> = { A: null, B: null };
  const punch = (who: 'A' | 'B', target: Endpoint, title: string): TraversalPacket => {
    const me = sideOf(who);
    const other = sideOf(who === 'A' ? 'B' : 'A');
    const src = me.nat.outbound(me.priv, target);
    const res = other.nat.inbound(src, target.port);
    const delivered = res.to !== null;
    if (delivered) learned[who === 'A' ? 'B' : 'A'] = src;
    const pkt: TraversalPacket = {
      path: delivered ? [who, me.natId, other.natId, who === 'A' ? 'B' : 'A'] : [who, me.natId, other.natId],
      label: title,
      wireSrc: ep(src),
      wireDst: ep(target),
      delivered,
      dropReason: res.to === null ? res.reason : undefined,
    };
    return pkt;
  };

  const p1 = punch('A', reflexive.B, 'Punch A→B');
  const newPortA = p1.wireSrc !== ep(reflexive.A);
  push({
    title: 'A punches a hole toward B',
    text:
      (newPortA
        ? `A's NAT is symmetric, so this new destination gets a brand-new public port (${p1.wireSrc}), not the one STUN reported. `
        : `A's NAT reuses the same public port (${p1.wireSrc}) because its mapping is endpoint-independent, and adds ${ep(reflexive.B)} to the allow list. `) +
      (p1.delivered
        ? `B's NAT lets it in: B is reachable directly.`
        : `B's NAT drops the packet (${p1.dropReason}). That is expected: the point of this packet is the hole it leaves open in A's NAT.`),
    packets: [p1],
  });

  const p2 = punch('B', reflexive.A, 'Punch B→A');
  const newPortB = p2.wireSrc !== ep(reflexive.B);
  push({
    title: 'B punches back toward A',
    text:
      (newPortB
        ? `B's NAT is symmetric: sending to a new destination creates a new mapping with a different, unpredictable port (${p2.wireSrc} instead of ${ep(reflexive.B)}). `
        : `B's NAT reuses its mapping (${p2.wireSrc}) and now allows traffic from ${ep(reflexive.A)}. `) +
      (p2.delivered
        ? `A's NAT has a matching entry, so the packet gets through to A.`
        : `A's NAT drops it (${p2.dropReason}).`),
    packets: [p2],
  });

  // Peer-reflexive replies: whoever received something answers the address it actually came from.
  let aToB = p1.delivered;
  let bToA = p2.delivered;
  if (!aToB && learned.A) {
    const p = punch('A', learned.A, 'Reply A→B');
    aToB = p.delivered;
    push({
      title: 'A replies to the address B really used',
      text: `A answers the source address it actually saw (${ep(learned.A)}, a "peer-reflexive" address). ${p.delivered ? "B's NAT recognises the reply as part of B's own outgoing flow and lets it in." : `B's NAT still drops it (${p.dropReason}).`}`,
      packets: [p],
    });
  }
  if (!bToA && learned.B) {
    const p = punch('B', learned.B, 'Reply B→A');
    bToA = p.delivered;
    push({
      title: 'B replies to the address A really used',
      text: `B answers the source address it saw (${ep(learned.B)}). ${p.delivered ? "A's NAT lets the reply in." : `A's NAT drops it (${p.dropReason}).`}`,
      packets: [p],
    });
  }

  if (aToB && bToA) {
    push({
      title: 'Direct connection established',
      text: 'Both NATs now hold matching mappings and allow-list entries, so packets flow straight between the peers with the lowest possible latency. Peers keep sending (keep-alives every few seconds) so the NAT mappings do not expire.',
      packets: [
        { path: ['A', 'natA', 'natB', 'B'], label: 'Game data', wireSrc: ep(reflexive.A), wireDst: p2.wireSrc, delivered: true },
        { path: ['B', 'natB', 'natA', 'A'], label: 'Game data', wireSrc: p2.wireSrc, wireDst: ep(reflexive.A), delivered: true },
      ],
      outcome: 'direct',
    });
    return steps;
  }

  push({
    title: 'Hole punching failed',
    text: `Every attempt is dropped: the symmetric NAT hands out a different port for each destination, so the address learned from the rendezvous server is wrong for peer traffic, and the other side's filter rejects the unexpected port. Retrying does not help. Time to fall back to a relay.`,
    packets: [],
  });

  const ra = natA.outbound(ADDR.A, ADDR.relay);
  const rb = natB.outbound(ADDR.B, ADDR.relay);
  push({
    title: 'Both peers connect out to a relay',
    text: `Outbound connections always work, so each peer opens a session with a relay server (TURN, or Steam Datagram Relay on Steam). The NATs create ordinary mappings toward the relay (${ep(ra)} and ${ep(rb)}).`,
    packets: [
      { path: ['A', 'natA', 'relay'], label: 'Allocate', wireSrc: ep(ra), wireDst: ep(ADDR.relay), delivered: true },
      { path: ['B', 'natB', 'relay'], label: 'Allocate', wireSrc: ep(rb), wireDst: ep(ADDR.relay), delivered: true },
    ],
  });
  push({
    title: 'Connected through the relay',
    text: 'Every packet now goes peer → relay → peer. Replies come from the relay, which both NATs already allow. It always works, at the cost of an extra hop of latency and server bandwidth. Relays also hide the players\' IP addresses from each other, which is why Steam relays by default.',
    packets: [
      { path: ['A', 'natA', 'relay', 'natB', 'B'], label: 'Game data', wireSrc: `${ep(ra)} → relay → ${ep(rb)}`, wireDst: ep(rb), delivered: true },
    ],
    outcome: 'relay',
  });
  return steps;
}
