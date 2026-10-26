/**
 * TickRate simulator (src/components/sim/TickRate.tsx). Lazy namespace "sims/tick-rate": loaded by SimHost with the
 * sim, so only pages that embed it download it. Numbers arrive already formatted for the locale (format.ts).
 * `canvas` is passed to the draw function as its `labels` argument.
 */
import type { Dict } from '../../types';

export default {
  canvasLabel: (speed: string) =>
    `A ball flies at ${speed} m/s toward a thin wall. Each lane simulates it at a different tick rate and only checks for collisions at tick moments; dots mark where each tick sampled the ball. At low tick rates the ball can jump straight past the wall between two ticks (tunnelling).`,
  speed: 'Projectile speed',
  speedHint: (cm: string) => `Collision needs a tick while the ball overlaps the wall: a ${cm} cm window.`,
  tickRate: 'Tick rate',
  sweep: 'Swept collision (CCD)',
  sweepHint: 'Test the whole path between ticks, not just the end point. Fixes tunnelling at any tick rate.',
  legend: {
    sample: 'tick sample (what the simulation saw)',
    truth: 'real continuous motion',
    wall: 'wall (30 cm)',
  },
  stats: {
    caught: (rate: number) => `${rate} Hz caught`,
    caughtValue: ({ hits, runs, pct }: { hits: number; runs: number; pct: string }) => `${hits}/${runs} (${pct})`,
    step: (rate: number) => `${rate} Hz step`,
    stepValue: (cm: string) => `${cm} cm/tick`,
  },
  canvas: {
    metres: (n: number) => `${n} m`,
    ball: (speed: number) => `ball ${speed} m/s →`,
    rate: (rate: number) => `${rate} Hz`,
    lane: ({ ms, cm }: { ms: string; cm: string }) => `${ms} ms/tick · moves ${cm} cm per tick`,
    missedShort: 'MISSED: tunnelled',
    missedLong: 'MISSED: tunnelled through the wall',
    hit: 'HIT: bounced',
  },
} satisfies Dict;
