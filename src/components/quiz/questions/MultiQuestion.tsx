import ChoiceList from './ChoiceList';
import type { QuestionInputProps } from './shared';

export default function MultiQuestion({ question: q, value, onChange, locked, reveal, name, order, onSubmit }: QuestionInputProps<'multi'>) {
  const display = order.length === q.options.length ? order : q.options.map((_, i) => i);
  const selected = Array.isArray(value) ? value : [];
  return (
    <>
      {!/select all/i.test(q.prompt) && <p className="mb-2 text-sm text-muted">Select all that apply.</p>}
      <ChoiceList
        kind="checkbox"
        name={name}
        options={display.map((key) => ({ key, label: q.options[key] }))}
        selected={selected}
        correct={q.answers}
        onToggle={(key) =>
          onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key].sort((a, b) => a - b))
        }
        locked={locked}
        reveal={reveal}
        onSubmit={onSubmit}
      />
    </>
  );
}
