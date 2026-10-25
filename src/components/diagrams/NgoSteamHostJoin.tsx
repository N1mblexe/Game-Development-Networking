/**
 * NGO + Steam through FacepunchTransport (multiplayer-community-contributions, Transports/com.community.netcode.transport.facepunch).
 * Checked against the transport source: public field `ulong targetSteamId`; StartServer() calls
 * SteamNetworkingSockets.CreateRelaySocket<SocketManager>(); StartClient() calls ConnectRelay<ConnectionManager>(targetSteamId);
 * ServerClientId is 0; Initialize() calls SteamClient.Init(steamAppId, false) when Steam is not yet valid.
 * Facepunch: SteamFriends.OpenGameInviteOverlay(SteamId lobby), SteamFriends.OnGameLobbyJoinRequested(Lobby, SteamId).
 * NGO 2.4: ConnectionApprovalCallback(request, response) with Approved / CreatePlayerObject / Pending / Reason.
 */
import SequenceCore from './primitives/SequenceCore';
import { DiagramNote, useVariant, VariantSwitcher } from './primitives/VariantSwitcher';
import type { SequenceActor, SequenceStep } from './types';

const VARIANTS = ['host', 'client', 'invite'] as const;
type V = (typeof VARIANTS)[number];
const LABELS: Record<V, string> = { host: 'Host', client: 'Client join', invite: 'Invite' };

const actors: SequenceActor[] = [
  { id: 'h', label: 'Host', kind: 'host' },
  { id: 'st', label: 'Steam', kind: 'steam' },
  { id: 'c', label: 'Client', kind: 'client' },
];

const connectSteps = (who: string): SequenceStep[] => [
  {
    from: 'c',
    to: 'c',
    kind: 'local',
    label: 'Point the transport at the lobby owner',
    code: 'transport.targetSteamId = lobby.Owner.Id;',
    note: 'FacepunchTransport.targetSteamId is the only address a client needs: the host’s SteamId (a ulong).',
  },
  {
    from: 'c',
    to: 'c',
    kind: 'local',
    label: 'Start the client',
    code: 'NetworkManager.Singleton.StartClient();',
    note: 'The transport calls SteamNetworkingSockets.ConnectRelay<ConnectionManager>(targetSteamId) under the hood.',
  },
  {
    from: 'c',
    to: 'h',
    kind: 'reliable',
    label: 'Connection request over the Steam relay',
    code: 'ConnectionRequestMessage { ConnectionData }',
    note: `${who} can put a payload (for example an auth ticket or display name) into NetworkConfig.ConnectionData before StartClient().`,
  },
  {
    from: 'h',
    to: 'h',
    kind: 'local',
    label: 'Connection approval',
    code: 'ConnectionApprovalCallback = (req, res) => { res.Approved = true; res.CreatePlayerObject = true; };',
    note: 'Requires NetworkConfig.ConnectionApproval = true. Set res.Reason when rejecting; it is sent to the client.',
  },
  {
    from: 'h',
    to: 'c',
    kind: 'reliable',
    label: 'Approved: scene and existing objects are synchronized',
    code: 'ConnectionApprovedMessage',
  },
  {
    from: 'h',
    to: 'c',
    kind: 'reliable',
    label: 'Player object spawned for the new client',
    code: 'CreateObjectMessage (OwnerClientId = new client)',
    note: 'The host spawns the player prefab with the client as owner; every peer receives the spawn.',
  },
  {
    from: 'c',
    to: 'c',
    kind: 'event',
    tone: 'ok',
    label: 'OnNetworkSpawn on the player (IsOwner == true)',
    note: 'NetworkManager.OnClientConnectedCallback fires as well. The player can now send input.',
  },
];

