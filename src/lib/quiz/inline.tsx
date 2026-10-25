/**
 * A tiny, safe inline formatter for prompts, options, explanations and flashcards.
 * Supports `code`, **bold** and *italic*. Everything else is plain text: no HTML is ever injected.
 */
import { Fragment, type ReactNode } from 'react';

export type InlineToken =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'bold'; children: InlineToken[] }
  | { kind: 'italic'; children: InlineToken[] };

/** Tokenize inline markup. Unclosed markers are kept as literal text. */
export function parseInline(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ kind: 'text', text: buf });
    buf = '';
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ kind: 'code', text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    } else if (ch === '*' && text[i + 1] === '*') {
      const end = findClose(text, i + 2, '**');
      if (end > i + 2) {
        flush();
        out.push({ kind: 'bold', children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    } else if (ch === '*' && text[i + 1] && !/\s/.test(text[i + 1])) {
      const end = findClose(text, i + 1, '*');
      if (end > i + 1) {
        flush();
        out.push({ kind: 'italic', children: parseInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

/** Find a closing marker that is not inside a code span and not preceded by whitespace. */
function findClose(text: string, from: number, marker: string): number {
  for (let j = from; j < text.length; j++) {
    if (text[j] === '`') {
      const end = text.indexOf('`', j + 1);
      if (end === -1) return -1;
      j = end;
      continue;
    }
    if (text.startsWith(marker, j) && !/\s/.test(text[j - 1] ?? ' ')) {
      // For single "*", don't stop on the first half of a "**".
      if (marker === '*' && text[j + 1] === '*') {
        j++;
        continue;
      }
      return j;
    }
  }
  return -1;
}

function toNodes(tokens: InlineToken[], key = ''): ReactNode[] {
  return tokens.map((t, i) => {
    const k = `${key}${i}`;
    switch (t.kind) {
      case 'text':
        return <Fragment key={k}>{t.text}</Fragment>;
      case 'code':
        return (
          <code
            key={k}
            className="rounded border border-border bg-surface-2 px-1 py-px font-mono text-[0.88em] [overflow-wrap:anywhere]"
          >
            {t.text}
          </code>
        );
      case 'bold':
        return (
          <strong key={k} className="font-semibold">
            {toNodes(t.children, `${k}-`)}
          </strong>
        );
      case 'italic':
        return <em key={k}>{toNodes(t.children, `${k}-`)}</em>;
    }
  });
}

/** Render inline markup as React nodes. */
export function renderInline(text: string | undefined | null): ReactNode {
  if (!text) return null;
  return <>{toNodes(parseInline(text))}</>;
}
