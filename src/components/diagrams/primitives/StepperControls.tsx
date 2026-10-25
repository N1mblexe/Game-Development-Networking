import type { ReactNode } from 'react';
import type { Stepper } from './useStepper';

const icon = {
  reset: <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />,
  prev: <path d="M15 18 9 12l6-6" />,
  next: <path d="m9 18 6-6-6-6" />,
  play: <path d="M7 5v14l11-7z" fill="currentColor" />,
  pause: <path d="M8 5v14M16 5v14" strokeWidth={3} />,
};

function Btn({
  label,
  onClick,
  disabled,
  children,
  primary,
  testId,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  primary?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={[
        'grid h-9 w-9 place-items-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        primary
          ? 'border-accent bg-accent text-on-accent hover:opacity-90'
          : 'border-border bg-surface text-text hover:bg-surface-2',
      ].join(' ')}
    >
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

/** Reset / back / play-pause / forward controls plus a step counter. */
export default function StepperControls({ s, label = 'Step' }: { s: Stepper; label?: string }) {
  const atEnd = s.index >= s.count - 1;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Playback controls">
      <Btn label="Reset" onClick={s.reset} disabled={s.index <= s.min && !s.playing} testId="dg-reset">
        {icon.reset}
      </Btn>
      <Btn label={`Previous ${label.toLowerCase()}`} onClick={s.prev} disabled={s.index <= s.min} testId="dg-prev">
        {icon.prev}
      </Btn>
      <Btn label={s.playing ? 'Pause' : atEnd ? 'Replay' : 'Play'} onClick={s.toggle} primary testId="dg-play">
        {s.playing ? icon.pause : icon.play}
      </Btn>
      <Btn label={`Next ${label.toLowerCase()}`} onClick={s.next} disabled={atEnd} testId="dg-next">
        {icon.next}
      </Btn>
      <span className="ml-1 font-mono text-xs text-muted tabular-nums" data-testid="dg-counter">
        {label} {Math.max(0, s.index + 1)}/{s.count}
      </span>
    </div>
  );
}
