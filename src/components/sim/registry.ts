/**
 * Simulator registry. Lessons embed a sim with <Sim name="..." preset="..." />.
 *
 * Names and preset names are part of the content contract; scripts/validate-content.ts checks
 * every <Sim> usage against this file. Preset `props` are owned by the simulator implementation.
 * Keep this file free of side-effect imports: it is also loaded by plain Node scripts.
 */
import type { SimDefinition } from './types';

const stub = () => import('./StubSim');

export const sims = {
  'link-playground': {
    title: 'Link Playground',
    description: 'Send packets over a link with adjustable latency, jitter, loss and bandwidth.',
    lessons: ['theory/latency-jitter-loss'],
    load: () => import('./LinkPlayground'),
    defaultPreset: 'broadband',
    presets: {
      lan: {
        label: 'LAN',
        description: 'Under 1 ms, no loss: what most people develop on.',
        props: { latencyMs: 0.5, jitterMs: 0, lossPct: 0, bandwidthKbps: 0 },
      },
      broadband: {
        label: 'Home broadband',
        description: 'Low, steady latency with the occasional lost packet.',
        props: { latencyMs: 15, jitterMs: 3, lossPct: 0.5, bandwidthKbps: 10000 },
      },
      'mobile-4g': {
        label: 'Mobile 4G',
        description: 'Higher latency and noticeable jitter.',
        props: { latencyMs: 45, jitterMs: 15, lossPct: 1, burstLength: 2, bandwidthKbps: 5000 },
      },
      'bad-wifi': {
        label: 'Bad Wi-Fi',
        description: 'Bursty loss and big jitter spikes.',
        props: { latencyMs: 8, jitterMs: 35, lossPct: 6, burstLength: 4, bandwidthKbps: 2000, duplicatePct: 1 },
      },
      intercontinental: {
        label: 'Intercontinental',
        description: '150 ms+ one way: physics wins.',
        props: { latencyMs: 150, jitterMs: 5, lossPct: 0.5, bandwidthKbps: 10000 },
      },
    },
  },
  'tcp-vs-udp': {
    title: 'TCP vs UDP',
    description: 'Watch head-of-line blocking stall TCP while UDP keeps delivering fresh state.',
    lessons: ['theory/packets-and-protocols'],
    load: () => import('./TcpVsUdp'),
    defaultPreset: 'lossy',
    presets: {
      clean: { label: 'Clean link', description: 'Without loss both look the same.', props: { latencyMs: 50, jitterMs: 2, lossPct: 0, sendRateHz: 20 } },
      lossy: { label: '5% loss', description: 'One lost TCP segment blocks every newer one behind it.', props: { latencyMs: 50, jitterMs: 2, lossPct: 5, sendRateHz: 20 } },
    },
  },
  'tick-rate': {
    title: 'Tick Rate',
    description: 'Compare how 10, 30 and 60 Hz simulation ticks sample the same movement.',
    lessons: ['theory/tick-rate'],
    load: () => import('./TickRate'),
    defaultPreset: 'compare',
    presets: {
      compare: { label: '10 / 30 / 60 Hz', props: { rates: [10, 30, 60], speed: 24, sweep: false } },
      'low-tick': { label: '10 Hz only', description: 'Coarse sampling misses fast events.', props: { rates: [10], speed: 24, sweep: false } },
    },
  },
  prediction: {
    title: 'Client-Side Prediction',
    description: 'Move a player under latency with and without prediction and reconciliation.',
    lessons: ['theory/prediction-reconciliation'],
    load: () => import('./Prediction'),
    defaultPreset: 'reconciliation',
    presets: {
      'no-prediction': { label: 'No prediction', description: 'Input feels delayed by a full round trip.', props: { mode: 'none', rttMs: 150 } },
      'prediction-only': { label: 'Prediction only', description: 'Responsive, but drifts from the server.', props: { mode: 'predict', rttMs: 150 } },
      reconciliation: { label: 'Prediction + reconciliation', props: { mode: 'reconcile', rttMs: 150 } },
      'high-latency': { label: '250 ms RTT', description: 'Corrections become visible.', props: { mode: 'reconcile', rttMs: 250 } },
    },
  },
  interpolation: {
    title: 'Entity Interpolation',
    description: 'Render remote players from snapshots: raw, interpolated, or extrapolated.',
    lessons: ['theory/interpolation-extrapolation'],
    load: () => import('./Interpolation'),
    defaultPreset: 'interpolation',
    presets: {
      none: { label: 'Raw snapshots', description: 'Teleporting every snapshot.', props: { mode: 'raw', sendRateHz: 10 } },
      interpolation: { label: 'Interpolation (100 ms buffer)', props: { mode: 'interpolate', renderDelayMs: 100, sendRateHz: 20 } },
      extrapolation: { label: 'Extrapolation', description: 'Smooth until direction changes.', props: { mode: 'extrapolate', sendRateHz: 20 } },
      jittery: { label: 'Jittery link', description: 'Why the buffer size matters.', props: { mode: 'interpolate', renderDelayMs: 60, sendRateHz: 20, jitterMs: 25, lossPct: 3 } },
    },
  },
  'lag-compensation': {
    title: 'Lag Compensation',
    description: 'Shoot at a moving target and see the server rewind hitboxes to judge the shot.',
    lessons: ['theory/lag-compensation'],
    load: () => import('./LagCompensation'),
    defaultPreset: 'rewind',
    presets: {
      'no-compensation': { label: 'No compensation', description: 'You must lead targets by your ping.', props: { mode: 'none', rttMs: 150 } },
      rewind: { label: 'Server rewind', props: { mode: 'rewind', rttMs: 150 } },
    },
  },
  'authority-cheat': {
    title: 'Authority & Cheating',
    description: 'Try to cheat (speed hack, teleport) against client- and server-authoritative rules.',
    lessons: ['theory/authority-models', 'theory/security'],
    load: () => import('./AuthorityCheat'),
    defaultPreset: 'client-authority',
    presets: {
      'client-authority': {
        label: 'Client authoritative',
        description: 'The server believes whatever the client reports, so every cheat reaches the other players.',
        props: { authority: 'client', rttMs: 100 },
      },
      'server-authority': {
        label: 'Server authoritative',
        description: 'The client only sends inputs; the server simulates, validates and rejects the cheats.',
        props: { authority: 'server', rttMs: 100 },
      },
    },
  },
  'snapshot-delta': {
    title: 'Snapshots & Delta Compression',
    description: 'Compare bytes sent for full snapshots vs deltas against the last acked state.',
    lessons: ['theory/state-sync'],
    load: stub,
    defaultPreset: 'delta',
    presets: {
      'full-snapshots': { label: 'Full snapshots', props: {} },
      delta: { label: 'Delta vs last ack', props: {} },
    },
  },
  'bandwidth-calculator': {
    title: 'Bandwidth Calculator',
    description: 'Estimate bandwidth from players, entities, fields, tick rate and bit-packing.',
    lessons: ['theory/reliability-serialization'],
    load: stub,
    defaultPreset: 'coop-4p',
    presets: {
      'coop-4p': { label: '4-player co-op', props: {} },
      'arena-16p': { label: '16-player arena', props: {} },
      'battle-royale': { label: '100-player battle royale', props: {} },
    },
  },
  'nat-traversal': {
    title: 'NAT Traversal',
    description: 'Step through hole punching, and see when a relay is the only way through.',
    lessons: ['theory/nat-and-relays'],
    load: stub,
    defaultPreset: 'cone',
    presets: {
      cone: { label: 'Cone NATs (punch works)', props: {} },
      symmetric: { label: 'Symmetric NAT (relay needed)', props: {} },
    },
  },
} satisfies Record<string, SimDefinition>;

export type SimName = keyof typeof sims;
