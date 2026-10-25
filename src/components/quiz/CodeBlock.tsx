import type { ReactNode } from 'react';
import { highlightLines, type CodeToken, type TokenKind } from '../../lib/quiz/highlight';

/** Same palette as the lessons' Expressive Code themes (GitHub light/dark default). */
export const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: '',
  keyword: 'text-[#cf222e] dark:text-[#ff7b72]',
  type: 'text-[#8250df] dark:text-[#d2a8ff]',
  string: 'text-[#0a3069] dark:text-[#a5d6ff]',
  number: 'text-[#0550ae] dark:text-[#79c0ff]',
  comment: 'italic text-[#6e7781] dark:text-[#8b949e]',
  attr: 'text-[#953800] dark:text-[#ffa657]',
};

export function CodeTokens({ tokens }: { tokens: CodeToken[] }) {
  if (!tokens.length) return <>{'​'}</>;
  return (
    <>
      {tokens.map((t, i) =>
        t.kind === 'plain' ? (
          t.text
        ) : (
          <span key={i} className={TOKEN_CLASS[t.kind]}>
            {t.text}
          </span>
        ),
      )}
    </>
  );
}

interface CodeBlockProps {
  code: string;
  lang?: string;
  /** Show the line-number gutter (default true). */
  lineNumbers?: boolean;
  className?: string;
  /** Accessible label for the code region. */
  label?: string;
  children?: ReactNode;
}

/** Read-only code with line numbers. Scrolls horizontally inside itself, never the page. */
export default function CodeBlock({ code, lang = 'csharp', lineNumbers = true, className = '', label }: CodeBlockProps) {
  const lines = highlightLines(code);
  const gutter = String(lines.length).length;
  return (
    <div className={`not-prose min-w-0 overflow-hidden rounded-lg border border-border bg-surface-2 ${className}`}>
      <pre
        className="overflow-x-auto py-3 font-mono text-[0.84rem] leading-6"
        data-lang={lang}
        role="group"
        aria-label={label ?? `Code (${lang})`}
        tabIndex={0}
      >
        <code className="block min-w-max">
          {lines.map((tokens, i) => (
            <span key={i} className="flex">
              {lineNumbers && (
                <span
                  aria-hidden="true"
                  className="sticky left-0 shrink-0 select-none bg-surface-2 pr-4 pl-3 text-right text-muted/70"
                  style={{ minWidth: `${gutter + 3}ch` }}
                >
                  {i + 1}
                </span>
              )}
              <span className={`whitespace-pre pr-4 ${lineNumbers ? '' : 'pl-4'}`}>
                <CodeTokens tokens={tokens} />
              </span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
