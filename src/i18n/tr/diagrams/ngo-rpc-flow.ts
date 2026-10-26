import type en from '../../en/diagrams/ngo-rpc-flow';
import type { Messages } from '../../types';

export default {
  variantLabel: 'RPC hedefi',
  title: (target) => `NGO RPC akışı, ${target}`,
  introBefore: 'Tek bir',
  introAfter: 'çağrısını, çağıran taraftan onu çalıştıran makinelere kadar izle.',
  runsOn: 'Gövde şurada çalışır:',
  hostTitle: 'Host = tek süreçte sunucu + istemci.',
  hostBefore: 'Host, hedefleri arasında kendisinin de bulunduğu bir RPC’yi çağırdığında (örneğin host’tan',
  hostAfter:
    'çağrısı), o kısım ağa hiç çıkmadan, yerelde ve anında çalışır. Gecikmeye bağlı hataların, host olarak test ederken çoğu zaman gizli kalmasının nedeni budur.',
  actors: {
    clientACaller: 'İstemci A (çağıran)',
    clientA: 'İstemci A',
    clientAOwner: 'İstemci A (sahip)',
    clientB: 'İstemci B',
    server: 'Sunucu',
    serverCaller: 'Sunucu (çağıran)',
  },
  steps: {
    'to-server': {
      call: {
        label: 'Oyun kodu FireRpc(aim) çağırır',
        note: 'NGO’nun ürettiği kod çağrıyı yakalar. İstemcide metodun gövdesi burada ÇALIŞMAZ.',
      },
      serialize: {
        label: 'Bir RPC mesajına serileştir',
        note: 'NGO bunun hangi NetworkObject ve NetworkBehaviour olduğunu, hangi RPC metodunu ve serileştirilmiş argümanları (burada bir Vector3) yazar.',
      },
      send: {
        label: 'Transport üzerinden gönder',
        note: 'Mesaj kuyruğa alınır ve karenin sonunda transport (Unity Transport, FacepunchTransport, …) tarafından gönderilir.',
      },
      run: {
        label: 'Sunucu seriden çıkarır ve FireRpc(aim) çalıştırır',
        note: 'Gövde yalnızca sunucuda çalışır. Girdiyi burada doğrula: yetki (authority) sunucudadır.',
      },
      other: {
        label: 'İstemci B: hiçbir şey gelmez, hiçbir şey çalışmaz',
        note: 'Diğer istemciler atışı ancak sunucunun bir sonraki adımıyla öğrenir (bir mermi spawn etmek, bir NetworkVariable güncellemek).',
      },
    },
    'to-everyone': {
      call: { label: 'Oyun kodu EmoteRpc(id) çağırır', note: 'Everyone, çağıranı da kapsar.' },
      local: {
        label: 'Gövde İstemci A’da hemen yerel olarak çalışır',
        note: 'Çağıran da hedeflerden biri olduğu için NGO onu ağa çıkmadan yerelde çalıştırır (bunun yerine bir sonraki ağ tick’inde çalışması için DeferLocal = true ayarla).',
      },
      toServer: {
        label: 'Sunucuya RPC mesajı',
        note: 'İstemcilerin birbirine doğrudan bağlantısı yoktur; bu yüzden istemciden istemciye bir RPC her zaman sunucudan geçer.',
      },
      serverRuns: { label: 'Sunucu EmoteRpc(id) çalıştırır', note: 'Sunucu da Everyone’ın bir parçasıdır.' },
      forward: {
        label: 'Sunucu RPC’yi diğer istemcilere iletir',
        note: 'Sunucu mesajı kalan her hedefe aktarır. İstemci A onu zaten çalıştırdı, o yüzden ona geri gönderilmez.',
      },
      clientRuns: { label: 'İstemci B EmoteRpc(id) çalıştırır' },
    },
    'to-owner': {
      call: {
        label: 'Sunucu TakeDamageRpc(10) çağırır',
        note: 'Hedef, RPC çağrıldığı anda bu NetworkObject’in OwnerClientId değerinden belirlenir.',
      },
      serialize: { label: 'Bir RPC mesajına serileştir' },
      send: {
        label: 'Yalnızca sahip istemciye gönderilir',
        note: 'Tek mesaj, tek alıcı: ihtiyacı olmayan istemciler için bant genişliği harcanmaz.',
      },
      ownerRuns: {
        label: 'İstemci A TakeDamageRpc(10) çalıştırır',
        note: 'Tipik kullanım: ekran sarsıntısı veya isabet göstergesi gibi yalnızca sahibe yönelik geri bildirim.',
      },
      other: { label: 'İstemci B: hiçbir şey gelmez, hiçbir şey çalışmaz' },
    },
  },
} satisfies Messages<typeof en>;
