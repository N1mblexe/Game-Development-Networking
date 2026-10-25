import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_MTU_PAYLOAD, ID_BITS, COUNT_BITS, estimateBandwidth, fieldBits, type BandwidthField, type BandwidthInput, type BandwidthResult } from '../../lib/netsim';
import type { SimBaseProps } from './types';
import { useSim } from './ui/useSim';
import { Button, ControlGrid, Legend, Segmented, SimCanvas, SimLayout, Slider, StatGrid, Toggle, fmtKbps, type Stat } from './ui/controls';
import { alpha, fillRound, line, text } from './ui/draw';
import type { Palette } from './ui/theme';

export interface BandwidthCalculatorProps extends SimBaseProps {
  players?: number;
  /** Entities replicated to each client (after interest management). */
  entities?: number;
  fields?: BandwidthField[];
  sendRateHz?: number;
  inputRateHz?: number;
  inputBytes?: number;
  ipv6?: boolean;
  transportHeaderBytes?: number;
  quantize?: boolean;
  delta?: boolean;
  changedPct?: number;
}

export const DEFAULT_FIELDS: BandwidthField[] = [
  { name: 'Position (x, y, z)', count: 3, rawBits: 32, quantBits: 18 },
  { name: 'Rotation (yaw, pitch)', count: 2, rawBits: 32, quantBits: 10 },
  { name: 'Velocity (x, y, z)', count: 3, rawBits: 32, quantBits: 12 },
  { name: 'Health', count: 1, rawBits: 32, quantBits: 7 },
  { name: 'Animation state', count: 1, rawBits: 32, quantBits: 5 },
  { name: 'Flags (bools)', count: 4, rawBits: 8, quantBits: 1 },
];

type Cfg = Required<Omit<BandwidthCalculatorProps, keyof SimBaseProps>>;

const RATES = [10, 15, 20, 30, 60, 64, 128] as const;
const SEGMENTS = [
  { key: 'state', label: 'entity state' },
  { key: 'ids', label: 'entity ids + count' },
  { key: 'transport', label: 'transport header' },
  { key: 'ipUdp', label: 'IP/UDP header' },
] as const;

const toInput = (c: Cfg, over: Partial<BandwidthInput> = {}): BandwidthInput => ({
  players: c.players,
  entities: c.entities,
  fields: c.fields,
  sendRateHz: c.sendRateHz,
  inputRateHz: c.inputRateHz,
  inputBytes: c.inputBytes,
  ipHeaderBytes: c.ipv6 ? 48 : 28,
  transportHeaderBytes: c.transportHeaderBytes,
  quantize: c.quantize,
  delta: c.delta,
  changedPct: c.changedPct,
  ...over,
});

interface Variant {
  label: string;
  quantize: boolean;
  delta: boolean;
  r: BandwidthResult;
}

const fmtBits = (b: number) => `${Math.round(b)} bits`;
const fmtBytes = (b: number) => (b >= 10000 ? `${(b / 1000).toFixed(1)} kB` : `${Math.round(b)} B`);
const fmtNum = (v: number, d = 1) => (Number.isInteger(v) ? String(v) : v.toFixed(d));

