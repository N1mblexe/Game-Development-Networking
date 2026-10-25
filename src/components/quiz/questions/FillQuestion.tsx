import { grade } from '../../../lib/quiz/grade';
import type { QuestionInputProps } from './shared';

export function textInputClass(reveal: boolean, correct: boolean) {
  const tone = reveal ? (correct ? 'border-ok bg-ok-soft' : 'border-danger bg-danger-soft') : 'border-border bg-surface';
  return `w-full min-w-0 rounded-lg border px-3 py-2 font-mono text-[0.95rem] text-text placeholder:text-muted/70 focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-100 ${tone}`;
}

export default function FillQuestion({ question: q, value, onChange, locked, reveal, name, labelledBy, onSubmit }: QuestionInputProps<'fill'>) {
  const text = typeof value === 'string' ? value : '';
  return (
    <div className="max-w-md">
      <input
        id={`${name}-input`}
        type="text"
        value={text}
        readOnly={locked}
        aria-labelledby={labelledBy}
        aria-invalid={reveal ? !grade(q, text).correct : undefined}
        placeholder={q.placeholder ?? 'Type your answer'}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className={textInputClass(reveal, grade(q, text).correct)}
      />
      {q.caseSensitive && !locked && <p className="mt-1.5 text-xs text-muted">Case matters.</p>}
    </div>
  );
}
