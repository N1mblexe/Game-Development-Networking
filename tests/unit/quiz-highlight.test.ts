import { describe, expect, it } from 'vitest';
import { highlightLines, type CodeToken } from '../../src/lib/quiz/highlight';

const kinds = (line: CodeToken[]) => line.filter((t) => t.kind !== 'plain').map((t) => [t.kind, t.text]);

describe('highlightLines', () => {
  it('tokenizes C# without losing text', () => {
    const code = '[Rpc(SendTo.Server)]\nvoid Fire(int n) { var s = "hi"; } // done\n';
    const lines = highlightLines(code);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.map((t) => t.text).join(''))).toEqual(code.replace(/\n$/, '').split('\n'));
    expect(kinds(lines[0])).toContainEqual(['attr', '[Rpc']);
    expect(kinds(lines[1])).toEqual(
      expect.arrayContaining([
        ['keyword', 'void'],
        ['type', 'Fire'],
        ['keyword', 'int'],
        ['string', '"hi"'],
        ['comment', '// done'],
      ]),
    );
  });

  it('carries block comments across lines', () => {
    const lines = highlightLines('a /* start\nmiddle\nend */ b');
    expect(lines[0].at(-1)).toEqual({ kind: 'comment', text: '/* start' });
    expect(lines[1]).toEqual([{ kind: 'comment', text: 'middle' }]);
    expect(lines[2][0]).toEqual({ kind: 'comment', text: 'end */' });
    expect(lines[2].slice(1).map((t) => t.kind)).not.toContain('comment');
  });

  it('keeps a closed inline block comment on one line', () => {
    const lines = highlightLines('x(); /* note */ y();\nz();');
    expect(kinds(lines[0])).toContainEqual(['comment', '/* note */']);
    expect(kinds(lines[1])).not.toContainEqual(expect.arrayContaining(['comment']));
  });
});
