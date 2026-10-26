/**
 * Every core namespace of this locale in one module, so a page downloads exactly one dictionary chunk, for its own
 * language (see ../load.ts). A new core namespace is added here and in every other locale's core.ts.
 */
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
};
