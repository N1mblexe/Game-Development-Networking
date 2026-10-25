/** Shared HTML controls for sims: transport bar, sliders, segmented choices, toggles, stats. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { SPEEDS } from '../../../lib/netsim';
import type { SimHandle } from './useSim';

const btn =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm font-semibold text-text hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed';
const btnPrimary =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-accent bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent hover:opacity-90';

const Icon = ({ d, fill }: { d: string; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={fill ? 0 : 2} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const PLAY = 'M7 4.5v15l12-7.5z';
const PAUSE = 'M7 4h3.5v16H7zM13.5 4H17v16h-3.5z';
const STEP = 'M6 5v14l9-7zM17 5h2v14h-2z';
const RESET = 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5';

export function Button({ children, onClick, primary, disabled, label, pressed, className }: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  label?: string;
  pressed?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`${primary ? btnPrimary : btn} ${pressed ? 'border-accent! bg-accent-soft!' : ''} ${className ?? ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
    >
      {children}
    </button>
  );
}

/** Play/pause, step, reset and speed. `extra` renders on the right. */
export function ControlBar({ sim, onReset, compact, extra, stepLabel = 'Step', showTime = true }: {
  sim: SimHandle;
  onReset: () => void;
  compact?: boolean;
  extra?: ReactNode;
  stepLabel?: string;
  showTime?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={btnPrimary} onClick={sim.toggle} aria-label={sim.playing ? 'Pause' : 'Play'}>
        <Icon d={sim.playing ? PAUSE : PLAY} fill />
        {/* Both labels share one grid cell, so the button is always as wide as "Pause" and never jumps. */}
        <span className="grid text-left" aria-hidden="true">
          <span className="invisible col-start-1 row-start-1">Pause</span>
          <span className="col-start-1 row-start-1">{sim.playing ? 'Pause' : 'Play'}</span>
        </span>
      </button>
      <button type="button" className={btn} onClick={sim.stepOnce} title="Advance one step (pauses)">
        <Icon d={STEP} fill />
        {stepLabel}
      </button>
      <button type="button" className={btn} onClick={onReset} title="Start over">
        <Icon d={RESET} />
        Reset
      </button>
      {!compact && (
        <label className="flex items-center gap-1.5 text-sm text-muted" htmlFor={`${id}-speed`}>
          Speed
          <select
            id={`${id}-speed`}
            className="rounded-md border border-border bg-surface px-1.5 py-1 font-mono text-sm text-text"
            value={sim.speed}
            onChange={(e) => sim.setSpeed(Number(e.target.value))}
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      )}
      {extra && <div className="ml-auto flex flex-wrap items-center gap-2">{extra}</div>}
      {!extra && showTime && <SimTime sim={sim} />}
    </div>
  );
}

/** Virtual clock readout, updated a few times per second. */
export function SimTime({ sim }: { sim: SimHandle }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT(sim.now()), 250);
    return () => clearInterval(id);
  }, [sim]);
  return <span className="ml-auto font-mono text-xs text-muted tabular-nums">t = {(t / 1000).toFixed(1)} s</span>;
}

