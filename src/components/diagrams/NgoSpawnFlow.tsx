/**
 * NGO 2.x network spawning.
 * Checked against the NGO 2.4 manual (Object spawning): spawning is server/host only; Instantiate the prefab,
 * then NetworkObject.Spawn(); network prefabs must be registered with the NetworkManager through a
 * NetworkPrefabsList. The client-side error text comes from NetworkSpawnManager.GetNetworkObjectToSpawn.
 */
import SequenceCore from './primitives/SequenceCore';
import { DiagramNote } from './primitives/VariantSwitcher';
import type { SequenceActor, SequenceStep } from './types';

const actors: SequenceActor[] = [
  { id: 's', label: 'Server / host', kind: 'server' },
  { id: 'c', label: 'Client', kind: 'client' },
];

const steps: SequenceStep[] = [
  {
    from: 's',
    to: 's',
    kind: 'local',
    label: 'Instantiate the prefab',
    code: 'var go = Instantiate(enemyPrefab, pos, rot);',
    note: 'At this point it is an ordinary local GameObject. No client knows it exists.',
  },
  {
    from: 's',
    to: 's',
    kind: 'local',
    label: 'Spawn it on the network',
    code: 'go.GetComponent<NetworkObject>().Spawn();',
    note: 'Only the server (or host) may spawn. NGO assigns a NetworkObjectId, registers the object, and makes the server its owner unless you use SpawnWithOwnership.',
  },
  {
    from: 's',
    to: 's',
    kind: 'event',
    label: 'OnNetworkSpawn() on the server',
    note: 'IsServer is true here. Initialize server-side NetworkVariable values before or during spawn so they are included in the spawn data.',
  },
  {
    from: 's',
    to: 'c',
    kind: 'reliable',
    label: 'CreateObjectMessage',
    code: '{ GlobalObjectIdHash, NetworkObjectId, OwnerClientId, transform, NetworkVariable state }',
    note: 'The prefab is identified by its GlobalObjectIdHash, not by name. The initial NetworkVariable values travel in the same message.',
  },
  {
    from: 'c',
    to: 'c',
    kind: 'local',
    tone: 'warn',
    label: 'Look up the hash in the registered NetworkPrefabs',
    note: 'Failure point: if the prefab is missing from the NetworkManager’s NetworkPrefabs list, the client logs “Failed to create object locally. NetworkPrefab could not be found. Is the prefab registered with NetworkManager?” and the object never appears for that client.',
  },
  {
    from: 'c',
    to: 'c',
    kind: 'local',
    label: 'Instantiate the matching prefab and apply its state',
    note: 'The client creates its own copy from the registered prefab, then applies the transform, owner and NetworkVariable values from the message.',
  },
  {
    from: 'c',
    to: 'c',
    kind: 'event',
    tone: 'ok',
    label: 'OnNetworkSpawn() on the client',
    note: 'IsClient is true, and IsOwner tells this client whether it owns the object. NetworkVariables already hold their initial values here.',
  },
];

export default function NgoSpawnFlow() {
  return (
    <SequenceCore
      title="NGO spawn flow"
      actors={actors}
      steps={steps}
      intro="Follow one network prefab from Instantiate on the server to OnNetworkSpawn on a client."
      footer={
        <DiagramNote tone="warn">
          <strong>Register every network prefab.</strong> Add it to a <code className="font-mono text-xs">NetworkPrefabsList</code> asset that the
          NetworkManager references, on <em>every</em> build. Server and client must agree on the list, or spawns fail on clients.
        </DiagramNote>
      }
    />
  );
}
