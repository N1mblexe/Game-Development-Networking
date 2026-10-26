/** Turkish titles, descriptions and preset labels for src/components/sim/registry.ts. Unlisted text stays English. */
import type { RegistrySimsMessages } from '../registry-types';

export default {
  'tick-rate': {
    title: 'Tick Hızı',
    description: 'Aynı hareketin 10, 30 ve 60 Hz’lik simülasyon tick’leriyle nasıl örneklendiğini karşılaştır.',
    presets: {
      compare: { label: '10 / 30 / 60 Hz' },
      'low-tick': { label: 'Yalnızca 10 Hz', description: 'Kaba örnekleme hızlı olayları kaçırır.' },
    },
  },
} satisfies RegistrySimsMessages;
