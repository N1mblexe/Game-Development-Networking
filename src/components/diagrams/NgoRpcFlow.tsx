/**
 * NGO 2.x universal RPCs: [Rpc(SendTo.X)].
 * Checked against the NGO 2.4 manual (RPC page): the method name must end in "Rpc"; Delivery defaults to
 * RpcDelivery.Reliable; a target that includes the local process runs the body locally right away
 * (DeferLocal defers it to the next frame); clients have no direct connections, so the server forwards
 * client-to-client RPCs.
 *
 * Structure (step ids, arrows, code) lives here; the text is in src/i18n/<locale>/diagrams/ngo-rpc-flow.ts.
 */
import SequenceCore from './primitives/SequenceCore';
import { DiagramNote, RunsOn, useVariant, VariantSwitcher } from './primitives/VariantSwitcher';
import type Msgs from '../../i18n/en/diagrams/ngo-rpc-flow';
import { useLazyT } from '../../i18n/react';
import { withActorText, withStepText, type ActorShape, type StepShape } from '../../lib/i18n/diagram';

const VARIANTS = ['to-server', 'to-everyone', 'to-owner'] as const;
type V = (typeof VARIANTS)[number];
// API names, not translated.
const LABELS: Record<V, string> = { 'to-server': 'SendTo.Server', 'to-everyone': 'SendTo.Everyone', 'to-owner': 'SendTo.Owner' };

type ActorKey = keyof (typeof Msgs)['actors'];
const actorsClientCaller: ActorShape<ActorKey>[] = [
  { id: 'a', label: 'clientACaller', kind: 'client' },
  { id: 's', label: 'server', kind: 'server' },
  { id: 'b', label: 'clientB', kind: 'client' },
];

const DATA: Record<V, { actors: ActorShape<ActorKey>[]; steps: StepShape[]; runs: Array<[ActorKey, 'client' | 'server', boolean]> }> = {
  'to-server': {
    actors: actorsClientCaller,
    steps: [
      { id: 'call', from: 'a', to: 'a', kind: 'local', code: '[Rpc(SendTo.Server)] void FireRpc(Vector3 aim)' },
      { id: 'serialize', from: 'a', to: 'a', kind: 'local' },
      { id: 'send', from: 'a', to: 's', kind: 'rpc', code: 'Delivery = RpcDelivery.Reliable (default)' },
      { id: 'run', from: 's', to: 's', kind: 'local', tone: 'ok' },
      { id: 'other', from: 'b', to: 'b', kind: 'local', tone: 'muted' },
    ],
    runs: [
      ['clientA', 'client', false],
      ['server', 'server', true],
      ['clientB', 'client', false],
    ],
  },
  'to-everyone': {
    actors: actorsClientCaller,
    steps: [
      { id: 'call', from: 'a', to: 'a', kind: 'local', code: '[Rpc(SendTo.Everyone)] void EmoteRpc(int id)' },
      { id: 'local', from: 'a', to: 'a', kind: 'local', tone: 'ok' },
      { id: 'toServer', from: 'a', to: 's', kind: 'rpc' },
      { id: 'serverRuns', from: 's', to: 's', kind: 'local', tone: 'ok' },
      { id: 'forward', from: 's', to: 'b', kind: 'rpc' },
      { id: 'clientRuns', from: 'b', to: 'b', kind: 'local', tone: 'ok' },
    ],
    runs: [
      ['clientA', 'client', true],
      ['server', 'server', true],
      ['clientB', 'client', true],
    ],
  },
  'to-owner': {
    actors: [
      { id: 's', label: 'serverCaller', kind: 'server' },
      { id: 'a', label: 'clientAOwner', kind: 'client' },
      { id: 'b', label: 'clientB', kind: 'client' },
    ],
    steps: [
      { id: 'call', from: 's', to: 's', kind: 'local', code: '[Rpc(SendTo.Owner)] void TakeDamageRpc(int amount)' },
      { id: 'serialize', from: 's', to: 's', kind: 'local' },
      { id: 'send', from: 's', to: 'a', kind: 'rpc' },
      { id: 'ownerRuns', from: 'a', to: 'a', kind: 'local', tone: 'ok' },
      { id: 'other', from: 'b', to: 'b', kind: 'local', tone: 'muted' },
    ],
    runs: [
      ['server', 'server', false],
      ['clientAOwner', 'client', true],
      ['clientB', 'client', false],
    ],
  },
};

export default function NgoRpcFlow({ variant }: { variant?: string }) {
  const m = useLazyT<typeof Msgs>('diagrams/ngo-rpc-flow');
  const v = useVariant(VARIANTS, variant);
  const d = DATA[v.value];
  return (
    <div>
      {!v.pinned && <VariantSwitcher variants={VARIANTS} value={v.value} onChange={v.set} labels={LABELS} label={m.variantLabel} />}
      <SequenceCore
        key={v.value}
        title={m.title(LABELS[v.value])}
        actors={withActorText(d.actors, m.actors)}
        steps={withStepText(d.steps, m.steps[v.value])}
        intro={
          <>
            {m.introBefore} <code className="font-mono text-xs">[Rpc({LABELS[v.value]})]</code> {m.introAfter}
          </>
        }
        footer={
          <div className="space-y-2">
            <RunsOn title={m.runsOn} items={d.runs.map(([label, kind, yes]) => ({ label: m.actors[label], kind, yes }))} />
            <DiagramNote>
              <strong>{m.hostTitle}</strong> {m.hostBefore} <code className="font-mono text-xs">SendTo.Server</code> {m.hostAfter}
            </DiagramNote>
          </div>
        }
      />
    </div>
  );
}
