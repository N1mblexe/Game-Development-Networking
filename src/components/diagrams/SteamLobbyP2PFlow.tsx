/**
 * Steam lobby → P2P connection with Facepunch.Steamworks.
 * API names checked against Facepunch.Steamworks master: SteamMatchmaking.CreateLobbyAsync(int maxMembers) → Task<Lobby?>,
 * Lobby.SetData/SetPublic/SetJoinable(bool), SteamMatchmaking.LobbyList (LobbyQuery.WithKeyValue / RequestAsync),
 * Lobby.Join() → Task<RoomEnter>, Lobby.Owner (Friend, .Id), SteamNetworkingSockets.CreateRelaySocket<T>(int virtualport = 0)
 * and ConnectRelay<T>(SteamId serverId, int virtualport = 0); SocketManager.OnConnecting accepts by default.
 */
import SequenceCore from './primitives/SequenceCore';
import { DiagramNote } from './primitives/VariantSwitcher';
import type { SequenceActor, SequenceStep } from './types';

const actors: SequenceActor[] = [
  { id: 'h', label: 'Host', kind: 'host' },
  { id: 'st', label: 'Steam backend', kind: 'steam' },
  { id: 'r', label: 'Datagram Relay', kind: 'relay' },
  { id: 'c', label: 'Client', kind: 'client' },
];

const steps: SequenceStep[] = [
  {
    from: 'h',
    to: 'st',
    kind: 'reliable',
    label: 'Create a lobby',
    code: 'Lobby? lobby = await SteamMatchmaking.CreateLobbyAsync(4);',
    note: 'Returns null on failure. A lobby is a matchmaking room hosted by Steam, not a game server: no gameplay traffic goes through it.',
  },
  {
    from: 'st',
    to: 'h',
    kind: 'event',
    label: 'Lobby created; the host is its owner',
    code: 'SteamMatchmaking.OnLobbyCreated(Result, Lobby)',
  },
  {
    from: 'h',
    to: 'st',
    kind: 'reliable',
    label: 'Describe and open the lobby',
    code: 'lobby.SetData("mode", "coop"); lobby.SetPublic(); lobby.SetJoinable(true);',
    note: 'Lobby data is a small string key/value store that other players can filter on before joining.',
  },
  {
    from: 'h',
    to: 'h',
    kind: 'local',
    label: 'Listen for P2P connections',
    code: 'SteamNetworkingSockets.CreateRelaySocket<MySocketManager>();',
    note: 'The socket is addressed by the host’s SteamId, not an IP address and port.',
  },
  {
    from: 'c',
    to: 'st',
    kind: 'reliable',
    label: 'Find the lobby (or accept an invite)',
    code: 'await SteamMatchmaking.LobbyList.WithKeyValue("mode", "coop").RequestAsync();',
    note: 'Invites skip the search: SteamFriends.OnGameLobbyJoinRequested hands the client the Lobby directly.',
  },
  {
    from: 'c',
    to: 'st',
    kind: 'reliable',
    label: 'Join it',
    code: 'RoomEnter result = await lobby.Join();',
    note: 'RoomEnter.Success means the client is now a lobby member; SteamMatchmaking.OnLobbyEntered fires.',
  },
  {
    from: 'c',
    to: 'c',
    kind: 'local',
    label: 'Read who to connect to',
    code: 'SteamId hostId = lobby.Owner.Id;',
    note: 'The lobby owner is the host. Some games also store the host SteamId in lobby data so it survives an ownership change.',
  },
  {
    from: 'c',
    to: 'r',
    kind: 'unreliable',
    label: 'Connect to the host’s SteamId',
    code: 'SteamNetworkingSockets.ConnectRelay<MyConnectionManager>(hostId);',
    note: 'Steam Datagram Relay can route the connection through Valve’s relay network, so neither player needs port forwarding. While traffic is relayed, IP addresses stay hidden; a direct (ICE) route, if Steam picks one, shares them.',
  },
  {
    from: 'r',
    to: 'h',
    kind: 'unreliable',
    label: 'Relayed connection request',
    code: 'SocketManager.OnConnecting(connection, info)',
    note: 'The default OnConnecting calls connection.Accept(). Override it to reject unknown players.',
  },
  {
    from: 'h',
    to: 'c',
    kind: 'reliable',
    tone: 'ok',
    label: 'Connected: game messages flow through the relay',
    code: 'connection.SendMessage(data, SendType.Reliable);',
    note: 'OnConnected fires on both sides. From here, the lobby is only used for chat, metadata and invites.',
  },
];

export default function SteamLobbyP2PFlow() {
  return (
    <SequenceCore
      title="Steam lobby to P2P connection"
      actors={actors}
      steps={steps}
      intro="Two players meet in a Steam lobby, then open a SteamId-to-SteamId connection that Steam can carry over the Steam Datagram Relay."
      footer={
        <DiagramNote>
          <strong>Lobby ≠ connection.</strong> The lobby (through the Steam backend) is how players find each other. The socket (through
          the relay) is how game data travels. You need both.
        </DiagramNote>
      }
    />
  );
}
