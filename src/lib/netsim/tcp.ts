/**
 * A reliable, ordered channel modelled on TCP's loss recovery, running over two `Link`s
 * (data one way, ACKs the other). It is intentionally small but behaves like the real thing
 * where it matters for games:
 *
 *  - cumulative ACKs (the receiver always acknowledges "next byte I expect")
 *  - in-order release: out-of-order segments wait in the receive buffer (head-of-line blocking)
 *  - fast retransmit after 3 duplicate ACKs, NewReno-style partial-ACK retransmits
 *  - retransmission timeout per RFC 6298 (SRTT/RTTVAR, Karn's rule, exponential backoff),
 *    with Linux's 200 ms minimum RTO
 *
 * Not modelled: congestion window / slow start, Nagle (assume TCP_NODELAY), delayed ACKs,
 * SACK. Each `send()` is one segment.
 */
import type { Link } from './link';

export interface TcpSegment<T> {
  seq: number;
  payload: T;
  /** How many times this segment had been retransmitted when this copy was sent. */
  rtx: number;
}

export interface TcpAck {
  /** Next sequence number the receiver expects (everything below it has arrived). */
  ack: number;
}

export interface TcpOptions {
  minRtoMs?: number;
  initialRtoMs?: number;
  maxRtoMs?: number;
  segmentBytes?: number;
}

export interface TcpEvent {
  time: number;
  kind: 'fast-retransmit' | 'timeout' | 'partial-ack';
  seq: number;
}

interface OutSeg<T> {
  payload: T;
  firstSentAt: number;
  rtx: number;
}

export class TcpChannel<T> {
  // sender
  private readonly segs = new Map<number, OutSeg<T>>();
  private sndUna = 0;
  private sndNxt = 0;
  private dupAcks = 0;
  private recoverSeq = -1;
  private timerAt = Infinity;
  private srtt = 0;
  private rttvar = 0;
  private hasRtt = false;
  private baseRto: number;
  rto: number;
  // receiver
  private rcvNxt = 0;
  private readonly ooo = new Map<number, T>();
  private readonly released: T[] = [];

  readonly events: TcpEvent[] = [];
  stats = { sent: 0, retransmits: 0, fastRetransmits: 0, timeouts: 0, released: 0 };

  private readonly minRto: number;
  private readonly maxRto: number;
  private readonly segBytes: number;

  constructor(
    readonly data: Link<TcpSegment<T>>,
    readonly acks: Link<TcpAck>,
    opts: TcpOptions = {},
  ) {
    this.minRto = opts.minRtoMs ?? 200;
    this.maxRto = opts.maxRtoMs ?? 60_000;
    this.baseRto = this.rto = opts.initialRtoMs ?? 1000;
    this.segBytes = opts.segmentBytes ?? 60;
  }

  /** Queue `payload` for reliable, ordered delivery. Returns its sequence number. */
  send(payload: T, now: number): number {
    const seq = this.sndNxt++;
    this.segs.set(seq, { payload, firstSentAt: now, rtx: 0 });
    this.data.send({ seq, payload, rtx: 0 }, now, this.segBytes);
    this.stats.sent++;
    if (this.timerAt === Infinity) this.timerAt = now + this.rto;
    return seq;
  }

  private retransmit(seq: number, now: number, kind: TcpEvent['kind']): void {
    const s = this.segs.get(seq);
    if (!s) return;
    s.rtx++;
    this.data.send({ seq, payload: s.payload, rtx: s.rtx }, now, this.segBytes);
    this.stats.retransmits++;
    if (kind === 'fast-retransmit') this.stats.fastRetransmits++;
    if (kind === 'timeout') this.stats.timeouts++;
    this.events.push({ time: now, kind, seq });
    if (this.events.length > 32) this.events.shift();
  }

  private sampleRtt(r: number): void {
    if (!this.hasRtt) {
      this.srtt = r;
      this.rttvar = r / 2;
      this.hasRtt = true;
    } else {
      this.rttvar = 0.75 * this.rttvar + 0.25 * Math.abs(this.srtt - r);
      this.srtt = 0.875 * this.srtt + 0.125 * r;
    }
    this.baseRto = Math.min(this.maxRto, Math.max(this.minRto, this.srtt + Math.max(1, 4 * this.rttvar)));
  }

  /**
   * Process everything that arrived by `now` and fire timers. Returns payloads released to the
   * application in order during this call (array is reused; copy to keep).
   */
  update(now: number): readonly T[] {
    const out = this.released;
    out.length = 0;

    // Receiver side
    for (const p of this.data.deliver(now)) {
      const { seq, payload } = p.payload;
      if (seq === this.rcvNxt) {
        out.push(payload);
        this.rcvNxt++;
        while (this.ooo.has(this.rcvNxt)) {
          out.push(this.ooo.get(this.rcvNxt)!);
          this.ooo.delete(this.rcvNxt);
          this.rcvNxt++;
        }
      } else if (seq > this.rcvNxt) this.ooo.set(seq, payload);
      // Every arrival (including duplicates) triggers a cumulative ACK.
      this.acks.send({ ack: this.rcvNxt }, p.arriveAt, 40);
    }
    this.stats.released += out.length;

    // Sender side
    for (const p of this.acks.deliver(now)) {
      const a = p.payload.ack;
      if (a > this.sndUna) {
        const newest = this.segs.get(a - 1);
        if (newest && newest.rtx === 0) this.sampleRtt(p.arriveAt - newest.firstSentAt); // Karn's rule
        for (let s = this.sndUna; s < a; s++) this.segs.delete(s);
        this.sndUna = a;
        this.dupAcks = 0;
        this.rto = this.baseRto; // clear backoff
        if (this.recoverSeq >= 0 && a <= this.recoverSeq) this.retransmit(this.sndUna, p.arriveAt, 'partial-ack');
        else this.recoverSeq = -1;
        this.timerAt = this.sndUna < this.sndNxt ? p.arriveAt + this.rto : Infinity;
      } else if (a === this.sndUna && this.sndUna < this.sndNxt) {
        this.dupAcks++;
        if (this.dupAcks === 3 && this.recoverSeq < 0) {
          this.recoverSeq = this.sndNxt - 1;
          this.retransmit(this.sndUna, p.arriveAt, 'fast-retransmit');
        }
      }
    }

    if (now >= this.timerAt && this.sndUna < this.sndNxt) {
      this.retransmit(this.sndUna, now, 'timeout');
      this.recoverSeq = this.sndNxt - 1;
      this.rto = Math.min(this.maxRto, this.rto * 2);
      this.timerAt = now + this.rto;
    }
    return out;
  }

  /** Lowest sequence number the receiver is still waiting for (the head-of-line hole). */
  get waitingFor(): number {
    return this.rcvNxt;
  }

  /** Segments that arrived but are held back behind the hole, ascending. */
  bufferedSeqs(into: number[] = []): number[] {
    into.length = 0;
    for (const k of this.ooo.keys()) into.push(k);
    return into.sort((a, b) => a - b);
  }

  get unacked(): number {
    return this.sndNxt - this.sndUna;
  }

  get smoothedRtt(): number {
    return this.srtt;
  }
}