export default function BandwidthCalculator(props: BandwidthCalculatorProps) {
  const { compact } = props;
  const [cfg, setCfg] = useState<Cfg>(() => ({
    players: props.players ?? 4,
    entities: props.entities ?? 40,
    fields: (props.fields ?? DEFAULT_FIELDS).map((f) => ({ ...f })),
    sendRateHz: props.sendRateHz ?? 30,
    inputRateHz: props.inputRateHz ?? 30,
    inputBytes: props.inputBytes ?? 12,
    ipv6: props.ipv6 ?? false,
    transportHeaderBytes: props.transportHeaderBytes ?? 10,
    quantize: props.quantize ?? true,
    delta: props.delta ?? true,
    changedPct: props.changedPct ?? 40,
  }));
  const set = <K extends keyof Cfg>(k: K) => (v: Cfg[K]) => setCfg((c) => ({ ...c, [k]: v }));

  const r = useMemo(() => estimateBandwidth(toInput(cfg)), [cfg]);
  const variants = useMemo<Variant[]>(
    () =>
      [
        { label: 'Raw, full', quantize: false, delta: false },
        { label: 'Quantized, full', quantize: true, delta: false },
        { label: 'Raw, delta', quantize: false, delta: true },
        { label: 'Quantized, delta', quantize: true, delta: true },
      ].map((v) => ({ ...v, r: estimateBandwidth(toInput(cfg, { quantize: v.quantize, delta: v.delta })) })),
    [cfg],
  );
  const chart = useRef({ variants, cfg });
  chart.current = { variants, cfg };

  const sim = useSim({
    dt: 16,
    draw: (ctx, w, h, p) => drawChart(ctx, w, h, p, chart.current.variants, chart.current.cfg),
    height: (w) => (w < 520 ? 4 * 52 + 40 : 4 * 36 + 44),
  });
  useEffect(() => sim.redraw(), [variants, sim]);

  const setField = (i: number, patch: Partial<BandwidthField>) =>
    setCfg((c) => ({ ...c, fields: c.fields.map((f, k) => (k === i ? { ...f, ...patch } : f)) }));
  const removeField = (i: number) => setCfg((c) => ({ ...c, fields: c.fields.filter((_, k) => k !== i) }));
  const addField = () => setCfg((c) => ({ ...c, fields: [...c.fields, { name: `Field ${c.fields.length + 1}`, count: 1, rawBits: 32, quantBits: 8 }] }));

  const stats: Stat[] = [
    { label: 'Download / client', value: fmtKbps(r.downKbps), tone: r.downKbps > 1000 ? 'warn' : undefined },
    { label: 'Upload / client', value: fmtKbps(r.upKbps) },
    { label: 'Server egress', value: fmtKbps(r.serverEgressKbps), tone: r.serverEgressKbps > 100000 ? 'warn' : undefined },
    { label: 'Egress per hour', value: r.egressGBPerHour >= 10 ? `${Math.round(r.egressGBPerHour)} GB` : `${r.egressGBPerHour.toFixed(2)} GB` },
    { label: 'Snapshot size', value: fmtBytes(r.wireBytesPerSnapshot), secondary: true },
    { label: 'Packets / snapshot', value: String(r.packetsPerSnapshot), tone: r.packetsPerSnapshot > 1 ? 'warn' : undefined, secondary: true },
  ];

  const ip = cfg.ipv6 ? 48 : 28;
  const fb = fieldBits(cfg.fields, cfg.quantize);
  const terms: { term: string; formula: ReactNode; why: string }[] = [
    {
      term: 'Entity state',
      formula: (
        <>
          {cfg.fields.map((f) => `${f.count}×${cfg.quantize ? f.quantBits : f.rawBits}`).join(' + ') || '0'} = <b>{fmtBits(fb)}</b> ({fmtNum(fb / 8)} bytes)
        </>
      ),
      why: cfg.quantize
        ? 'Quantized: each value is sent with just the range and precision it needs (for example a position as 18-bit fixed point instead of a 32-bit float).'
        : 'Raw: every value is sent as the type it has in memory (32-bit floats and ints, 8-bit bools).',
    },
    {
      term: 'Entities per snapshot',
      formula: cfg.delta ? (
        <>
          {cfg.entities} × {cfg.changedPct}% = <b>{fmtNum(r.sentEntities)}</b>
        </>
      ) : (
        <b>{cfg.entities}</b>
      ),
      why: cfg.delta
        ? 'Delta compression: only entities that changed since the snapshot the client last acknowledged are written. (Real encoders also skip unchanged fields within an entity, so this is conservative.)'
        : 'Full snapshots: every relevant entity is written every time, changed or not. Interest management decides what is relevant, which is why this does not have to grow with the player count.',
    },
    {
      term: 'Payload',
      formula: (
        <>
          {COUNT_BITS} + {fmtNum(r.sentEntities)} × ({ID_BITS} + {fb}) bits = <b>{fmtBytes(r.payloadBytes)}</b>
        </>
      ),
      why: `A ${COUNT_BITS}-bit entity count, then for each entity a ${ID_BITS}-bit network id and its state.`,
    },
    {
      term: 'Packets per snapshot',
      formula: (
        <>
          ⌈{r.payloadBytes} / ({DEFAULT_MTU_PAYLOAD} − {cfg.transportHeaderBytes})⌉ = <b>{r.packetsPerSnapshot}</b>
        </>
      ),
      why: `About ${DEFAULT_MTU_PAYLOAD} bytes of UDP payload is a safe size that avoids IP fragmentation on almost every path. A bigger snapshot must be split, every piece pays the headers again, and losing any piece loses the whole snapshot.`,
    },
    {
      term: 'Headers',
      formula: (
        <>
          {r.packetsPerSnapshot} × ({ip} + {cfg.transportHeaderBytes}) = <b>{r.headerBytesPerSnapshot} bytes</b>
        </>
      ),
      why: `${cfg.ipv6 ? 'IPv6 (40) + UDP (8) = 48' : 'IPv4 (20) + UDP (8) = 28'} bytes per packet, plus the networking library's own header (sequence number, acks, channel or fragment info).`,
    },
    {
      term: 'Download per client',
      formula: (
        <>
          {r.wireBytesPerSnapshot} B × 8 × {cfg.sendRateHz} Hz = <b>{fmtKbps(r.downKbps)}</b>
        </>
      ),
      why: 'Snapshot size on the wire times the send rate. The send rate can be lower than the server tick rate.',
    },
    {
      term: 'Upload per client',
      formula: (
        <>
          ({cfg.inputBytes} + {ip} + {cfg.transportHeaderBytes}) B × 8 × {cfg.inputRateHz} Hz = <b>{fmtKbps(r.upKbps)}</b>
        </>
      ),
      why: 'Inputs are tiny, so headers dominate the upload. Sending each input redundantly in the next few packets costs a few bytes and hides most packet loss.',
    },
    {
      term: 'Server egress',
      formula: (
        <>
          {fmtKbps(r.downKbps)} × {cfg.players} players = <b>{fmtKbps(r.serverEgressKbps)}</b> ≈ {r.egressGBPerHour.toFixed(2)} GB per hour
        </>
      ),
      why: 'Every client gets its own snapshot stream (its own baseline and relevant set), so the server uploads all of them. This is usually the number that limits players per server, and what hosting bills are based on.',
    },
  ];

  const inputCls = 'w-full rounded-md border border-border bg-surface px-1.5 py-1 font-mono text-sm text-text';

  return (
    <SimLayout>
      <StatGrid stats={stats} compact={compact} label="Results" />
      <SimCanvas
        sim={sim}
        label={`Bar chart of download per client for four encodings. ${variants.map((v) => `${v.label}: ${fmtKbps(v.r.downKbps)}`).join('; ')}.`}
      />
      <Legend
        items={[
          { label: 'entity state', color: 'var(--accent)', shape: 'square' },
          { label: 'entity ids + count', color: 'var(--warn)', shape: 'square' },
          { label: 'transport header', color: 'var(--muted)', shape: 'square' },
          { label: 'IP/UDP header', color: 'var(--danger)', shape: 'square' },
        ]}
      />
      <ControlGrid>
        <Slider label="Players" value={cfg.players} min={1} max={200} step={1} onChange={set('players')} />
        <Slider label="Entities sent to each client" value={cfg.entities} min={1} max={400} step={1} onChange={set('entities')} />
        <Slider label="Snapshot send rate" value={cfg.sendRateHz} values={RATES} unit="Hz" onChange={set('sendRateHz')} />
        <Toggle label="Quantize fields" checked={cfg.quantize} onChange={set('quantize')} hint="Use the quantized bit sizes from the table." />
        <Toggle label="Delta compression" checked={cfg.delta} onChange={set('delta')} hint="Send only entities that changed since the last acked snapshot." />
        <Slider
          label="Changed since baseline"
          value={cfg.changedPct}
          min={0}
          max={100}
          step={5}
          format={(v) => `${v}%${cfg.delta ? '' : ' (delta off)'}`}
          onChange={set('changedPct')}
        />
        {!compact && (
          <>
            <Slider label="Input send rate" value={cfg.inputRateHz} values={RATES} unit="Hz" onChange={set('inputRateHz')} />
            <Slider label="Input payload" value={cfg.inputBytes} min={2} max={64} step={1} unit="B" onChange={set('inputBytes')} />
            <Slider
              label="Transport header"
              value={cfg.transportHeaderBytes}
              min={0}
              max={32}
              step={1}
              unit="B"
              onChange={set('transportHeaderBytes')}
              hint="Sequence, acks, channel: typically a handful to a few dozen bytes."
            />
            <Segmented
              label="IP version"
              value={cfg.ipv6 ? 'v6' : 'v4'}
              options={[
                { value: 'v4', label: 'IPv4 + UDP: 28 B' },
                { value: 'v6', label: 'IPv6 + UDP: 48 B' },
              ]}
              onChange={(v) => set('ipv6')(v === 'v6')}
            />
          </>
        )}
      </ControlGrid>

      {!compact && (
        <div className="relative overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label="Replicated fields (scrollable)">
          <table className="w-full min-w-[420px] text-left text-sm">
            <caption className="sr-only">Fields replicated per entity, with their sizes in bits</caption>
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="px-2 py-1.5 font-medium">Field</th>
                <th className="w-16 px-2 py-1.5 font-medium">Count</th>
                <th className="w-20 px-2 py-1.5 font-medium">Raw bits</th>
                <th className="w-20 px-2 py-1.5 font-medium">Quantized</th>
                <th className="w-16 px-2 py-1.5 text-right font-medium">Total</th>
                <th className="w-8 px-1 py-1.5">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cfg.fields.map((f, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-2 py-1">
                    <input className={`${inputCls} font-sans`} aria-label={`Field ${i + 1} name`} value={f.name} onChange={(e) => setField(i, { name: e.target.value })} />
                  </td>
                  {(['count', 'rawBits', 'quantBits'] as const).map((k) => (
                    <td key={k} className="px-2 py-1">
                      <input
                        className={`${inputCls} ${k === (cfg.quantize ? 'rawBits' : 'quantBits') ? 'opacity-60' : ''}`}
                        type="number"
                        inputMode="numeric"
                        min={k === 'count' ? 0 : 1}
                        max={k === 'count' ? 64 : 64}
                        aria-label={`${f.name}: ${k === 'count' ? 'components' : k === 'rawBits' ? 'raw bits per component' : 'quantized bits per component'}`}
                        value={f[k]}
                        onChange={(e) => setField(i, { [k]: Math.max(0, Math.min(64, Math.round(Number(e.target.value) || 0))) })}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right font-mono tabular-nums">{f.count * (cfg.quantize ? f.quantBits : f.rawBits)}</td>
                  <td className="px-1 py-1 text-center">
                    <button type="button" className="rounded px-1.5 text-muted hover:text-danger" aria-label={`Remove ${f.name}`} onClick={() => removeField(i)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-border bg-surface-2">
                <td className="px-2 py-1.5" colSpan={4}>
                  <Button onClick={addField} className="py-1! text-xs!">
                    + Add field
                  </Button>
                </td>
                <td className="px-2 py-1.5 text-right font-mono font-semibold tabular-nums">{fb}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <dl className="divide-y divide-border rounded-lg border border-border text-sm">
        {(compact ? terms.filter((_, i) => [0, 1, 5, 7].includes(i)) : terms).map((t) => (
          <div key={t.term} className="px-3 py-2 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-3">
            <dt className="font-semibold">{t.term}</dt>
            <dd className="min-w-0">
              <div className="font-mono text-[0.8rem] break-words">{t.formula}</div>
              {!compact && <p className="mt-0.5 text-xs text-muted">{t.why}</p>}
            </dd>
          </div>
        ))}
      </dl>
    </SimLayout>
  );
}

// ------------------------------------------------------------------ chart

function drawChart(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, variants: Variant[], cfg: Cfg) {
  const narrow = w < 520;
  const pad = 10;
  const labelW = narrow ? 0 : 118;
  const x0 = pad + labelW;
  const x1 = w - pad - (narrow ? 66 : 112);
  const top = 26;
  const rowH = narrow ? 52 : 36;
  const barH = narrow ? 16 : 18;
  const maxK = niceMax(Math.max(1, ...variants.map((v) => v.r.downKbps)));
  const X = (k: number) => x0 + (k / maxK) * (x1 - x0);
  const colors: Record<(typeof SEGMENTS)[number]['key'], string> = { state: p.accent, ids: p.warn, transport: p.muted, ipUdp: p.danger };

  text(ctx, p, `Download per client at ${cfg.sendRateHz} Hz`, pad, 11, { size: 11, weight: 700 });
  // grid
  const ticks = narrow ? 2 : 4;
  for (let k = 0; k <= ticks; k++) {
    const v = (maxK * k) / ticks;
    const x = X(v);
    line(ctx, x, top - 4, x, top + rowH * 4 - 6, alpha(p.border, 0.9));
    text(ctx, p, k === 0 ? '0' : fmtKbps(v), x, h - 9, { align: k === 0 ? 'left' : 'center', size: 9, mono: true, color: p.muted });
  }

  variants.forEach((v, i) => {
    const current = v.quantize === cfg.quantize && v.delta === cfg.delta;
    const y = top + i * rowH + (narrow ? 18 : (rowH - barH) / 2 - 4);
    const label = `${v.label}${current ? '  ← you' : ''}`;
    if (narrow) text(ctx, p, label, pad, y - 9, { size: 10.5, weight: current ? 750 : 500, color: current ? p.text : p.muted });
    else text(ctx, p, v.label, pad, y + barH / 2, { size: 11, weight: current ? 750 : 500, color: current ? p.text : p.muted });
    let acc = 0;
    for (const s of [...SEGMENTS]) {
      const val = v.r.breakdown[s.key];
      if (val <= 0) continue;
      const xa = X(acc);
      const xb = X(acc + val);
      ctx.fillStyle = current ? colors[s.key] : alpha(colors[s.key], 0.45);
      ctx.fillRect(xa, y, Math.max(0.5, xb - xa), barH);
      acc += val;
    }
    if (current) fillRound(ctx, x0 - 2, y - 2, X(acc) - x0 + 4, barH + 4, 4, 'transparent', p.text);
    const val = `${fmtKbps(v.r.downKbps)}${!narrow && v.r.packetsPerSnapshot > 1 ? ` · ${v.r.packetsPerSnapshot} pkts` : ''}`;
    text(ctx, p, val, X(acc) + 6, y + barH / 2, { size: 10, mono: true, weight: current ? 700 : 500, color: current ? p.text : p.muted });
  });
}

function niceMax(v: number): number {
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= v) return m * e;
  return 10 * e;
}
