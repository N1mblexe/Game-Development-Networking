import type en from '../en/ui';
import type { Messages } from '../types';

export default {
  layout: {
    skipToContent: 'İçeriğe geç',
    defaultDescription: 'Etkileşimli kurs: oyun ağ programlama, Unity Netcode for GameObjects ve Steam.',
    footerNote: 'NetLearn · ilerlemen yalnızca bu tarayıcıda saklanır ·',
    footerLink: 'dışa aktar veya sıfırla',
  },
  nav: {
    main: 'Ana menü',
    mainMobile: 'Ana menü (mobil)',
    menu: 'Menü',
    course: 'Kurs',
    playground: 'Deneme alanı',
    review: 'Tekrar',
    glossary: 'Sözlük',
    progress: 'İlerleme',
  },
  theme: {
    toggle: 'Karanlık modu aç/kapat',
  },
  search: {
    button: 'Ara',
    placeholder: 'Derslerde ve sözlükte ara…',
    moduleFilter: 'Modül',
    modalDefault: 'Dersleri ve sözlük terimlerini aramak için yaz.',
    fullPage: 'Tam arama sayfası →',
  },
  language: {
    label: 'Dil',
    bannerText: 'Bu kurs Türkçe olarak da mevcut.',
    bannerAction: 'Türkçe oku',
    bannerDismiss: 'Hayır, teşekkürler',
  },
  fallback: {
    title: 'Henüz çevrilmedi',
    body: 'Bu ders henüz Türkçeye çevrilmedi; şimdilik İngilizce aslını okuyorsun.',
  },
  callout: {
    note: 'Not',
    tip: 'İpucu',
    warning: 'Uyarı',
    danger: 'Tehlike',
    pitfall: 'Sık yapılan hata',
    unity: "Unity'de",
    steam: 'Steamworks',
  },
  frame: {
    simulator: 'Simülatör',
    diagram: 'Diyagram',
    loading: 'Yükleniyor…',
    failed: (error) => `Yüklenemedi: ${error}`,
    unknownSim: (name) => `Bilinmeyen simülatör "${name}"`,
    unknownSimHint: "sim/registry.ts içinde bulunamadı.",
    unknownDiagram: (name) => `Bilinmeyen diyagram "${name}"`,
    unknownDiagramHint: "diagrams/registry.ts içinde bulunamadı.",
  },
} satisfies Messages<typeof en>;
