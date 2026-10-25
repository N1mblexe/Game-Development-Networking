import { renderInline } from '../../../lib/quiz/inline';
import { Mark, optionClass } from './shared';

interface Props {
  kind: 'radio' | 'checkbox';
  name: string;
  /** In display order; `key` is the original index the response stores. */
  options: { key: number; label: string }[];
  selected: number[];
  correct: number[];
  onToggle: (key: number) => void;
  locked: boolean;
  reveal: boolean;
  onSubmit?: () => void;
}

/** Native radios/checkboxes styled as option cards. Arrow keys move between radios for free. */
export default function ChoiceList({ kind, name, options, selected, correct, onToggle, locked, reveal, onSubmit }: Props) {
  return (
    <div className="grid gap-2">
      {options.map(({ key, label }, i) => {
        const isSel = selected.includes(key);
        const isRight = correct.includes(key);
        const state = reveal
          ? isRight
            ? isSel
              ? 'correct'
              : 'missed'
            : isSel
              ? 'wrong'
              : 'idle'
          : isSel
            ? 'selected'
            : 'idle';
        const id = `${name}-opt-${i}`;
        return (
          <label key={key} htmlFor={id} className={optionClass(state, locked)}>
            <input
              id={id}
              type={kind}
              name={name}
              value={key}
              checked={isSel}
              disabled={locked}
              onChange={() => onToggle(key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && onSubmit) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              className="mt-1 h-4 w-4 shrink-0 accent-accent disabled:cursor-default"
            />
            <span className="min-w-0 flex-1">{renderInline(label)}</span>
            {reveal && state !== 'idle' && state !== 'selected' && <Mark kind={state} />}
          </label>
        );
      })}
    </div>
  );
}
