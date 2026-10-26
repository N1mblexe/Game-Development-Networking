/**
 * Translation coverage: what is translated, stale (English changed since) or unstamped, per module and content type,
 * plus a UI section for the registries, the sim/diagram namespaces and component files that still hold literal text.
 *
 *   pnpm i18n:status                    every translated locale, every module, UI section
 *   pnpm i18n:status --module theory    one module (content only)
 *   pnpm i18n:status --locale tr        one locale
 *   pnpm i18n:status --files            also list every component file with literal text (default: the top 15)
 *
 * Read-only and informational: it never fails. `pnpm validate:content` reports errors in translations.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { sims } from '../src/components/sim/registry';
import { diagrams } from '../src/components/diagrams/registry';
import { TRANSLATED_LOCALES, isLocale, type Locale } from '../src/i18n/locales';
import { CONTENT, OVERLAY_TYPES, englishItems, englishLessons, filesIn, itemHash, lessonHash, moduleOf, overlayItems, readYamlFile, splitFrontmatter, type OverlayType } from './i18n-shared';

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const onlyModule = opt('module');
const localeArg = opt('locale');
if (localeArg && !isLocale(localeArg)) {
  console.error(`i18n-status: unknown locale "${localeArg}"`);
  process.exit(2);
}
const locales = localeArg ? [localeArg as Locale] : TRANSLATED_LOCALES;
const SRC = new URL('../src/', import.meta.url).pathname;

interface Count {
  done: number;
  total: number;
  stale: number;
  unstamped: number;
}
const count = (): Count => ({ done: 0, total: 0, stale: 0, unstamped: 0 });
const cell = (c: Count) =>
  c.total === 0 ? '–' : `${c.done}/${c.total}${c.stale ? ` ${c.stale} stale` : ''}${c.unstamped ? ` ${c.unstamped} unstamped` : ''}`;
function table(head: string[], rows: string[][]) {
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (r: string[]) => r.map((c, i) => c.padEnd(w[i]!)).join('  ').trimEnd();
  console.log(line(head));
  console.log(w.map((n) => '─'.repeat(n)).join('  '));
  for (const r of rows) console.log(line(r));
}

const COLUMNS = ['lessons', 'quizzes', 'exams', 'flashcards', 'glossary', 'modules'] as const;
type Column = (typeof COLUMNS)[number];
const HEADINGS: Record<Column, string> = {
  lessons: 'lessons',
  quizzes: 'quiz questions',
  exams: 'exam (title + questions)',
  flashcards: 'flashcards',
  glossary: 'glossary terms',
  modules: 'module text',
};

const englishLessonFiles = englishLessons();
const modules = [...new Set(filesIn('modules', '.yaml').map((f) => f.replace(/\.yaml$/, '')))].filter((m) => !onlyModule || m === onlyModule);
if (onlyModule && !modules.length) {
  console.error(`i18n-status: unknown module "${onlyModule}"`);
  process.exit(2);
}

for (const locale of locales) {
  const stats = new Map(modules.map((m) => [m, Object.fromEntries(COLUMNS.map((c) => [c, count()])) as Record<Column, Count>]));

  // lessons
  for (const [key, file] of englishLessonFiles) {
    const s = stats.get(key.split('/')[0]!)?.lessons;
    if (!s) continue;
    s.total++;
    const tr = join(CONTENT, locale, 'lessons', file);
    if (!existsSync(tr)) continue;
    s.done++;
    const fm = splitFrontmatter(readFileSync(tr, 'utf8'));
    const src = fm ? (parseYaml(fm.fm) as { sourceHash?: string } | null)?.sourceHash : undefined;
    if (src === undefined) s.unstamped++;
    else if (src !== lessonHash(file)) s.stale++;
  }

  // overlays: every English item counts towards the total, a translated one towards done
  for (const type of OVERLAY_TYPES) {
    for (const f of filesIn(type, '.yaml')) {
      const s = stats.get(moduleOf(type, f))?.[type as OverlayType & Column];
      if (!s) continue;
      const en = englishItems(type, readYamlFile(`${type}/${f}`));
      // A glossary/flashcard/quiz file has no translatable top level; an exam's is its title, a module's its text.
      if (type !== 'exams' && type !== 'modules') en.delete('');
      s.total += en.size;
      const trFile = `${locale}/${type}/${f}`;
      if (!existsSync(join(CONTENT, trFile))) continue;
      for (const [id, item] of overlayItems(type, readYamlFile(trFile))) {
        const e = en.get(id);
        if (!e) continue;
        s.done++;
        if (item._src === undefined) s.unstamped++;
        else if (item._src !== itemHash(e.kind, e.item)) s.stale++;
      }
    }
  }

  const total = Object.fromEntries(COLUMNS.map((c) => [c, count()])) as Record<Column, Count>;
  for (const st of stats.values())
    for (const c of COLUMNS) for (const k of ['done', 'total', 'stale', 'unstamped'] as const) total[c][k] += st[c][k];

  console.log(`\n${locale}: content${onlyModule ? ` (module ${onlyModule})` : ''}\n`);
  table(
    ['module', ...COLUMNS.map((c) => HEADINGS[c])],
    [...[...stats].map(([m, st]) => [m, ...COLUMNS.map((c) => cell(st[c]))]), ...(modules.length > 1 ? [['total', ...COLUMNS.map((c) => cell(total[c]))]] : [])],
  );
  console.log('\nUntranslated items are shown in English. Stale: the English text changed after the translation was stamped.');

  if (onlyModule) continue;

  // ------------------------------------------------------------------ UI
  console.log(`\n${locale}: UI\n`);
  console.log('core dictionaries (src/i18n/<locale>/*.ts): complete by type (pnpm check fails on a missing key)');

  const regSims = (await import(join(SRC, `i18n/${locale}/registry-sims.ts`))).default as Record<
    string,
    { title?: string; presets?: Record<string, { label?: string }> }
  >;
  const regDiagrams = (await import(join(SRC, `i18n/${locale}/registry-diagrams.ts`))).default as Record<
    string,
    { title?: string; variants?: Record<string, string> }
  >;
  const simNames = Object.keys(sims);
  const presetTotal = Object.values(sims).reduce((n, s) => n + Object.keys((s as { presets?: object }).presets ?? {}).length, 0);
  const presetDone = Object.values(regSims).reduce((n, s) => n + Object.values(s.presets ?? {}).filter((p) => p.label).length, 0);
  const diagramNames = Object.keys(diagrams);
  const variantTotal = Object.values(diagrams).reduce((n, d) => n + ((d as { variants?: readonly string[] }).variants?.length ?? 0), 0);
  const variantDone = Object.values(regDiagrams).reduce((n, d) => n + Object.values(d.variants ?? {}).filter(Boolean).length, 0);
  const namespaces = (kind: 'sims' | 'diagrams', loc: string) => {
    const dir = join(SRC, 'i18n', loc, kind);
    return new Set(existsSync(dir) ? readdirSync(dir).map((f) => f.replace(/\.tsx?$/, '')) : []);
  };
  const simsEn = namespaces('sims', 'en');
  const simsTr = namespaces('sims', locale);
  const diagramsEn = namespaces('diagrams', 'en');
  const diagramsTr = namespaces('diagrams', locale);
  table(
    ['registry / namespace', 'translated', 'missing'],
    [
      ['sim titles (registry-sims.ts)', `${Object.values(regSims).filter((s) => s.title).length}/${simNames.length}`, simNames.filter((n) => !regSims[n]?.title).join(', ')],
      ['sim preset labels', `${presetDone}/${presetTotal}`, ''],
      ['diagram titles (registry-diagrams.ts)', `${Object.values(regDiagrams).filter((d) => d.title).length}/${diagramNames.length}`, diagramNames.filter((n) => !regDiagrams[n]?.title).join(', ')],
      ['diagram variant labels', `${variantDone}/${variantTotal}`, ''],
      ['sims with text in i18n/en/sims/', `${simsEn.size}/${simNames.length}`, simNames.filter((n) => !simsEn.has(n)).join(', ')],
      [`  … and in i18n/${locale}/sims/`, `${[...simsEn].filter((n) => simsTr.has(n)).length}/${simsEn.size}`, [...simsEn].filter((n) => !simsTr.has(n)).join(', ')],
      ['diagrams with text in i18n/en/diagrams/', `${diagramsEn.size}/${diagramNames.length}`, diagramNames.filter((n) => !diagramsEn.has(n)).join(', ')],
      [`  … and in i18n/${locale}/diagrams/`, `${[...diagramsEn].filter((n) => diagramsTr.has(n)).length}/${diagramsEn.size}`, [...diagramsEn].filter((n) => !diagramsTr.has(n)).join(', ')],
    ],
  );
}

// ------------------------------------------------------------------ literal text left in components (locale-independent)
if (!onlyModule) {
  const literals = literalText();
  const listed = args.includes('--files') ? literals : literals.slice(0, 15);
  const sum = literals.reduce((n, [, c]) => n + c, 0);
  console.log(`\nComponent files that still contain literal UI text (heuristic: JSX text, aria-label/placeholder/title/label/alt="…"):`);
  console.log(`${literals.length} file(s), ${sum} literal(s)${listed.length < literals.length ? `; top ${listed.length}, --files for all` : ''}\n`);
  for (const [f, c] of listed) console.log(`${String(c).padStart(5)}  ${f}`);
}

function literalText(): [string, number][] {
  const out: [string, number][] = [];
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  for (const dir of ['components', 'pages', 'layouts'])
    for (const file of walk(join(SRC, dir)).filter((f) => /\.(tsx|astro)$/.test(f))) {
      let text = readFileSync(file, 'utf8');
      if (file.endsWith('.astro')) text = text.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '');
      text = text
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/=>/g, '');
      const jsxText = text.match(/>[^<>{}`]*\p{L}{2,}[^<>{}`]*</gu)?.filter((m) => !/[;=]/.test(m) && !/^>\s*[\w.]+\s*[&|?:)]/.test(m)) ?? [];
      const attrs = text.match(/\b(aria-label|placeholder|title|label|alt)="[^"]*\p{L}[^"]*"/gu) ?? [];
      const n = jsxText.length + attrs.length;
      if (n) out.push([relative(process.cwd(), file), n]);
    }
  return out.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

