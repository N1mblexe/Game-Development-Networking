/**
 * The shared simulation loop for every canvas sim:
 *  - fixed-dt virtual time (`FixedStepper`) driven by requestAnimationFrame, with a speed multiplier
 *  - play / pause / single-step / restart
 *  - auto-play when on screen (IntersectionObserver), stop the RAF loop when off screen or hidden
 *  - start paused when the user prefers reduced motion
 *  - DPR-aware canvas that resizes with its container
 *  - theme colours re-read when `data-theme` changes
 *  - a throttled `onStats` callback for React-rendered readouts
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FixedStepper } from '../../../lib/netsim';
import { readPalette, watchTheme, type Palette } from './theme';

export interface SimOptions {
  /** Fixed simulation step in virtual ms. */
  dt: number;
  /** Advance the model by one fixed step. Omit for static (non-animated) sims. */
  step?: (now: number, dt: number) => void;
  /** Render the current model. */
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, now: number) => void;
  /** Canvas height (CSS px) for a given width. */
  height: (width: number) => number;
  /** Virtual ms advanced by the Step button. */
  stepMs?: number;
  /** Called at most ~4×/s while running, and after every step/reset/redraw while paused. */
  onStats?: (now: number) => void;
  /** Auto-play when visible (default true). Ignored with prefers-reduced-motion. */
  autoplay?: boolean;
}

export interface SimHandle {
  wrapRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  playing: boolean;
  speed: number;
  setSpeed: (s: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  stepOnce: () => void;
  /** Reset virtual time to 0 (call after rebuilding the model) and redraw. */
  restart: () => void;
  /** Redraw now (e.g. after a slider changed while paused). */
  redraw: () => void;
  /** Current virtual time in ms. */
  now: () => number;
  /** Canvas size in CSS px. */
  size: () => { w: number; h: number };
  reducedMotion: boolean;
}

const STATS_INTERVAL_MS = 250;

export function useSim(opts: SimOptions): SimHandle {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stepperRef = useRef<FixedStepper | null>(null);
  if (!stepperRef.current) stepperRef.current = new FixedStepper(opts.dt);
  const stepper = stepperRef.current;

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [reducedMotion, setReducedMotion] = useState(false);

  const playingRef = useRef(false);
  const visibleRef = useRef(false);
  const userPausedRef = useRef(false);
  const runningRef = useRef(false);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const lastStatsRef = useRef(0);
  const pendingDrawRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const palRef = useRef<Palette | null>(null);

  const drawNow = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !sizeRef.current.w) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    if (!palRef.current) palRef.current = readPalette();
    const { w, h, dpr } = sizeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    optsRef.current.draw(ctx, w, h, palRef.current, stepper.now);
  }, [stepper]);

  const emitStats = useCallback(() => {
    lastStatsRef.current = performance.now();
    optsRef.current.onStats?.(stepper.now);
  }, [stepper]);

  const redraw = useCallback(() => {
    if (runningRef.current) return; // the loop draws anyway
    if (pendingDrawRef.current) return;
    pendingDrawRef.current = requestAnimationFrame(() => {
      pendingDrawRef.current = 0;
      drawNow();
      emitStats();
    });
  }, [drawNow, emitStats]);

  const frame = useCallback(
    (ts: number) => {
      if (!runningRef.current) return;
      const elapsed = lastTsRef.current ? Math.min(100, ts - lastTsRef.current) : 0;
      lastTsRef.current = ts;
      const step = optsRef.current.step;
      if (step) stepper.advance(elapsed, step);
      drawNow();
      if (ts - lastStatsRef.current > STATS_INTERVAL_MS) emitStats();
      rafRef.current = requestAnimationFrame(frame);
    },
    [drawNow, emitStats, stepper],
  );

  const sync = useCallback(() => {
    const should =
      playingRef.current && visibleRef.current && !!optsRef.current.step && (typeof document === 'undefined' || !document.hidden);
    if (should && !runningRef.current) {
      runningRef.current = true;
      lastTsRef.current = 0;
      rafRef.current = requestAnimationFrame(frame);
    } else if (!should && runningRef.current) {
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
      emitStats();
    }
  }, [frame, emitStats]);

  const setPlay = useCallback(
    (on: boolean, byUser: boolean) => {
      playingRef.current = on;
      if (byUser) userPausedRef.current = !on;
      setPlaying(on);
      sync();
      if (!on) redraw();
    },
    [sync, redraw],
  );

  // Visibility, reduced motion, resize, theme.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducedMotion(reduced);
    const autoplay = !reduced && optsRef.current.autoplay !== false && !!optsRef.current.step;

    const resize = () => {
      const w = Math.max(1, Math.floor(wrap.clientWidth));
      const h = Math.max(1, Math.round(optsRef.current.height(w)));
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      if (w === sizeRef.current.w && h === sizeRef.current.h && dpr === sizeRef.current.dpr) return;
      sizeRef.current = { w, h, dpr };
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      drawNow();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.some((e) => e.isIntersecting);
        visibleRef.current = vis;
        if (vis && autoplay && !userPausedRef.current && !playingRef.current) setPlay(true, false);
        else sync();
      },
      { threshold: 0.15 },
    );
    io.observe(wrap);

    const onVis = () => sync();
    document.addEventListener('visibilitychange', onVis);
    const unwatch = watchTheme(() => {
      palRef.current = readPalette();
      drawNow();
    });
    drawNow();
    emitStats();

    return () => {
      ro.disconnect();
      io.disconnect();
      unwatch();
      document.removeEventListener('visibilitychange', onVis);
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(pendingDrawRef.current);
    };
  }, [drawNow, emitStats, setPlay, sync]);

  const setSpeed = useCallback(
    (s: number) => {
      stepper.speed = s;
      setSpeedState(s);
    },
    [stepper],
  );

  const stepOnce = useCallback(() => {
    setPlay(false, true);
    const step = optsRef.current.step;
    if (step) stepper.stepBy(optsRef.current.stepMs ?? 50, step);
    drawNow();
    emitStats();
  }, [setPlay, stepper, drawNow, emitStats]);

  const restart = useCallback(() => {
    stepper.reset();
    drawNow();
    emitStats();
  }, [stepper, drawNow, emitStats]);

  const play = useCallback(() => setPlay(true, true), [setPlay]);
  const pause = useCallback(() => setPlay(false, true), [setPlay]);
  const toggle = useCallback(() => setPlay(!playingRef.current, true), [setPlay]);
  const redrawNow = useCallback(() => {
    if (runningRef.current) return;
    drawNow();
    emitStats();
  }, [drawNow, emitStats]);
  const now = useCallback(() => stepper.now, [stepper]);
  const size = useCallback(() => sizeRef.current, []);

  // Stable identity between play-state changes, so sims can use it in effect deps.
  return useMemo(
    () => ({ wrapRef, canvasRef, playing, speed, setSpeed, play, pause, toggle, stepOnce, restart, redraw: redrawNow, now, size, reducedMotion }),
    [playing, speed, setSpeed, play, pause, toggle, stepOnce, restart, redrawNow, now, size, reducedMotion],
  );
}
