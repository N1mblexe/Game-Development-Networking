/**
 * Shared diagram chrome (diagrams/primitives/**: stepper controls, SequenceCore, VariantSwitcher), also used by
 * the server-rendered <Sequence>. Owner: B4. Per-diagram text lives in the lazy namespace diagrams/<name>.ts.
 *
 * Empty until Phase B extracts the strings. Pattern: one group per component, function leaves for values:
 *   score: ({ n, total }: { n: number; total: number }) => `${n} of ${total}`,
 */
import type { Dict } from '../types';

export default {} satisfies Dict;
