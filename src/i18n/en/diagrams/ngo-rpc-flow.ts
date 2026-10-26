/**
 * NgoRpcFlow diagram (src/components/diagrams/NgoRpcFlow.tsx). Lazy namespace "diagrams/ngo-rpc-flow".
 * The component keeps the structure (step ids, from/to, kind, tone, code); this file holds the text, keyed by
 * variant and step id. Text around inline code is split into before/after strings.
 */
import type { Dict } from '../../types';

export default {
  variantLabel: 'RPC target',
  title: (target: string) => `NGO RPC flow, ${target}`,
  introBefore: 'Follow one',
  introAfter: 'call from the caller to the machines that execute it.',
  runsOn: 'Body executes on:',
  hostTitle: 'Host = server + client in one process.',
  hostBefore: 'When the host calls an RPC whose targets include itself (for example',
  hostAfter:
    'from the host), that part runs locally and immediately, with no network trip. That is why bugs that depend on latency often hide while you test as host.',
  actors: {
    clientACaller: 'Client A (caller)',
    clientA: 'Client A',
    clientAOwner: 'Client A (owner)',
    clientB: 'Client B',
    server: 'Server',
    serverCaller: 'Server (caller)',
  },
  steps: {
    'to-server': {
      call: {
        label: 'Gameplay code calls FireRpc(aim)',
        note: 'NGO’s generated code intercepts the call. On a client, the method body does NOT run here.',
      },
      serialize: {
        label: 'Serialize into an RPC message',
        note: 'NGO writes which NetworkObject and NetworkBehaviour this is, which RPC method, and the serialized arguments (here a Vector3).',
      },
      send: {
        label: 'Send through the transport',
        note: 'The message is queued and sent by the transport (Unity Transport, FacepunchTransport, …) at the end of the frame.',
      },
      run: {
        label: 'Server deserializes and runs FireRpc(aim)',
        note: 'The body executes on the server only. Validate the input here: the server is the authority.',
      },
      other: {
        label: 'Client B: nothing arrives, nothing runs',
        note: 'Other clients only learn about the shot through whatever the server does next (spawning a projectile, updating a NetworkVariable).',
      },
    },
    'to-everyone': {
      call: { label: 'Gameplay code calls EmoteRpc(id)', note: 'Everyone includes the caller.' },
      local: {
        label: 'Body runs locally on Client A right away',
        note: 'Because the caller is one of the targets, NGO invokes it locally with no network trip (set DeferLocal = true to run it on the next network tick instead).',
      },
      toServer: {
        label: 'RPC message to the server',
        note: 'Clients have no direct connection to each other, so a client-to-client RPC always goes through the server.',
      },
      serverRuns: { label: 'Server runs EmoteRpc(id)', note: 'The server is part of Everyone too.' },
      forward: {
        label: 'Server forwards the RPC to the other clients',
        note: 'The server relays the message to every remaining target. Client A already ran it, so it is not sent back.',
      },
      clientRuns: { label: 'Client B runs EmoteRpc(id)' },
    },
    'to-owner': {
      call: {
        label: 'Server calls TakeDamageRpc(10)',
        note: 'The target is resolved when the RPC is called, from this NetworkObject’s OwnerClientId.',
      },
      serialize: { label: 'Serialize into an RPC message' },
      send: {
        label: 'Sent only to the owning client',
        note: 'One message, one recipient: no bandwidth is spent on clients that do not need it.',
      },
      ownerRuns: {
        label: 'Client A runs TakeDamageRpc(10)',
        note: 'Typical use: owner-only feedback such as screen shake or a hit marker.',
      },
      other: { label: 'Client B: nothing arrives, nothing runs' },
    },
  },
} satisfies Dict;
