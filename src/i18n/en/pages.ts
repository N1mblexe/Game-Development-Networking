/**
 * Page bodies: src/pages/[...locale]/** (home, playground, review, progress, search, module, exam, certificate) and
 * the root 404. Owner after Phase A: B1. One group per page.
 */
import type { Dict } from '../types';

export default {
  /** src/pages/404.astro: English is rendered; the client swaps in the strings of the locale in the URL. */
  notFound: {
    title: 'Not found',
    heading: 'This packet was lost.',
    body: "The page you asked for doesn't exist, and nobody is going to retransmit it.",
    back: 'Back to the course',
  },
  search: {
    title: 'Search',
    description: 'Search every lesson and glossary term.',
    introBefore: 'Lessons and glossary terms. Tip: press',
    introAfter: 'on any page.',
    filters: 'Filters',
    defaultMessage: 'Type to search.',
    noscript: 'Search needs JavaScript. Browse the course from the home page instead.',
  },
} satisfies Dict;
