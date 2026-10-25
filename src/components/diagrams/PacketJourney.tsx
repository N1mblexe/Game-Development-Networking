/**
 * A packet's journey: game state → bytes → UDP → IP → NAT → internet hops → server NIC → unwrap → game state.
 * Header sizes are the IPv4 minimum (20 B) and the fixed UDP header (8 B, RFC 768).
 */
import type { ReactNode } from 'react';
import ActorIcon, { type ActorKind } from './primitives/ActorIcon';
import StepperControls from './primitives/StepperControls';
import { useStepper } from './primitives/useStepper';
import './diagrams.css';

const stations: Array<{ label: string; kind: ActorKind }> = [
  { label: 'Player’s PC', kind: 'client' },
  { label: 'Home router (NAT)', kind: 'relay' },
  { label: 'Internet routers', kind: 'service' },
  { label: 'Server NIC', kind: 'server' },
  { label: 'Server game', kind: 'server' },
];

type Layer = 'ip' | 'udp' | 'payload';
interface Field {
  k: string;
  v: string;
  changed?: boolean;
}
interface Stage {
  title: string;
  station: number;
  text: ReactNode;
  /** Layers on the wire at this stage; undefined = show the C# object instead. */
  layers?: Layer[];
  /** Layers being removed (drawn struck through). */
  stripped?: Layer[];
  focus?: Layer;
  fields?: Field[];
  code?: string;
}

const STATE = `new PlayerState {
  playerId = 3,
  x = 3.25f,  z = 7.5f,
  yaw = 90
}`;
const BYTES = '03 00 · 00 00 50 40 · 00 00 F0 40 · 5A 00';

const ipFields = (src: string, ttl: number, changed: Array<'src' | 'ttl'> = []): Field[] => [
  { k: 'Source', v: src, changed: changed.includes('src') },
  { k: 'Destination', v: '203.0.113.7' },
  { k: 'TTL', v: String(ttl), changed: changed.includes('ttl') },
  { k: 'Protocol', v: '17 (UDP)' },
  { k: 'Total length', v: '40 bytes' },
];

