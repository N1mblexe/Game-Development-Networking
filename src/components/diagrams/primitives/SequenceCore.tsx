/**
 * The animated sequence-diagram engine. <Sequence> (SequenceFlow) and most registered diagrams render through it.
 *
 * Layout is HTML + percentage-based SVG, so labels wrap naturally and the diagram fits any width:
 * actor columns are equal-width grid tracks, lifelines sit at the column centres, and each step is a row
 * with a wrapped label above a thin arrow strip.
 */
import type { ReactNode } from 'react';
import type { SequenceActor, SequenceStep } from '../types';
import ActorIcon, { KIND_LABEL } from './ActorIcon';
import StepperControls from './StepperControls';
import { Arrow, Lane, PacketDot } from './svg';
import { useStepper } from './useStepper';
import { useWidth } from './useWidth';
import '../diagrams.css';

export interface SequenceCoreProps {
  actors: SequenceActor[];
  steps: SequenceStep[];
  /** Text shown in the caption area before the first step. */
  intro?: ReactNode;
  /** Extra content under the controls (summaries, callouts). */
  footer?: ReactNode;
  stepMs?: number;
  /** Accessible name for the step list. */
  title?: string;
}

const KIND_TEXT: Record<NonNullable<SequenceStep['kind']>, string> = {
  reliable: 'reliable message',
  unreliable: 'unreliable message',
  rpc: 'RPC',
  event: 'event / callback',
  local: 'local work',
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function LegendSample({ kind }: { kind: NonNullable<SequenceStep['kind']> }) {
  if (kind === 'local')
    return (
      <svg width="26" height="16" aria-hidden="true" className="overflow-visible">
        <path className="dg-line" d="M3 3h12a5 5 0 0 1 0 10H8" />
        <polygon className="dg-head" points="3,13 10,9 10,17" />
      </svg>
    );
  return (
    <svg width="34" height="16" aria-hidden="true" className="overflow-visible">
      <Arrow x1={2} y1={8} x2={32} y2={8} kind={kind} />
    </svg>
  );
}

export default function SequenceCore({ actors, steps, intro, footer, stepMs = 2200, title }: SequenceCoreProps) {
  const s = useStepper(steps.length, { stepMs });
  const n = Math.max(actors.length, 1);
  const col = 100 / n;
  const idx = new Map(actors.map((a, i) => [a.id, i]));
  const center = (id: string) => ((idx.get(id) ?? 0) + 0.5) * col;
  const name = (id: string) => actors.find((a) => a.id === id)?.label ?? id;
  const kindsUsed = [...new Set(steps.map((st) => st.kind ?? 'reliable'))];
  const active = s.index >= 0 ? steps[s.index] : undefined;
  const [boxRef, width] = useWidth<HTMLDivElement>();
  // Labels need roughly 230px to read well; on narrow screens they may span the full width.
  const minLabel = width ? clamp((230 / width) * 100, 46, 100) : 46;
  // On narrow diagrams the code line moves to the caption only, to keep rows short.
  const showRowCode = width === 0 || width >= 520;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      s.next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      s.prev();
    }
  };

  return (
    <div className="space-y-3" data-sequence data-step-index={s.index} onKeyDown={onKeyDown}>
      {/* ------------------------------------------------ visual diagram (hidden from screen readers) */}
      <div className="dg-scroll -mx-1 overflow-x-auto px-1 pb-1" aria-hidden="true">
        <div ref={boxRef} style={{ minWidth: `${n * 72}px` }}>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {actors.map((a) => (
              <div key={a.id} className={`dg-kind-${a.kind ?? 'client'} flex justify-center`}>
                <div
                  className="flex max-w-full min-w-0 flex-col items-center gap-0.5 rounded-lg border bg-surface px-2 py-1.5 text-center shadow-sm"
                  style={{ borderColor: 'color-mix(in srgb, var(--kind) 55%, var(--border))', borderTopWidth: 3 }}
                >
                  <span style={{ color: 'var(--kind)' }}>
                    <ActorIcon kind={a.kind ?? 'client'} className="h-5 w-5" />
                  </span>
                  <span className="text-xs leading-tight font-semibold break-words">{a.label}</span>
                </div>
              </div>
            ))}
          </div>

          <ol className="relative mt-1 list-none space-y-0.5 py-2 pl-0">
            {actors.map((a) => (
              <Lane key={a.id} x={center(a.id)} kind={a.kind ?? 'client'} />
            ))}
            {steps.map((st, i) => {
              const kind = st.kind ?? 'reliable';
              const self = kind === 'local' || st.from === st.to;
              const a = center(st.from);
              const b = center(st.to);
              const lo = Math.min(a, b);
              const hi = Math.max(a, b);
              const w = clamp(self ? Math.max(col, minLabel) : Math.max(hi - lo + col * 0.6, minLabel), 0, 100);
              const mid = self ? a : (lo + hi) / 2;
              const left = clamp(mid - w / 2, 0, 100 - w);
              const state = i < s.index ? 'past' : i === s.index ? 'active' : 'future';
              return (
                <li
                  key={i}
                  className="dg-step relative cursor-pointer rounded-md py-1"
                  data-state={state}
                  data-tone={st.tone}
                  onClick={() => s.goTo(i)}
                >
                  <div className="relative px-1 text-center text-[0.8rem] leading-snug" style={{ marginLeft: `${left}%`, width: `${w}%` }}>
                    <span
                      className={[
                        'dg-label-bg rounded px-1',
                        st.tone === 'warn' ? 'text-warn' : st.tone === 'danger' ? 'text-danger' : st.tone === 'muted' ? 'text-muted italic' : '',
                      ].join(' ')}
                    >
                      <span className="mr-1 font-mono text-[0.7rem] text-muted">{i + 1}</span>
                      {(st.tone === 'warn' || st.tone === 'danger') && <span className="mr-0.5">⚠</span>}
                      <span className="font-medium">{st.label}</span>
                    </span>
                    {st.code && showRowCode && (
                      <span className="mt-0.5 block">
                        <code className="dg-label-bg rounded px-1 font-mono text-[0.7rem] break-words text-muted">{st.code}</code>
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <svg className="block h-6 w-full overflow-visible">
                      {self ? (
                        <svg x={`${a}%`} y={0} overflow="visible">
                          <path className="dg-line" data-kind={kind === "event" ? "event" : undefined} d="M2 4h18a8 8 0 0 1 0 16H9" />
                          <polygon className="dg-head" points="2,20 11,15 11,25" />
                          {state === 'active' && (
                            <PacketDot
                              runKey={s.index}
                              disabled={s.reducedMotion}
                              durationMs={900}
                              r={4.5}
                              points={[
                                [2, 4],
                                [20, 4],
                                [27, 8],
                                [27, 16],
                                [20, 20],
                                [6, 20],
                              ]}
                            />
                          )}
                        </svg>
                      ) : (
                        <>
                          <Arrow unit="%" x1={a} x2={b} y1={12} y2={12} kind={kind} />
                          {state === 'active' && (
                            <PacketDot
                              unit="%"
                              runKey={s.index}
                              disabled={s.reducedMotion}
                              durationMs={1000}
                              points={[
                                [a, 12],
                                [b, 12],
                              ]}
                            />
                          )}
                        </>
                      )}
                    </svg>
                    {kind === 'rpc' && !self && (
                      <span
                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded border border-border bg-surface px-1 text-[0.6rem] leading-4 font-bold tracking-wider text-accent"
                        style={{ left: `${(a + b) / 2}%` }}
                      >
                        RPC
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* ------------------------------------------------ caption for the active step */}
      <div
        className="min-h-[4.75rem] rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm"
        aria-live="polite"
        data-testid="dg-caption"
      >
        {active ? (
          <>
            <p>
              <span className="font-mono text-xs text-muted">
                {s.index + 1}/{steps.length}
              </span>{' '}
              <span className="font-semibold">
                {active.from === active.to || active.kind === 'local'
                  ? name(active.from)
                  : `${name(active.from)} → ${name(active.to)}`}
                :
              </span>{' '}
              {active.label}
            </p>
            {active.code && <code className="mt-1 block font-mono text-xs break-words text-accent">{active.code}</code>}
            {active.note && <p className="mt-1 text-muted">{active.note}</p>}
          </>
        ) : (
          <p className="text-muted">{intro ?? 'Press play, or step through the messages one at a time.'}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <StepperControls s={s} />
        <ul className="flex list-none flex-wrap gap-x-3 gap-y-1 pl-0 text-xs text-muted" aria-label="Legend">
          {kindsUsed.map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <LegendSample kind={k} />
              {k === 'rpc' ? 'RPC' : k}
            </li>
          ))}
        </ul>
      </div>

      {footer}

      {/* ------------------------------------------------ text alternative */}
      <div className="sr-only">
        <p>
          {title ? `${title}: ` : ''}
          {steps.length} steps between {actors.map((a) => `${a.label} (${KIND_LABEL[a.kind ?? 'client']})`).join(', ')}.
        </p>
        <ol>
          {steps.map((st, i) => (
            <li key={i}>
              {st.from === st.to || st.kind === 'local' ? name(st.from) : `${name(st.from)} to ${name(st.to)}`}, {KIND_TEXT[st.kind ?? 'reliable']}:{' '}
              {st.label}.{st.code ? ` Code: ${st.code}.` : ''}
              {st.note ? ` ${st.note}` : ''}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
