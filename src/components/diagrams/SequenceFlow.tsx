import InteractiveFrame from '../InteractiveFrame';
import SequenceCore from './primitives/SequenceCore';
import type { SequenceProps } from './types';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locales';
import { LocaleProvider } from '../../i18n/react';

/**
 * Inline sequence diagram used by <Sequence /> in MDX: actor columns, lifelines, one arrow per step,
 * play/pause/step controls, and an ordered list as the screen-reader alternative.
 */
function SequenceFlowView({ title, actors, steps }: SequenceProps) {
  return (
    <InteractiveFrame kind="Diagram" title={title ?? 'Sequence'}>
      <SequenceCore actors={actors} steps={steps} title={title} />
    </InteractiveFrame>
  );
}

/** Root island. Its only locale-related prop is `locale`; children read text with useT() (see src/i18n/react.tsx). */
export default function SequenceFlow({ locale = DEFAULT_LOCALE, ...props }: SequenceProps & { locale?: Locale }) {
  return (
    <LocaleProvider locale={locale}>
      <SequenceFlowView {...props} />
    </LocaleProvider>
  );
}