export function Slider({ label, value, min, max, step = 1, unit = '', onChange, format, hint, values }: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: string;
  /** Discrete values instead of min/max/step (e.g. a log-like scale). */
  values?: readonly number[];
}) {
  const id = useId();
  const shown = format ? format(value) : `${value}${unit ? ` ${unit}` : ''}`;
  const idx = values ? Math.max(0, values.findIndex((v) => v >= value)) : 0;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <label htmlFor={id} className="text-muted">
          {label}
        </label>
        <span className="font-mono text-[0.8rem] font-semibold tabular-nums">{shown}</span>
      </div>
      <input
        id={id}
        type="range"
        className="mt-1 w-full accent-(--accent)"
        min={values ? 0 : min}
        max={values ? values.length - 1 : max}
        step={values ? 1 : step}
        value={values ? idx : value}
        aria-valuetext={shown}
        onChange={(e) => onChange(values ? values[Number(e.target.value)]! : Number(e.target.value))}
      />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange, hideLabel }: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
  hideLabel?: boolean;
}) {
  return (
    <div className="min-w-0">
      {!hideLabel && <div className="mb-1 text-sm text-muted">{label}</div>}
      <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap rounded-lg border border-border bg-surface-2 p-0.5">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              title={o.title}
              onClick={() => onChange(o.value)}
              className={`rounded-md px-2.5 py-1 text-sm font-medium ${on ? 'bg-surface text-accent shadow-sm ring-1 ring-border' : 'text-muted hover:text-text'}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-(--accent)" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

/** Responsive grid for sliders and toggles. */
export function ControlGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

export type Tone = 'ok' | 'warn' | 'danger' | 'accent' | 'muted';
const toneClass: Record<Tone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  accent: 'text-accent',
  muted: 'text-muted',
};

export interface Stat {
  label: string;
  value: string;
  tone?: Tone;
  /** Hidden in compact mode. */
  secondary?: boolean;
}

/**
 * Visible stat tiles plus a screen-reader summary in an aria-live region. The live text is
 * refreshed at most every few seconds while the sim plays so it doesn't flood the reader.
 */
export function StatGrid({ stats, compact, playing, label = 'Live statistics' }: { stats: Stat[]; compact?: boolean; playing?: boolean; label?: string }) {
  const shown = compact ? stats.filter((s) => !s.secondary) : stats;
  const summary = shown.map((s) => `${s.label}: ${s.value}`).join('; ');
  const [live, setLive] = useState(summary);
  const latest = useRef(summary);
  latest.current = summary;
  useEffect(() => {
    if (!playing) {
      setLive(latest.current);
      return;
    }
    const id = setInterval(() => setLive(latest.current), 5000);
    return () => clearInterval(id);
  }, [playing, playing ? null : summary]);
  return (
    // Columns follow the sim's own width (container queries), not the viewport: a sim in the lesson column
    // is much narrower than the window. Labels wrap rather than truncate, so none of them lose meaning.
    <div className="@container">
      <dl className="grid grid-cols-2 gap-2 @md:grid-cols-3 @4xl:grid-cols-6" aria-label={label}>
        {shown.map((s) => (
          <div key={s.label} className="flex min-w-0 flex-col justify-between rounded-lg bg-surface-2 px-2.5 py-1.5">
            <dt className="text-[0.7rem] leading-tight font-medium uppercase tracking-wide text-muted [overflow-wrap:anywhere]">{s.label}</dt>
            <dd className={`truncate font-mono text-sm font-semibold tabular-nums ${s.tone ? toneClass[s.tone] : ''}`}>{s.value}</dd>
          </div>
        ))}
      </dl>
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
    </div>
  );
}

export interface LegendItem {
  label: string;
  /** CSS colour, e.g. 'var(--accent)'. */
  color: string;
  shape?: 'dot' | 'ring' | 'line' | 'dash' | 'square';
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <Swatch color={it.color} shape={it.shape ?? 'dot'} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

function Swatch({ color, shape }: { color: string; shape: NonNullable<LegendItem['shape']> }) {
  if (shape === 'line' || shape === 'dash')
    return <span className="inline-block h-0 w-4 border-t-2" style={{ borderColor: color, borderStyle: shape === 'dash' ? 'dashed' : 'solid' }} />;
  if (shape === 'ring') return <span className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: color }} />;
  if (shape === 'square') return <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />;
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />;
}

/** The canvas wrapper every sim uses. Children render as an overlay (e.g. hint text). */
export function SimCanvas({ sim, label, children, onPointerDown, onKeyDown, onKeyUp, focusable, className }: {
  sim: SimHandle;
  /** Accessible description of what the canvas shows. */
  label: string;
  children?: ReactNode;
  onPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onKeyUp?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  focusable?: boolean;
  className?: string;
}) {
  return (
    <div
      ref={sim.wrapRef}
      className={`relative w-full overflow-hidden rounded-lg border border-border bg-surface ${focusable ? 'focus-within:ring-2 focus-within:ring-accent' : ''} ${className ?? ''}`}
      tabIndex={focusable ? 0 : undefined}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      role={focusable ? 'application' : undefined}
      aria-label={focusable ? label : undefined}
    >
      <canvas ref={sim.canvasRef} className="block touch-manipulation" role="img" aria-label={label} onPointerDown={onPointerDown} />
      {children}
    </div>
  );
}

/** Standard vertical layout: canvas, transport, controls, stats. */
export function SimLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

export const fmtMs = (v: number) => (v >= 100 ? `${Math.round(v)} ms` : `${v.toFixed(v < 10 ? 1 : 0)} ms`);
export const fmtPct = (v: number, digits = 1) => `${v.toFixed(digits)}%`;
export const fmtKbps = (kbps: number) =>
  !Number.isFinite(kbps) ? '∞' : kbps >= 1000 ? `${(kbps / 1000).toFixed(kbps >= 10000 ? 0 : 1)} Mbps` : `${Math.round(kbps)} kbps`;
