/** Every core namespace of this locale (see ../en/core.ts). Each file is typed against its English counterpart. */
import type en from '../en/core';
import ui from './ui';
import pages from './pages';
import quiz from './quiz';
import srs from './srs';
import progress from './progress';
import glossary from './glossary';
import sim from './sim';
import diagram from './diagram';
import registrySims from './registry-sims';
import registryDiagrams from './registry-diagrams';

export default {
  ui,
  pages,
  quiz,
  srs,
  progress,
  glossary,
  sim,
  diagram,
  'registry-sims': registrySims,
  'registry-diagrams': registryDiagrams,
} satisfies Record<keyof typeof en, unknown>;
