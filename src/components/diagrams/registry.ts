/**
 * Diagram registry. Lessons embed a diagram with <Diagram name="..." variant="..." />.
 * Names and variants are part of the content contract (checked by scripts/validate-content.ts).
 * Keep this file free of side-effect imports: it is also loaded by plain Node scripts.
 */
import type { DiagramDefinition } from './types';

const stub = () => import('./StubDiagram');

export const diagrams = {
  'packet-journey': {
    title: 'A Packet’s Journey',
    description: 'From game state to bytes, through routers and NAT, back to game state.',
    lessons: ['theory/packets-and-protocols'],
    load: stub,
  },
  topology: {
    title: 'Network Topologies',
    description: 'Who talks to whom, and who holds the truth.',
    lessons: ['theory/topologies'],
    variants: ['dedicated', 'listen-server', 'p2p', 'relay', 'distributed-authority'],
    load: stub,
  },
  'ngo-rpc-flow': {
    title: 'NGO RPC Flow',
    description: 'How an [Rpc] call travels from caller to the SendTo targets.',
    lessons: ['ngo/rpcs'],
    variants: ['to-server', 'to-everyone', 'to-owner'],
    load: stub,
  },
  'ngo-netvar-flow': {
    title: 'NetworkVariable Propagation',
    description: 'Write on the authority, dirty flag, tick, delta to clients, OnValueChanged.',
    lessons: ['ngo/network-variables'],
    load: stub,
  },
  'ngo-spawn-flow': {
    title: 'NGO Spawn Flow',
    description: 'Instantiate, Spawn(), spawn message, client-side instantiation, OnNetworkSpawn.',
    lessons: ['ngo/network-objects'],
    load: stub,
  },
  'steam-lobby-p2p-flow': {
    title: 'Steam Lobby → P2P Connection',
    description: 'Create lobby, join, read owner SteamId, connect through Steam Datagram Relay.',
    lessons: ['steam/lobbies', 'steam/networking-sockets'],
    load: stub,
  },
  'ngo-steam-host-join': {
    title: 'NGO + Steam: Host & Join',
    description: 'The full sequence from lobby creation to a spawned player object on both sides.',
    lessons: ['ngo-steam/host-flow', 'ngo-steam/client-flow'],
    variants: ['host', 'client', 'invite'],
    load: stub,
  },
} satisfies Record<string, DiagramDefinition>;

export type DiagramName = keyof typeof diagrams;
