/**
 * NetworkVariable propagation in NGO 2.x.
 * Checked against the NGO 2.4 manual (NetworkVariables): default permissions are server-write / everyone-read;
 * ReadPermission.Owner limits reads to the owner and server; OnValueChanged(previous, current); a client that
 * connects later is synchronized with the current value when the NetworkObject spawns.
 * Dirty variables are collected on the network tick (NetworkConfig.TickRate, default 30) and sent as
 * NetworkVariableDeltaMessage.
 */
import SequenceCore from './primitives/SequenceCore';
import { DiagramNote } from './primitives/VariantSwitcher';
import type { SequenceActor, SequenceStep } from './types';

const actors: SequenceActor[] = [
  { id: 's', label: 'Server (authority)', kind: 'server' },
  { id: 'a', label: 'Client A (owner)', kind: 'client' },
  { id: 'b', label: 'Client B', kind: 'client' },
  { id: 'l', label: 'Late joiner', kind: 'client' },
];

const steps: SequenceStep[] = [
  {
    from: 's',
    to: 's',
    kind: 'local',
    label: 'Authority writes .Value',
    code: 'health.Value = 75;',
    note: 'Only the authority may write: the server by default, or the owner with NetworkVariableWritePermission.Owner. A write from anyone else is rejected with an error.',
  },
  {
    from: 's',
    to: 's',
    kind: 'local',
    label: 'Value changed, so the variable is marked dirty',
    note: 'Nothing is sent yet. If you write three times before the next tick, only the latest value goes out. (Collections need CheckDirtyState() after in-place edits.)',
  },
  {
    from: 's',
    to: 's',
    kind: 'local',
    label: 'Network tick: NetworkManager collects dirty variables',
    code: 'NetworkConfig.TickRate = 30 // default',
    note: 'On every network tick, NGO walks the spawned NetworkBehaviours that have dirty variables and builds one delta per object for each client.',
  },
  {
    from: 's',
    to: 'a',
    kind: 'reliable',
    label: 'Delta: only the changed variables',
    code: 'NetworkVariableDeltaMessage',
    note: 'Sent reliably. Clients that are not allowed to read the variable are skipped: with ReadPermission.Owner only the owner (and the server) receive it.',
  },
  { from: 's', to: 'b', kind: 'reliable', label: 'Same delta to Client B (ReadPermission.Everyone)', code: 'NetworkVariableDeltaMessage' },
  {
    from: 'a',
    to: 'a',
    kind: 'event',
    tone: 'ok',
    label: 'Apply, then OnValueChanged(100, 75) fires',
    code: 'health.OnValueChanged += (prev, next) => …',
    note: 'The callback receives the previous and the new value. Subscribe in OnNetworkSpawn and unsubscribe in OnNetworkDespawn.',
  },
  { from: 'b', to: 'b', kind: 'event', tone: 'ok', label: 'Apply, then OnValueChanged(100, 75) fires' },
  {
    from: 's',
    to: 'l',
    kind: 'reliable',
    label: 'Late join: the spawn payload carries the full current value',
    code: 'CreateObjectMessage { …, health = 75 }',
    note: 'A client that connects later never sees the history (100 → 75). It receives the current value as part of the object’s spawn data.',
  },
  {
    from: 'l',
    to: 'l',
    kind: 'local',
    label: 'OnNetworkSpawn reads health.Value == 75',
    note: 'OnValueChanged does not fire for this initial value, so initialize visuals from .Value in OnNetworkSpawn as well as in the callback.',
  },
];

export default function NgoNetvarFlow() {
  return (
    <SequenceCore
      title="NetworkVariable propagation"
      actors={actors}
      steps={steps}
      intro={
        <>
          A <code className="font-mono text-xs">NetworkVariable&lt;int&gt; health</code> changes from 100 to 75 on the server. Step through to see how
          (and when) each client learns about it.
        </>
      }
      footer={
        <DiagramNote>
          <strong>State, not events.</strong> A NetworkVariable delivers the <em>latest</em> value, including to players who join later.
          Use an RPC for one-off events (an explosion, a chat line) that late joiners should not replay.
        </DiagramNote>
      }
    />
  );
}
