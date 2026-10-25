import { grade } from '../../../lib/quiz/grade';
import { textInputClass } from './FillQuestion';
import type { QuestionInputProps } from './shared';

export default function NumericQuestion({ question: q, value, onChange, locked, reveal, name, labelledBy, onSubmit }: QuestionInputProps<'numeric'>) {
  const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  const correct = grade(q, text).correct;
  return (
    <div className="flex max-w-xs items-center gap-2">
      <input
        id={`${name}-input`}
        type="text"
        inputMode="decimal"
        value={text}
        readOnly={locked}
        aria-labelledby={q.unit ? `${labelledBy} ${name}-unit` : labelledBy}
        aria-invalid={reveal ? !correct : undefined}
        placeholder="0"
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className={`${textInputClass(reveal, correct)} tabular-nums`}
      />
      {q.unit && (
        <span id={`${name}-unit`} className="shrink-0 font-medium text-muted">
          {q.unit}
        </span>
      )}
    </div>
  );
}