const stages: Stage[] = [
  {
    title: 'Game state',
    station: 0,
    text: (
      <>
        The client wants to tell the server where player 3 is. Right now it is just a C# object in memory, meaningful only to this
        process.
      </>
    ),
    code: STATE,
  },
  {
    title: 'Serialize to bytes',
    station: 0,
    text: (
      <>
        The netcode writes each field into a byte buffer in an agreed order (here little-endian: a 2-byte id, two 4-byte floats, a
        2-byte yaw). <strong>12 bytes</strong> of payload. The other side must read them back in exactly the same order.
      </>
    ),
    layers: ['payload'],
    focus: 'payload',
    fields: [{ k: 'Payload', v: BYTES }],
  },
  {
    title: 'Add a UDP header',
    station: 0,
    text: (
      <>
        The OS wraps the payload in an 8-byte UDP header. Ports pick the <em>program</em>: the game’s socket on this PC (51000) and the
        server’s game port (7777).
      </>
    ),
    layers: ['udp', 'payload'],
    focus: 'udp',
    fields: [
      { k: 'Source port', v: '51000' },
      { k: 'Destination port', v: '7777' },
      { k: 'Length', v: '20 bytes' },
      { k: 'Checksum', v: '0x3a1f' },
    ],
  },
  {
    title: 'Add an IP header',
    station: 0,
    text: (
      <>
        Next comes a 20-byte IPv4 header. IP addresses pick the <em>machine</em>. TTL (time to live) starts at 64 and limits how many
        routers the packet may cross.
      </>
    ),
    layers: ['ip', 'udp', 'payload'],
    focus: 'ip',
    fields: ipFields('192.168.1.23', 64),
  },
  {
    title: 'Home router rewrites the address (NAT)',
    station: 1,
    text: (
      <>
        192.168.x.x is a private address that means nothing on the internet. The router swaps in its public address and a port of its
        choosing, and remembers the mapping so the server’s replies can find their way back. This is why players behind NAT can’t
        simply accept incoming connections.
      </>
    ),
    layers: ['ip', 'udp', 'payload'],
    focus: 'ip',
    fields: [
      ...ipFields('198.51.100.4', 63, ['src', 'ttl']),
      { k: 'UDP source port', v: '51000 → 62001', changed: true },
    ],
  },
  {
    title: 'Hop across internet routers',
    station: 2,
    text: (
      <>
        Each router reads only the destination IP, picks the next hop, and lowers TTL by one. A typical path is 10 to 20 hops. Any of
        them may queue the packet (latency and jitter), reorder it, or drop it when busy (loss). Nobody tells the sender.
      </>
    ),
    layers: ['ip', 'udp', 'payload'],
    focus: 'ip',
    fields: ipFields('198.51.100.4', 52, ['ttl']),
  },
  {
    title: 'Arrive at the server’s network card',
    station: 3,
    text: (
      <>
        The destination 203.0.113.7 matches the server. The OS checks the UDP destination port, 7777, and queues the datagram for the
        socket bound to that port: the game server process.
      </>
    ),
    layers: ['ip', 'udp', 'payload'],
    focus: 'udp',
    fields: [
      { k: 'Destination', v: '203.0.113.7:7777' },
      { k: 'Delivered to', v: 'socket bound to :7777', changed: true },
    ],
  },
  {
    title: 'Unwrap the headers',
    station: 4,
    text: (
      <>
        The OS strips the IP and UDP headers. The game receives the 12 payload bytes plus the sender’s endpoint, which is the router’s
        public address <code>198.51.100.4:62001</code>. The server never sees the player’s private address.
      </>
    ),
    layers: ['ip', 'udp', 'payload'],
    stripped: ['ip', 'udp'],
    focus: 'payload',
    fields: [
      { k: 'Payload', v: BYTES },
      { k: 'From', v: '198.51.100.4:62001', changed: true },
    ],
  },
  {
    title: 'Deserialize',
    station: 4,
    text: (
      <>
        The server reads the bytes back in the same order: ushort, float, float, ushort. If either side changes the order or a type,
        the values come out as garbage, which is why both builds must share the same serialization code.
      </>
    ),
    layers: ['payload'],
    focus: 'payload',
    fields: [
      { k: '03 00', v: 'playerId = 3' },
      { k: '00 00 50 40', v: 'x = 3.25' },
      { k: '00 00 F0 40', v: 'z = 7.5' },
      { k: '5A 00', v: 'yaw = 90' },
    ],
  },
  {
    title: 'Game state again',
    station: 4,
    text: (
      <>
        The server applies the update to player 3. Round trip so far: one way, typically 10 to 80 ms. The reply makes the same trip
        backwards, and the home router’s NAT mapping is what lets it in.
      </>
    ),
    code: STATE,
  },
];

const LAYER_STYLE: Record<Layer, { label: string; bytes: number; color: string }> = {
  ip: { label: 'IP header', bytes: 20, color: 'var(--dg-server)' },
  udp: { label: 'UDP', bytes: 8, color: 'var(--dg-relay)' },
  payload: { label: 'Payload', bytes: 12, color: 'var(--dg-client)' },
};

