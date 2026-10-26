/**
 * NGO 2.x universal RPCs: [Rpc(SendTo.X)].
 * Checked against the NGO 2.4 manual (RPC page): the method name must end in "Rpc"; Delivery defaults to
 * RpcDelivery.Reliable; a target that includes the local process runs the body locally right away
 * (DeferLocal defers it to the next frame); clients have no direct connections, so the server forwards
 * client-to-client RPCs.
 */
import SequenceCore from './primitives/SequenceCore';
import { DiagramNote, RunsOn, useVariant, VariantSwitcher } from './primitives/VariantSwitcher';
import type { SequenceActor, SequenceStep } from './types';

const VARIANTS = ['to-server', 'to-everyone', 'to-owner'] as const;
type V = (typeof VARIANTS)[number];
const LABELS: Record<V, string> = { 'to-server': 'SendTo.Server', 'to-everyone': 'SendTo.Everyone', 'to-owner': 'SendTo.Owner' };

const actorsClientCaller: SequenceActor[] = [
  { id: 'a', label: 'Client A (caller)', kind: 'client' },
  { id: 's', label: 'Server', kind: 'server' },
  { id: 'b', label: 'Client B', kind: 'client' },
];

const DATA: Record<V, { actors: SequenceActor[]; steps: SequenceStep[]; runs: Array<[string, 'client' | 'server', boolean]> }> = {
  'to-server': {
    actors: actorsClientCaller,
    steps: [
      {
        from: 'a',
        to: 'a',
        kind: 'local',
        label: 'Gameplay code calls FireRpc(aim)',
        code: '[Rpc(SendTo.Server)] void FireRpc(Vector3 aim)',
        note: 'NGO’s generated code intercepts the call. On a client, the method body does NOT run here.',
      },
      {
        from: 'a',
        to: 'a',
        kind: 'local',
        label: 'Serialize into an RPC message',
        note: 'NGO writes which NetworkObject and NetworkBehaviour this is, which RPC method, and the serialized arguments (here a Vector3).',
      },
      {
        from: 'a',
        to: 's',
        kind: 'rpc',
        label: 'Send through the transport',
        code: 'Delivery = RpcDelivery.Reliable (default)',
        note: 'The message is queued and sent by the transport (Unity Transport, FacepunchTransport, …) at the end of the frame.',
      },
      {
        from: 's',
        to: 's',
        kind: 'local',
        tone: 'ok',
        label: 'Server deserializes and runs FireRpc(aim)',
        note: 'The body executes on the server only. Validate the input here: the server is the authority.',
      },
      {
        from: 'b',
        to: 'b',
        kind: 'local',
        tone: 'muted',
        label: 'Client B: nothing arrives, nothing runs',
        note: 'Other clients only learn about the shot through whatever the server does next (spawning a projectile, updating a NetworkVariable).',
      },
    ],
    runs: [
      ['Client A', 'client', false],
      ['Server', 'server', true],
      ['Client B', 'client', false],
    ],
  },
  'to-everyone': {
    actors: actorsClientCaller,
    steps: [
      {
        from: 'a',
        to: 'a',
        kind: 'local',
        label: 'Gameplay code calls EmoteRpc(id)',
        code: '[Rpc(SendTo.Everyone)] void EmoteRpc(int id)',
        note: 'Everyone includes the caller.',
      },
      {
        from: 'a',
        to: 'a',
        kind: 'local',
        tone: 'ok',
        label: 'Body runs locally on Client A right away',
        note: 'Because the caller is one of the targets, NGO invokes it locally with no network trip (set DeferLocal = true to run it on the next network tick instead).',
      },
      {
        from: 'a',
        to: 's',
        kind: 'rpc',
        label: 'RPC message to the server',
        note: 'Clients have no direct connection to each other, so a client-to-client RPC always goes through the server.',
      },
      { from: 's', to: 's', kind: 'local', tone: 'ok', label: 'Server runs EmoteRpc(id)', note: 'The server is part of Everyone too.' },
      {
        from: 's',
        to: 'b',
        kind: 'rpc',
        label: 'Server forwards the RPC to the other clients',
        note: 'The server relays the message to every remaining target. Client A already ran it, so it is not sent back.',
      },
      { from: 'b', to: 'b', kind: 'local', tone: 'ok', label: 'Client B runs EmoteRpc(id)' },
    ],
    runs: [
      ['Client A', 'client', true],
      ['Server', 'server', true],
      ['Client B', 'client', true],
    ],
  },
  'to-owner': {
    actors: [
      { id: 's', label: 'Server (caller)', kind: 'server' },
      { id: 'a', label: 'Client A (owner)', kind: 'client' },
      { id: 'b', label: 'Client B', kind: 'client' },
    ],
    steps: [
      {
        from: 's',
        to: 's',
        kind: 'local',
        label: 'Server calls TakeDamageRpc(10)',
        code: '[Rpc(SendTo.Owner)] void TakeDamageRpc(int amount)',
        note: 'The target is resolved when the RPC is called, from this NetworkObject’s OwnerClientId.',
      },
      { from: 's', to: 's', kind: 'local', label: 'Serialize into an RPC message' },
      {
        from: 's',
        to: 'a',
        kind: 'rpc',
        label: 'Sent only to the owning client',
        note: 'One message, one recipient: no bandwidth is spent on clients that do not need it.',
      },
      { from: 'a', to: 'a', kind: 'local', tone: 'ok', label: 'Client A runs TakeDamageRpc(10)', note: 'Typical use: owner-only feedback such as screen shake or a hit marker.' },
      { from: 'b', to: 'b', kind: 'local', tone: 'muted', label: 'Client B: nothing arrives, nothing runs' },
    ],
    runs: [
      ['Server', 'server', false],
      ['Client A (owner)', 'client', true],
      ['Client B', 'client', false],
    ],
  },
};

export default function NgoRpcFlow({ variant }: { variant?: string }) {
  const v = useVariant(VARIANTS, variant);
  const d = DATA[v.value];
  return (
    <div>
      {!v.pinned && <VariantSwitcher variants={VARIANTS} value={v.value} onChange={v.set} labels={LABELS} label="RPC target" />}
      <SequenceCore
        key={v.value}
        title={`NGO RPC flow, ${LABELS[v.value]}`}
        actors={d.actors}
        steps={d.steps}
        intro={
          <>
            Follow one <code className="font-mono text-xs">[Rpc({LABELS[v.value]})]</code> call from the caller to the machines that execute it.
          </>
        }
        footer={
          <div className="space-y-2">
            <RunsOn title="Body executes on:" items={d.runs.map(([label, kind, yes]) => ({ label, kind, yes }))} />
            <DiagramNote>
              <strong>Host = server + client in one process.</strong> When the host calls an RPC whose targets include itself
              (for example <code className="font-mono text-xs">SendTo.Server</code> from the host), that part runs locally and
              immediately, with no network trip. That is why bugs that depend on latency often hide while you test as host.
            </DiagramNote>
          </div>
        }
      />
    </div>
  );
}
