import { useCallback, useEffect, useState } from 'react';

/** True when the user asked the OS for reduced motion. Updates live. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export interface Stepper {
  /** -1 = not started; otherwise the active step (0-based). */
  index: number;
  count: number;
  /** Lowest index (the initial one): -1 for "not started", or 0. */
  min: number;
  playing: boolean;
  reducedMotion: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  reset: () => void;
  goTo: (i: number) => void;
}

/**
 * Step state machine shared by every diagram. Never auto-plays: playback only starts on user action,
 * which keeps reduced-motion users (and everyone reading the page) in control.
 */
export function useStepper(count: number, { stepMs = 2000, initial = -1 } = {}): Stepper {
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(initial);
  const [playing, setPlaying] = useState(false);

  // Reset when the step list changes (for example a variant switch).
  useEffect(() => {
    setIndex(initial);
    setPlaying(false);
  }, [count, initial]);

  useEffect(() => {
    if (!playing) return;
    if (index >= count - 1) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setIndex((i) => Math.min(i + 1, count - 1)), index < 0 ? 200 : stepMs);
    return () => window.clearTimeout(t);
  }, [playing, index, count, stepMs]);

  const play = useCallback(() => {
    setIndex((i) => (i >= count - 1 ? initial : i));
    setPlaying(true);
  }, [count, initial]);
  const pause = useCallback(() => setPlaying(false), []);
  const next = useCallback(() => {
    setPlaying(false);
    setIndex((i) => Math.min(i + 1, count - 1));
  }, [count]);
  const prev = useCallback(() => {
    setPlaying(false);
    setIndex((i) => Math.max(i - 1, initial));
  }, [initial]);
  const reset = useCallback(() => {
    setPlaying(false);
    setIndex(initial);
  }, [initial]);
  const goTo = useCallback(
    (i: number) => {
      setPlaying(false);
      setIndex(Math.max(initial, Math.min(i, count - 1)));
    },
    [count, initial],
  );

  return {
    index,
    count,
    min: initial,
    playing,
    reducedMotion,
    play,
    pause,
    toggle: playing ? pause : play,
    next,
    prev,
    reset,
    goTo,
  };
}
