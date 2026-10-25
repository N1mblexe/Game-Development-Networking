/**
 * Components available in every lesson without an import. Passed to <Content components={...} />.
 * Adding a component here makes it part of the content contract: document it in CONTRIBUTING.md.
 */
import Callout from './Callout.astro';
import CodeTabs from './CodeTabs.astro';
import Diagram from './Diagram.astro';
import KeyTakeaways from './KeyTakeaways.astro';
import Link from './Link.astro';
import Sequence from './Sequence.astro';
import Sim from './Sim.astro';
import Steps from './Steps.astro';
import Term from './Term.astro';

export const mdxComponents = { Callout, CodeTabs, Diagram, KeyTakeaways, Sequence, Sim, Steps, Term, a: Link };
