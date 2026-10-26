/**
 * Shared simulator chrome used by every sim (sim/ui/controls.tsx: play/pause/step/reset, stat grid, sliders). Owner: B3.
 * Per-sim strings live in the lazy namespace sims/<name>.ts instead, so a page only downloads the sims it embeds.
 *
 * Empty until Phase B extracts the strings. Pattern: one group per component, function leaves for values:
 *   score: ({ n, total }: { n: number; total: number }) => `${n} of ${total}`,
 */
import type { Dict } from '../types';

export default {} satisfies Dict;
