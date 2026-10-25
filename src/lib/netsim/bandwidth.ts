/**
 * Back-of-the-envelope bandwidth for a snapshot-based game: what each client downloads and
 * uploads, and what the server must send in total.
 *
 *   entity bits    = Σ (components × bits per component)      (quantized or raw)
 *   payload bits   = count + sent entities × (id + entity bits)
 *   sent entities  = all relevant entities, or only the changed share with delta compression
 *   packets        = ceil(payload bytes / (MTU budget − transport header))
 *   wire bytes     = payload bytes + packets × (IP/UDP header + transport header)
 *   kbps           = wire bytes × 8 × rate / 1000
 */

export interface BandwidthField {
  name: string;
  /** Components, e.g. 3 for a position. */
  count: number;
  /** Bits per component as a plain type (32 for a float). */
  rawBits: number;
  /** Bits per component after quantization. */
  quantBits: number;
}

export interface BandwidthInput {
  players: number;
  /** Entities replicated to each client (after interest management). */
  entities: number;
  fields: readonly BandwidthField[];
  /** Server → client snapshots per second. */
  sendRateHz: number;
  /** Client → server input packets per second. */
  inputRateHz: number;
  /** Input payload per packet (buttons, aim, redundant copies of recent inputs). */
  inputBytes: number;
  /** 28 for IPv4 (20) + UDP (8); 48 for IPv6 (40) + UDP (8). */
  ipHeaderBytes: number;
  /** The networking library's own header: sequence, acks, channel, fragment info. */
  transportHeaderBytes: number;
  quantize: boolean;
  delta: boolean;
  /** With delta compression: share of entities that changed since the acknowledged baseline. */
  changedPct: number;
  /** Largest UDP payload sent without IP fragmentation (1200 is a common safe budget). */
  mtuPayloadBytes?: number;
}

export interface BandwidthResult {
  entityBits: number;
  idBits: number;
  countBits: number;
  sentEntities: number;
  payloadBytes: number;
  packetsPerSnapshot: number;
  headerBytesPerSnapshot: number;
  wireBytesPerSnapshot: number;
  inputWireBytes: number;
  /** Per client, kbit/s. */
  downKbps: number;
  upKbps: number;
  /** Server totals, kbit/s. */
  serverEgressKbps: number;
  serverIngressKbps: number;
  egressGBPerHour: number;
  /** Where each client's downstream goes, kbit/s (sums to downKbps). */
  breakdown: { ipUdp: number; transport: number; ids: number; state: number };
}

export const ID_BITS = 16;
export const COUNT_BITS = 16;
export const DEFAULT_MTU_PAYLOAD = 1200;

export function fieldBits(fields: readonly BandwidthField[], quantize: boolean): number {
  return fields.reduce((s, f) => s + f.count * (quantize ? f.quantBits : f.rawBits), 0);
}

const kbps = (bytes: number, hz: number) => (bytes * 8 * hz) / 1000;

export function estimateBandwidth(i: BandwidthInput): BandwidthResult {
  const entityBits = fieldBits(i.fields, i.quantize);
  const sentEntities = i.delta ? (i.entities * Math.min(100, Math.max(0, i.changedPct))) / 100 : i.entities;
  const idBitsTotal = sentEntities * ID_BITS;
  const stateBits = sentEntities * entityBits;
  const payloadBytes = Math.ceil((COUNT_BITS + idBitsTotal + stateBits) / 8);
  const mtu = i.mtuPayloadBytes ?? DEFAULT_MTU_PAYLOAD;
  const perPacket = Math.max(1, mtu - i.transportHeaderBytes);
  const packetsPerSnapshot = Math.max(1, Math.ceil(payloadBytes / perPacket));
  const headerBytesPerSnapshot = packetsPerSnapshot * (i.ipHeaderBytes + i.transportHeaderBytes);
  const wireBytesPerSnapshot = payloadBytes + headerBytesPerSnapshot;
  const inputWireBytes = i.inputBytes + i.ipHeaderBytes + i.transportHeaderBytes;

  const downKbps = kbps(wireBytesPerSnapshot, i.sendRateHz);
  const upKbps = kbps(inputWireBytes, i.inputRateHz);
  const serverEgressKbps = downKbps * i.players;
  const payloadShare = payloadBytes > 0 ? 1 / (COUNT_BITS + idBitsTotal + stateBits) : 0;
  const payloadKbps = kbps(payloadBytes, i.sendRateHz);
  return {
    entityBits,
    idBits: ID_BITS,
    countBits: COUNT_BITS,
    sentEntities,
    payloadBytes,
    packetsPerSnapshot,
    headerBytesPerSnapshot,
    wireBytesPerSnapshot,
    inputWireBytes,
    downKbps,
    upKbps,
    serverEgressKbps,
    serverIngressKbps: upKbps * i.players,
    egressGBPerHour: (serverEgressKbps * 1000 * 3600) / 8 / 1e9,
    breakdown: {
      ipUdp: kbps(packetsPerSnapshot * i.ipHeaderBytes, i.sendRateHz),
      transport: kbps(packetsPerSnapshot * i.transportHeaderBytes, i.sendRateHz),
      // The (rounded-up) payload is split in proportion to its bit contents.
      ids: payloadKbps * (COUNT_BITS + idBitsTotal) * payloadShare,
      state: payloadKbps * stateBits * payloadShare,
    },
  };
}
