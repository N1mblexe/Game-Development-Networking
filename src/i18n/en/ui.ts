/**
 * Site chrome: layout, header, footer, language switcher, MDX wrappers (Callout), the simulator/diagram frame.
 * Owner after Phase A: B1 (UI chrome). Keys are grouped by component; add a group per component you extract.
 */
import type { Dict } from '../types';

export default {
  layout: {
    skipToContent: 'Skip to content',
    defaultDescription: 'Interactive course: game networking, Unity Netcode for GameObjects and Steam.',
    footerNote: 'NetLearn · progress is stored only in this browser ·',
    footerLink: 'export or reset',
  },
  nav: {
    main: 'Main',
    mainMobile: 'Main mobile',
    menu: 'Menu',
    course: 'Course',
    playground: 'Playground',
    review: 'Review',
    glossary: 'Glossary',
    progress: 'Progress',
  },
  theme: {
    toggle: 'Toggle dark mode',
  },
  /** Header search button and the Ctrl/⌘+K modal (Pagefind's own strings follow <html lang> automatically). */
  search: {
    button: 'Search',
    placeholder: 'Search lessons and the glossary…',
    moduleFilter: 'Module',
    modalDefault: 'Type to search lessons and glossary terms.',
    fullPage: 'Full search page →',
  },
  /** Language switcher (header) and the one-time "available in your language" banner. */
  language: {
    /** aria-label of the switcher group. */
    label: 'Language',
    /** Shown on pages in OTHER languages, in this language: the banner offering this one. */
    bannerText: 'This course is also available in English.',
    bannerAction: 'Read in English',
    bannerDismiss: 'No thanks',
  },
  /** Shown on a translated page whose lesson is not translated yet (the English body is shown instead). */
  fallback: {
    title: 'Not translated yet',
    body: 'This lesson has not been translated yet, so you are reading the original version.',
  },
  callout: {
    note: 'Note',
    tip: 'Tip',
    warning: 'Warning',
    danger: 'Danger',
    pitfall: 'Common pitfall',
    unity: 'In Unity',
    steam: 'Steamworks',
  },
  /** InteractiveFrame, SimHost and DiagramHost. */
  frame: {
    simulator: 'Simulator',
    diagram: 'Diagram',
    loading: 'Loading…',
    failed: (error: string) => `Failed to load: ${error}`,
    unknownSim: (name: string) => `Unknown simulator "${name}"`,
    unknownSimHint: 'Not found in sim/registry.ts.',
    unknownDiagram: (name: string) => `Unknown diagram "${name}"`,
    unknownDiagramHint: 'Not found in diagrams/registry.ts.',
  },
} satisfies Dict;
