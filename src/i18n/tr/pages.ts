import type en from '../en/pages';
import type { Messages } from '../types';

export default {
  notFound: {
    title: 'Sayfa bulunamadı',
    heading: 'Bu paket kayboldu.',
    body: 'Aradığın sayfa yok ve kimse onu yeniden göndermeyecek.',
    back: 'Kursa dön',
  },
  search: {
    title: 'Arama',
    description: 'Tüm dersleri ve sözlük terimlerini ara.',
    introBefore: 'Dersler ve sözlük terimleri. İpucu: herhangi bir sayfada',
    introAfter: 'tuşlarına bas.',
    filters: 'Filtreler',
    defaultMessage: 'Aramak için yazmaya başla.',
    noscript: 'Arama için JavaScript gerekiyor. Bunun yerine kursa ana sayfadan göz at.',
  },
} satisfies Messages<typeof en>;