export default function PacketJourney() {
  const s = useStepper(stages.length, { initial: 0, stepMs: 3200 });
  const stage = stages[Math.max(0, s.index)];
  const n = stations.length;
  const pos = ((stage.station + 0.5) / n) * 100;

  return (
    <div className="space-y-4" data-packet-journey>
      {/* Route strip */}
      <div className="relative" aria-hidden="true">
        <div className="absolute top-[1.85rem] right-[10%] left-[10%] h-0.5 bg-border" />
        <div
          className="absolute top-[1.85rem] left-[10%] h-0.5 bg-accent transition-[width] duration-500"
          style={{ width: `${pos - 10}%` }}
        />
        <ol className="relative grid list-none pl-0" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {stations.map((st, i) => {
            const here = i === stage.station;
            const passed = i < stage.station;
            return (
              <li key={st.label} className={`dg-kind-${st.kind} flex flex-col items-center gap-1 px-0.5 text-center`}>
                <span className="h-3" />
                <span
                  className="relative grid h-9 w-9 place-items-center rounded-full border-2 bg-surface transition-colors"
                  style={{
                    borderColor: here ? 'var(--accent)' : passed ? 'color-mix(in srgb, var(--accent) 50%, var(--border))' : 'var(--border)',
                    color: here || passed ? 'var(--kind)' : 'var(--muted)',
                    boxShadow: here ? '0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent)' : undefined,
                  }}
                >
                  <ActorIcon kind={st.kind} className="h-4.5 w-4.5" />
                </span>
                <span className={`text-[0.68rem] leading-tight sm:text-xs ${here ? 'font-semibold text-text' : 'text-muted'}`}>{st.label}</span>
              </li>
            );
          })}
        </ol>
        {/* the packet marker */}
        <div className="absolute top-0 -translate-x-1/2 transition-[left] duration-500 ease-out" style={{ left: `${pos}%` }}>
          <span className="block h-2.5 w-4 rounded-sm bg-accent shadow" />
        </div>
      </div>

      {/* Stage description */}
      <div className="rounded-lg border border-border bg-surface-2 p-3" aria-live="polite">
        <p className="text-sm font-semibold">
          <span className="mr-1.5 font-mono text-xs text-muted">
            {s.index + 1}/{stages.length}
          </span>
          {stage.title}
        </p>
        <p className="mt-1 text-sm text-muted [&_code]:font-mono [&_code]:text-xs [&_code]:text-text">{stage.text}</p>
      </div>

      {/* Packet view */}
      <div className="min-h-[9.5rem]">
        {stage.code ? (
          <pre className="overflow-x-auto rounded-lg border border-border bg-surface p-3 font-mono text-xs leading-relaxed">
            <code>{stage.code}</code>
          </pre>
        ) : (
          <div>
            <div className="flex h-11 overflow-hidden rounded-lg border border-border font-mono text-[0.68rem] sm:text-xs" role="img" aria-label={`Packet layout: ${stage.layers!.map((l) => `${LAYER_STYLE[l].label} ${LAYER_STYLE[l].bytes} bytes${stage.stripped?.includes(l) ? ' (being removed)' : ''}`).join(', ')}`}>
              {stage.layers!.map((l) => {
                const ls = LAYER_STYLE[l];
                const stripped = stage.stripped?.includes(l);
                const focus = stage.focus === l;
                return (
                  <div
                    key={l}
                    className="flex min-w-0 flex-col items-center justify-center border-r border-surface px-1 text-center leading-tight last:border-r-0"
                    style={{
                      flexGrow: ls.bytes,
                      flexBasis: 0,
                      background: `color-mix(in srgb, ${ls.color} ${focus ? 30 : 14}%, var(--surface))`,
                      opacity: stripped ? 0.4 : 1,
                      textDecoration: stripped ? 'line-through' : undefined,
                    }}
                  >
                    <span className="truncate font-semibold" style={{ color: ls.color }}>
                      {ls.label}
                    </span>
                    <span className="text-muted">{ls.bytes} B</span>
                  </div>
                );
              })}
            </div>
            {stage.fields && (
              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                {stage.fields.map((f) => (
                  <div key={f.k} className="contents">
                    <dt className="font-mono text-xs leading-5 text-muted">{f.k}</dt>
                    <dd className={`font-mono text-xs leading-5 break-words ${f.changed ? 'font-semibold text-warn' : ''}`}>
                      {f.v}
                      {f.changed && <span className="sr-only"> (changed)</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <StepperControls s={s} label="Stage" />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Jump to stage">
          {stages.map((st, i) => (
            <button
              key={st.title}
              type="button"
              onClick={() => s.goTo(i)}
              aria-label={`Stage ${i + 1}: ${st.title}`}
              aria-current={i === s.index ? 'step' : undefined}
              className={`h-3 w-3 rounded-full border transition-colors ${i === s.index ? 'border-accent bg-accent' : i < s.index ? 'border-accent bg-accent-soft' : 'border-border bg-surface-2'}`}
            />
          ))}
        </div>
      </div>

      {/* Text alternative: every stage in order, independent of the stepper position. */}
      <div className="sr-only">
        <p>A packet’s journey in {stages.length} stages, from {stations[0].label} to {stations[stations.length - 1].label}:</p>
        <ol>
          {stages.map((st) => (
            <li key={st.title}>
              {st.title} (at {stations[st.station].label}): {st.text}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
