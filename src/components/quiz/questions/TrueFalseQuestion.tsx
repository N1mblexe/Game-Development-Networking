import ChoiceList from './ChoiceList';
import type { QuestionInputProps } from './shared';

/** Keys: 1 = true, 0 = false (only inside this component; the response is a boolean). */
export default function TrueFalseQuestion({ question: q, value, onChange, locked, reveal, name, onSubmit }: QuestionInputProps<'truefalse'>) {
  return (
    <ChoiceList
      kind="radio"
      name={name}
      options={[
        { key: 1, label: 'True' },
        { key: 0, label: 'False' },
      ]}
      selected={typeof value === 'boolean' ? [value ? 1 : 0] : []}
      correct={[q.answer ? 1 : 0]}
      onToggle={(key) => onChange(key === 1)}
      locked={locked}
      reveal={reveal}
      onSubmit={onSubmit}
    />
  );
}
