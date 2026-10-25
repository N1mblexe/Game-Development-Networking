import ChoiceList from './ChoiceList';
import type { QuestionInputProps } from './shared';

export default function SingleQuestion({ question: q, value, onChange, locked, reveal, name, order, onSubmit }: QuestionInputProps<'single'>) {
  const display = order.length === q.options.length ? order : q.options.map((_, i) => i);
  return (
    <ChoiceList
      kind="radio"
      name={name}
      options={display.map((key) => ({ key, label: q.options[key] }))}
      selected={typeof value === 'number' ? [value] : []}
      correct={[q.answer]}
      onToggle={(key) => onChange(key)}
      locked={locked}
      reveal={reveal}
      onSubmit={onSubmit}
    />
  );
}
