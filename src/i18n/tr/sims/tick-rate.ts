import type en from '../../en/sims/tick-rate';
import type { Messages } from '../../types';

export default {
  canvasLabel: (speed) =>
    `Bir top ${speed} m/s hızla ince bir duvara doğru uçuyor. Her şerit onu farklı bir tick hızında simüle ediyor ve çarpışmayı yalnızca tick anlarında kontrol ediyor; noktalar her tick’in topu nerede örneklediğini gösteriyor. Düşük tick hızlarında top iki tick arasında duvarın içinden doğrudan geçebilir (tunnelling).`,
  speed: 'Mermi hızı',
  speedHint: (cm) => `Çarpışma için, top duvarla örtüşürken bir tick gerekir: ${cm} cm’lik bir pencere.`,
  tickRate: 'Tick hızı',
  sweep: 'Süpürmeli çarpışma (CCD)',
  sweepHint: 'Yalnızca son noktayı değil, tick’ler arasındaki tüm yolu test et. Her tick hızında tunnelling’i önler.',
  legend: {
    sample: 'tick örneği (simülasyonun gördüğü)',
    truth: 'gerçek, kesintisiz hareket',
    wall: 'duvar (30 cm)',
  },
  stats: {
    caught: (rate) => `${rate} Hz yakalanan`,
    caughtValue: ({ hits, runs, pct }) => `${hits}/${runs} (${pct})`,
    step: (rate) => `${rate} Hz adım`,
    stepValue: (cm) => `${cm} cm/tick`,
  },
  canvas: {
    metres: (n) => `${n} m`,
    ball: (speed) => `top ${speed} m/s →`,
    rate: (rate) => `${rate} Hz`,
    lane: ({ ms, cm }) => `${ms} ms/tick · tick başına ${cm} cm ilerler`,
    missedShort: 'KAÇTI: içinden geçti',
    missedLong: 'KAÇTI: duvarın içinden geçti',
    hit: 'İSABET: sekti',
  },
} satisfies Messages<typeof en>;
