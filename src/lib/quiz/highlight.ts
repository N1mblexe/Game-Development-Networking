/**
 * A deliberately small C-family highlighter for quiz and flashcard code (C#, C++, JS, JSON).
 * Lessons use Expressive Code at build time; islands can't, so this gives code in questions
 * the same "feels like an editor" look without a dependency. Output is plain tokens, never HTML.
 */
export type TokenKind = 'plain' | 'keyword' | 'type' | 'string' | 'number' | 'comment' | 'attr';
export interface CodeToken {
  kind: TokenKind;
  text: string;
}

const KEYWORDS = new Set(
  (
    'abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do ' +
    'double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal ' +
    'is lock long namespace new null object operator out override params private protected public readonly ref return sbyte ' +
    'sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort ' +
    'using var virtual void volatile while yield get set value let function export import from'
  ).split(' '),
);

const RULES: [TokenKind, RegExp][] = [
  ['comment', /\/\/.*|\/\*.*?\*\/|\/\*.*$/y],
  ['string', /\$?@?"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?/y],
  ['attr', /\[(?=[A-Z][\w.]*(?:\(|\]))[A-Z][\w.]*/y],
  ['number', /\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[fFdDmMuUlL]*\b/y],
  ['plain', /[A-Za-z_]\w*/y],
  ['plain', /\s+|./y],
];

/** Tokenize one line; `open` is true when it ends inside an unterminated block comment. */
function tokenizeLine(line: string): { tokens: CodeToken[]; open: boolean } {
  const tokens: CodeToken[] = [];
  let open = false;
  let i = 0;
  while (i < line.length) {
    for (const [kind, re] of RULES) {
      re.lastIndex = i;
      const m = re.exec(line);
      if (!m || !m[0]) continue;
      let k = kind;
      const text = m[0];
      if (kind === 'comment' && text.startsWith('/*') && (text.length < 4 || !text.endsWith('*/'))) open = true;
      if (kind === 'plain' && /^[A-Za-z_]/.test(text)) {
        if (KEYWORDS.has(text)) k = 'keyword';
        else if (/^[A-Z]/.test(text)) k = 'type';
      }
      const last = tokens[tokens.length - 1];
      if (last && last.kind === k && k === 'plain') last.text += text;
      else tokens.push({ kind: k, text });
      i += text.length;
      break;
    }
  }
  return { tokens, open };
}

/** Tokens per line (trailing newline ignored), tracking block comments across lines. */
export function highlightLines(code: string): CodeToken[][] {
  const lines = code.replace(/\n$/, '').split('\n');
  let inBlock = false;
  return lines.map((line) => {
    let head: CodeToken[] = [];
    let rest = line;
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end === -1) return line ? [{ kind: 'comment', text: line }] : [];
      head = [{ kind: 'comment', text: line.slice(0, end + 2) }];
      rest = line.slice(end + 2);
    }
    const { tokens, open } = tokenizeLine(rest);
    inBlock = open;
    return [...head, ...tokens];
  });
}
