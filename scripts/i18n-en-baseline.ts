/**
 * Dump the visible text of every English page in dist/ to one file, so a refactor that should not change English
 * output (string extraction, the i18n layer) can be proven text-identical with a plain diff.
 *
 *   pnpm build && pnpm i18n:baseline --out .scratch/en-before.txt     # before your change (e.g. on master)
 *   pnpm build && pnpm i18n:baseline --out .scratch/en-after.txt      # after
 *   diff .scratch/en-before.txt .scratch/en-after.txt                 # must be empty (or only intentional additions)
 *
 * Options: --dist <dir> (default dist), --out <file> (default .scratch/en-baseline.txt).
 *
 * "Visible text" is the text content (scripts, styles and templates removed, entities decoded, whitespace collapsed,
 * one line per block element) plus the user-facing attributes aria-label, title, placeholder, alt, label,
 * default-message and <meta name="description">. Pages under the locale prefixes (dist/tr/, …) are skipped, and so
 * are the Pagefind bundle and the island `props` JSON (data, not visible text).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { LOCALES, DEFAULT_LOCALE } from '../src/i18n/locales';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const DIST = resolve(arg('dist') ?? 'dist');
const OUT = resolve(arg('out') ?? '.scratch/en-baseline.txt');

if (!existsSync(DIST)) {
  console.error(`i18n-en-baseline: ${DIST} does not exist. Run \`pnpm build\` first.`);
  process.exit(2);
}

const skipDirs = new Set(['pagefind', '_astro', ...Object.values(LOCALES).filter((l) => l.code !== DEFAULT_LOCALE).map((l) => l.prefix)]);
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (dir === DIST && skipDirs.has(name)) continue;
      walk(p, out);
    } else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

const BLOCK =
  'a|address|article|aside|blockquote|br|dd|details|dialog|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|summary|table|tbody|td|th|thead|tr|ul|button|label|option|select|textarea|svg|title';
const TEXT_ATTRS = ['aria-label', 'title', 'placeholder', 'alt', 'label', 'default-message'];
const attrRe = new RegExp(`\\s(${TEXT_ATTRS.join('|')})\\s*=\\s*"([^"]*)"`, 'g');

export function visibleText(html: string): string[] {
  const out: string[] = [];
  const title = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1];
  if (title) out.push(`[title] ${decode(title).trim()}`);
  const desc = /<meta name="description" content="([^"]*)"/.exec(html)?.[1];
  if (desc) out.push(`[description] ${decode(desc)}`);
  const body = (/<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? html)
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  for (const m of body.matchAll(/<[a-z][^>]*>/gi)) {
    if (/^<astro-(island|slot)\b/i.test(m[0])) continue;
    for (const a of m[0].matchAll(attrRe)) if (a[2].trim()) out.push(`[${a[1]}] ${decode(a[2]).trim()}`);
  }
  const text = body
    .replace(new RegExp(`</?(?:${BLOCK})\\b[^>]*>`, 'gi'), '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((l) => decode(l).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return [...out, ...text];
}

const pages = walk(DIST);
const chunks: string[] = [];
for (const file of pages) {
  const url = '/' + relative(DIST, file).split('\\').join('/').replace(/(^|\/)index\.html$/, '$1');
  chunks.push(`=== ${url}`, ...visibleText(readFileSync(file, 'utf8')), '');
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, chunks.join('\n'));
console.log(`i18n-en-baseline: ${pages.length} English pages → ${relative(process.cwd(), OUT)}`);
