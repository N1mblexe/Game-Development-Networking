/**
 * NetLearn's deterministic network simulation core. Framework-free: sims own the rendering,
 * this module owns the networking behaviour, so every preset plays out the same way.
 */
export { Random, mulberry32, deriveSeed } from './rng';
export { FixedStepper, Ticker, SPEEDS } from './clock';
export { Link, type LinkConfig, type LinkStats, type Packet, type LossReason } from './link';
export { TcpChannel, type TcpSegment, type TcpAck, type TcpEvent, type TcpOptions } from './tcp';
export {
  RingBuffer,
  SnapshotBuffer,
  InterpolationBuffer,
  InputHistory,
  type Timed,
  type Bracket,
  type Lerp,
  type InputEntry,
  type InterpolationSample,
  type InterpolationStatus,
} from './buffers';
export { SampleWindow, percentile, clamp, lerp } from './stats';
export { type Vec2, v2, lerpV, dist, len } from './vec';
export {
  Nat,
  NAT_LABELS,
  ADDR,
  ep,
  simulateHolePunch,
  type NatType,
  type NatMapping,
  type Endpoint,
  type NodeId,
  type TraversalPacket,
  type TraversalStep,
} from './nat';
export {
  encodeDelta,
  applyDelta,
  deltaBits,
  fullSnapshotBits,
  entityBits,
  BaselineHistory,
  SnapshotStore,
  ENTITY_COUNT_BITS,
  ENTITY_ID_BITS,
  type FieldDef,
  type EntityState,
  type WorldSnapshot,
  type EntityDelta,
  type SnapshotDelta,
} from './snapshot';
export {
  estimateBandwidth,
  fieldBits,
  ID_BITS,
  COUNT_BITS,
  DEFAULT_MTU_PAYLOAD,
  type BandwidthField,
  type BandwidthInput,
  type BandwidthResult,
} from './bandwidth';
