import { highlightLines } from '../../../lib/quiz/highlight';
import { CodeTokens } from '../CodeBlock';
import type { QuestionInputProps } from './shared';

/** "Click the buggy line": every non-blank line is a toggle button (aria-pressed). */
export default function CodeLineQuestion({ question: q, value, onChange, locked, reveal, name }: QuestionInputProps<'codeline'>) {
  const lines = highlightLines(q.code);
  const raw = q.code.replace(/\n$/, '').split('\n');
  const selected = Array.isArray(value) ? value : [];
  const gutter = String(lines.length).length + 3;
  const multiple = q.answerLines.length > 1;

  const toggle = (line: number) =>
    onChange(
      selected.includes(line)
        ? selected.filter((l) => l !== line)
        : multiple
          ? [...selected, line].sort((a, b) => a - b)
          : [line],
    );

  return (
    <>
      <p className="mb-2 text-sm text-muted" id={`${name}-hint`}>
        {multiple ? `Select ${q.answerLines.length} lines.` : 'Select one line.'}
      </p>
      <div
        className="not-prose min-w-0 overflow-hidden rounded-lg border border-border bg-surface-2"
        role="group"
        aria-describedby={`${name}-hint`}
      >
        <div className="overflow-x-auto py-2 font-mono text-[0.84rem] leading-6">
          <div className="min-w-max">
            {lines.map((tokens, i) => {
              const line = i + 1;
              const isSel = selected.includes(line);
              const isAns = q.answerLines.includes(line);
              const blank = raw[i].trim() === '';
              const tone = reveal
                ? isAns
                  ? isSel
                    ? 'bg-ok-soft shadow-[inset_3px_0_0_var(--ok)]'
                    : 'bg-ok-soft/60 shadow-[inset_3px_0_0_var(--ok)] outline-1 -outline-offset-1 outline-dashed outline-ok'
                  : isSel
                    ? 'bg-danger-soft shadow-[inset_3px_0_0_var(--danger)]'
                    : ''
                : isSel
                  ? 'bg-accent-soft shadow-[inset_3px_0_0_var(--accent)]'
                  : '';
              const content = (
                <>
                  <span aria-hidden="true" className="shrink-0 select-none pr-4 pl-3 text-right text-muted/70" style={{ minWidth: `${gutter}ch` }}>
                    {line}
                  </span>
                  <span className="whitespace-pre pr-4">
                    <CodeTokens tokens={tokens} />
                  </span>
                  {reveal && (isAns || isSel) && (
                    <span className={`sticky right-0 ml-auto shrink-0 px-3 font-sans text-xs font-bold ${isAns ? 'text-ok' : 'text-danger'}`}>
                      {isAns ? (isSel ? '✓' : '← this one') : '✗'}
                    </span>
                  )}
                </>
              );
              if (blank) return <div key={i} className="flex">{content}</div>;
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={isSel}
                  disabled={locked}
                  onClick={() => toggle(line)}
                  className={`flex w-full text-left ${tone} ${locked ? 'cursor-default' : 'cursor-pointer hover:bg-accent-soft/60'} focus-visible:outline-2 focus-visible:-outline-offset-2`}
                >
                  <span className="sr-only">
                    Line {line}
                    {reveal ? (isAns ? ', the answer' : isSel ? ', incorrect' : '') : ''}:{' '}
                  </span>
                  {content}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