const DATA: Record<V, { intro: string; steps: SequenceStep[] }> = {
  host: {
    intro: 'The host player creates a Steam lobby, then starts NGO as host with FacepunchTransport.',
    steps: [
      {
        from: 'h',
        to: 'h',
        kind: 'local',
        label: 'Steam is initialized',
        code: 'SteamClient.Init(appId)',
        note: 'FacepunchTransport.Initialize calls SteamClient.Init(steamAppId) if Steam is not running yet; many games initialize Steam themselves at boot.',
      },
      {
        from: 'h',
        to: 'st',
        kind: 'reliable',
        label: 'Create the lobby',
        code: 'Lobby? lobby = await SteamMatchmaking.CreateLobbyAsync(maxPlayers);',
      },
      { from: 'st', to: 'h', kind: 'event', label: 'Lobby created', code: 'SteamMatchmaking.OnLobbyCreated(Result.OK, lobby)' },
      {
        from: 'h',
        to: 'st',
        kind: 'reliable',
        label: 'Make it findable',
        code: 'lobby.SetPublic(); lobby.SetJoinable(true); lobby.SetData("name", "Friday co-op");',
      },
      {
        from: 'h',
        to: 'h',
        kind: 'local',
        label: 'Start NGO as host',
        code: 'NetworkManager.Singleton.StartHost();',
        note: 'FacepunchTransport.StartServer() opens SteamNetworkingSockets.CreateRelaySocket<SocketManager>(). The host’s own client connects in-process, not over Steam.',
      },
      {
        from: 'h',
        to: 'h',
        kind: 'event',
        tone: 'ok',
        label: 'Host player spawns (clientId 0)',
        note: 'The host is both server and client. Its player object spawns locally, and it now waits for clients to connect via the lobby.',
      },
      {
        from: 'st',
        to: 'c',
        kind: 'event',
        tone: 'muted',
        label: 'Lobby is visible to searches and invites',
        note: 'Clients find it with SteamMatchmaking.LobbyList, or the host invites friends (see the Invite variant).',
      },
    ],
  },
  client: {
    intro: 'A client joins the host’s lobby, then connects NGO to the lobby owner’s SteamId.',
    steps: [
      {
        from: 'c',
        to: 'st',
        kind: 'reliable',
        label: 'Join the lobby',
        code: 'RoomEnter r = await lobby.Join();',
        note: 'The lobby came from SteamMatchmaking.LobbyList.RequestAsync() or from an invite.',
      },
      { from: 'st', to: 'c', kind: 'event', label: 'Entered the lobby', code: 'SteamMatchmaking.OnLobbyEntered(lobby)' },
      ...connectSteps('The client'),
    ],
  },
  invite: {
    intro: 'The host invites a friend through the Steam overlay; the friend accepts and joins.',
    steps: [
      {
        from: 'h',
        to: 'st',
        kind: 'reliable',
        label: 'Open the invite dialog',
        code: 'SteamFriends.OpenGameInviteOverlay(lobby.Id);',
        note: 'The Steam overlay opens and the host picks a friend. The overlay must be enabled for the game.',
      },
      {
        from: 'st',
        to: 'c',
        kind: 'event',
        label: 'Friend gets the invite and clicks “Join game”',
        note: 'If the game is not running, Steam launches it with +connect_lobby <lobby id> on the command line; read it at startup.',
      },
      {
        from: 'st',
        to: 'c',
        kind: 'event',
        label: 'Join request reaches the game',
        code: 'SteamFriends.OnGameLobbyJoinRequested += (Lobby lobby, SteamId friend) => …',
        note: 'Not to be confused with SteamMatchmaking.OnLobbyInvite, which fires when an invite arrives while you are in-game.',
      },
      { from: 'c', to: 'st', kind: 'reliable', label: 'Join the lobby', code: 'await lobby.Join();' },
      ...connectSteps('The friend'),
    ],
  },
};

export default function NgoSteamHostJoin({ variant }: { variant?: string }) {
  const v = useVariant(VARIANTS, variant);
  const d = DATA[v.value];
  return (
    <div>
      {!v.pinned && <VariantSwitcher variants={VARIANTS} value={v.value} onChange={v.set} labels={LABELS} label="Flow" />}
      <SequenceCore
        key={v.value}
        title={`NGO and Steam, ${LABELS[v.value]} flow`}
        actors={actors}
        steps={d.steps}
        intro={d.intro}
        footer={
          <DiagramNote>
            <strong>Two layers.</strong> Steam (lobby, invites, relay) answers “who and where”; NGO (approval, spawning, RPCs) runs the game on
            top of the connection FacepunchTransport provides.
          </DiagramNote>
        }
      />
    </div>
  );
}
