/**
 * Cross-reference checks that Astro's per-file schema validation can't do.
 *
 *   pnpm validate:content                 errors fail, warnings are printed
 *   pnpm validate:content --strict        warnings fail too (use before release)
 *   pnpm validate:content --strict-i18n   i18n warnings fail too (translators: before handing over a module)
 *
 * Errors: broken references, unknown components/sims/diagrams/presets/terms, schema violations,
 *         missing quizzes, duplicate ids; in translations (src/content/<locale>/…): no English counterpart,
 *         unknown ids, forbidden (structural) fields, option/item counts that differ from English, unknown
 *         registry keys in i18n/<locale>/registry-*.ts and sims/ or diagrams/ namespaces.
 * Warnings: references to lessons that don't exist *yet*, thin content (few cards, no sources).
 * i18n warnings (separate, never fail --strict): stale or unstamped translations, <Sim>/<Diagram> usage that differs
 *         from English, terminology "avoid" forms. Missing translations are only counted (English is the fallback).
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { z } from 'astro/zod';
import {
  examOverlaySchema,
  examSchema,
  flashcardFileSchema,
  flashcardOverlaySchema,
  glossaryFileSchema,
  glossaryOverlaySchema,
  lessonIdFromPath,
  lessonSchema,
  lessonTranslationSchema,
  moduleOverlaySchema,
  moduleSchema,
  quizOverlaySchema,
  quizSchema,
} from '../src/lib/content/schemas';
import { sims } from '../src/components/sim/registry';
import { diagrams } from '../src/components/diagrams/registry';
import { LOCALES, TRANSLATED_LOCALES, type Locale } from '../src/i18n/locales';
import { OVERLAY_TYPES, englishItems, englishLessons, itemHash, lessonHash, overlayItems, splitFrontmatter } from './i18n-shared';

const ROOT = new URL('../src/content/', import.meta.url).pathname;
const MDX_COMPONENTS = ['Callout', 'CodeTabs', 'Diagram', 'KeyTakeaways', 'Sequence', 'Sim', 'Steps', 'Term'];
const MIN_CARDS_PER_LESSON = 8;
const strict = process.argv.includes('--strict');
const strictI18n = process.argv.includes('--strict-i18n');

const errors: string[] = [];
const warnings: string[] = [];
const i18nWarnings: string[] = [];
const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`);
const warn = (where: string, msg: string) => warnings.push(`${where}: ${msg}`);

const files = (dir: string, ext: string) =>
  existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith(ext)) : [];

function check<S extends z.ZodType>(schema: S, data: unknown, where: string): z.infer<S> | undefined {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  for (const issue of r.error.issues) err(where, `${issue.path.join('.') || '(root)'}: ${issue.message}`);
  return undefined;
}

function readYaml(rel: string): unknown {
  try {
    return parseYaml(readFileSync(join(ROOT, rel), 'utf8'));
  } catch (e) {
    err(rel, `invalid YAML: ${(e as Error).message}`);
    return undefined;
  }
}

// ------------------------------------------------------------------------------------ modules
const modules = new Map<string, z.infer<typeof moduleSchema>>();
for (const f of files('modules', '.yaml')) {
  const data = check(moduleSchema, readYaml(`modules/${f}`), `modules/${f}`);
  if (data) modules.set(basename(f, '.yaml'), data);
}
for (const [id, m] of modules)
  for (const p of m.prerequisites) if (!modules.has(p)) err(`modules/${id}.yaml`, `unknown prerequisite module "${p}"`);

// ------------------------------------------------------------------------------------ lessons
interface Lesson {
  key: string;
  file: string;
  data: z.infer<typeof lessonSchema>;
  body: string;
}
const lessons = new Map<string, Lesson>();
for (const f of files('lessons', '.mdx')) {
  const where = `lessons/${f}`;
  const parts = f.split('/');
  if (parts.length !== 2) {
    err(where, 'lessons must live at lessons/<module>/NN-<slug>.mdx');
    continue;
  }
  if (!modules.has(parts[0])) err(where, `folder "${parts[0]}" is not a module id`);
  if (!/^\d{2}-[a-z0-9]+(-[a-z0-9]+)*\.mdx$/.test(parts[1])) err(where, 'file name must be NN-kebab-slug.mdx');
  const text = readFileSync(join(ROOT, 'lessons', f), 'utf8');
  const fm = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!fm) {
    err(where, 'missing frontmatter');
    continue;
  }
  let raw: unknown;
  try {
    raw = parseYaml(fm[1]);
  } catch (e) {
    err(where, `invalid frontmatter YAML: ${(e as Error).message}`);
    continue;
  }
  const data = check(lessonSchema, raw, where);
  if (!data) continue;
  const key = lessonIdFromPath(f);
  if (key.endsWith('/exam')) err(where, '"exam" is a reserved slug');
  if (lessons.has(key)) err(where, `duplicate lesson key ${key}`);
  lessons.set(key, { key, file: where, data, body: fm[2] });
}

const byModule = new Map<string, Lesson[]>();
for (const l of lessons.values()) {
  const m = l.key.split('/')[0];
  byModule.set(m, [...(byModule.get(m) ?? []), l]);
}
for (const [m, ls] of byModule) {
  const orders = new Map<number, string>();
  for (const l of ls) {
    if (orders.has(l.data.order)) err(l.file, `order ${l.data.order} also used by ${orders.get(l.data.order)}`);
    orders.set(l.data.order, l.file);
  }
  if (m !== 'theory')
    for (const l of ls) {
      if (l.data.sources.length === 0) warn(l.file, 'engine/SDK lesson without `sources` (accuracy rule)');
      if (!l.data.targets) warn(l.file, 'engine/SDK lesson without `targets` versions');
    }
}
for (const l of lessons.values())
  for (const p of l.data.prerequisites) if (!lessons.has(p)) warn(l.file, `prerequisite lesson "${p}" does not exist (yet)`);

// ------------------------------------------------------------------------------------ glossary
const terms = new Map<string, { file: string; seeAlso: string[]; lesson?: string }>();
for (const f of files('glossary', '.yaml')) {
  const where = `glossary/${f}`;
  if (!modules.has(basename(f, '.yaml'))) err(where, 'file name must be a module id');
  const data = check(glossaryFileSchema, readYaml(`glossary/${f}`), where);
  for (const t of data?.terms ?? []) {
    if (terms.has(t.id)) err(where, `term id "${t.id}" already defined in ${terms.get(t.id)!.file}`);
    terms.set(t.id, { file: where, seeAlso: t.seeAlso, lesson: t.lesson });
  }
}
for (const [id, t] of terms) {
  for (const s of t.seeAlso) if (!terms.has(s)) err(t.file, `term "${id}" seeAlso unknown term "${s}"`);
  if (t.lesson && !lessons.has(t.lesson)) warn(t.file, `term "${id}" points to lesson "${t.lesson}" that does not exist (yet)`);
}

// ------------------------------------------------------------------------------------ MDX usage
const attr = (tag: string, name: string) => new RegExp(`\\b${name}=["']([^"']+)["']`).exec(tag)?.[1];
/** Lesson body without fenced and inline code. */
const proseOf = (body: string) =>
  body
    .replace(/^(```|~~~)[\s\S]*?^\1/gm, '') // ignore fenced code
    .replace(/`[^`\n]*`/g, ''); // ignore inline code
/**
 * Check every component tag in a lesson body; returns the ordered <Sim>/<Diagram> usages ("Sim tick-rate/compare"),
 * which a translation must repeat in the same order.
 */
function checkComponents(file: string, body: string): string[] {
  const interactives: string[] = [];
  for (const m of body.matchAll(/<([A-Z][A-Za-z0-9]*)\b[^>]*>/g)) {
    const [tag, name] = m;
    if (!MDX_COMPONENTS.includes(name)) {
      err(file, `unknown component <${name}> (available: ${MDX_COMPONENTS.join(', ')})`);
      continue;
    }
    if (name === 'Term') {
      const id = attr(tag, 'id');
      if (!id) err(file, '<Term> without id');
      else if (!terms.has(id)) err(file, `<Term id="${id}"> is not in any glossary file`);
    }
    if (name === 'Sim') {
      const sim = attr(tag, 'name');
      const preset = attr(tag, 'preset');
      interactives.push(`Sim ${sim}/${preset ?? ''}`);
      const def = sim ? (sims as Record<string, { presets: Record<string, unknown> }>)[sim] : undefined;
      if (!def) err(file, `<Sim name="${sim}"> is not registered in sim/registry.ts`);
      else if (preset && !(preset in def.presets))
        err(file, `<Sim name="${sim}" preset="${preset}">: unknown preset (have: ${Object.keys(def.presets).join(', ')})`);
    }
    if (name === 'Diagram') {
      const d = attr(tag, 'name');
      const variant = attr(tag, 'variant');
      interactives.push(`Diagram ${d}/${variant ?? ''}`);
      const def = d ? (diagrams as Record<string, { variants?: string[] }>)[d] : undefined;
      if (!def) err(file, `<Diagram name="${d}"> is not registered in diagrams/registry.ts`);
      else if (variant && !def.variants?.includes(variant))
        err(file, `<Diagram name="${d}" variant="${variant}">: unknown variant (have: ${def.variants?.join(', ') ?? 'none'})`);
    }
  }
  return interactives;
}
const interactivesByLesson = new Map<string, string[]>();
for (const l of lessons.values()) {
  const body = proseOf(l.body);
  interactivesByLesson.set(l.key, checkComponents(l.file, body));
  if (!/<KeyTakeaways>/.test(body)) warn(l.file, 'no <KeyTakeaways> section (lesson template)');
}

// ------------------------------------------------------------------------------------ quizzes
const quizKeys = new Set<string>();
for (const f of files('quizzes', '.yaml')) {
  const where = `quizzes/${f}`;
  const key = f.replace(/\.yaml$/, '');
  quizKeys.add(key);
  if (!lessons.has(key)) err(where, `no lesson with key "${key}" (file must be quizzes/<module>/<lesson-slug>.yaml)`);
  check(quizSchema, readYaml(where), where);
}
for (const l of lessons.values()) if (!l.data.draft && !quizKeys.has(l.key)) err(l.file, `missing quiz quizzes/${l.key}.yaml`);

// ------------------------------------------------------------------------------------ exams
const examModules = new Set<string>();
for (const f of files('exams', '.yaml')) {
  const where = `exams/${f}`;
  const m = basename(f, '.yaml');
  examModules.add(m);
  if (!modules.has(m)) err(where, 'file name must be a module id');
  check(examSchema, readYaml(where), where);
}
for (const m of modules.keys()) if (!examModules.has(m)) warn(`modules/${m}.yaml`, `no exam yet (exams/${m}.yaml)`);

// ------------------------------------------------------------------------------------ flashcards
const cardCount = new Map<string, number>();
for (const f of files('flashcards', '.yaml')) {
  const where = `flashcards/${f}`;
  if (!modules.has(basename(f, '.yaml'))) err(where, 'file name must be a module id');
  const data = check(flashcardFileSchema, readYaml(where), where);
  for (const c of data?.cards ?? []) {
    if (!c.lesson) continue;
    if (!lessons.has(c.lesson)) err(where, `card "${c.id}" references unknown lesson "${c.lesson}"`);
    cardCount.set(c.lesson, (cardCount.get(c.lesson) ?? 0) + 1);
  }
}
for (const l of lessons.values()) {
  const n = cardCount.get(l.key) ?? 0;
  if (n < MIN_CARDS_PER_LESSON) warn(l.file, `${n} flashcards (target ≥ ${MIN_CARDS_PER_LESSON})`);
}

// ------------------------------------------------------------------------------------ registries
for (const [name, def] of Object.entries(sims))
  for (const k of def.lessons) if (!lessons.has(k)) warn('sim/registry.ts', `"${name}" lists lesson "${k}" that does not exist (yet)`);
for (const [name, def] of Object.entries(diagrams))
  for (const k of def.lessons) if (!lessons.has(k)) warn('diagrams/registry.ts', `"${name}" lists lesson "${k}" that does not exist (yet)`);

// ------------------------------------------------------------------------------------ translations
// Structural problems in a translation (no English counterpart, unknown ids, forbidden fields, wrong option counts)
// are errors. Stale translations, interactive-order mismatches and terminology hits are i18n warnings: printed, but
// they only fail with --strict-i18n. Missing translations are never warnings (English is the fallback); they are
// counted in the summary, and `pnpm i18n:status` lists them.
const coverage: string[] = [];
const i18nWarn = (where: string, msg: string) => i18nWarnings.push(`${where}: ${msg}`);

/** Terminology "avoid" forms, as whole-word, case-insensitive (Turkish-aware) patterns. */
function avoidPatterns(locale: Locale): { re: RegExp; form: string; use: string }[] {
  const file = join(ROOT, `../i18n/terminology.${locale}.yaml`);
  if (!existsSync(file)) return [];
  const doc = parseYaml(readFileSync(file, 'utf8')) as { terms?: { en: string; tr: string; avoid?: string[] }[] };
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (doc.terms ?? []).flatMap((t) =>
    (t.avoid ?? []).map((form) => ({ re: new RegExp(`(?<!\\p{L})${esc(form.toLocaleLowerCase(LOCALES[locale].intl))}(?!\\p{L})`, 'u'), form, use: t.tr })),
  );
}
function checkTerminology(locale: Locale, where: string, text: string, avoid: ReturnType<typeof avoidPatterns>) {
  const lower = text.toLocaleLowerCase(LOCALES[locale].intl);
  for (const a of avoid) if (a.re.test(lower)) i18nWarn(where, `terminology: avoid "${a.form}", use "${a.use}" (src/i18n/terminology.${locale}.yaml)`);
}
/** All string leaves of a value (for terminology checks on overlays). */
const strings = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];

const englishLessonFiles = englishLessons();
for (const locale of TRANSLATED_LOCALES) {
  const avoid = avoidPatterns(locale);
  const tl = (rel: string) => `${locale}/${rel}`;

  // lessons
  const translatedLessons = new Set<string>();
  for (const f of files(`${locale}/lessons`, '.mdx')) {
    const where = tl(`lessons/${f}`);
    const key = lessonIdFromPath(f);
    const en = lessons.get(key);
    if (!en || !englishLessonFiles.has(key)) {
      err(where, `no English lesson with key "${key}" (translations mirror lessons/<module>/NN-<slug>.mdx)`);
      continue;
    }
    if (`lessons/${f}` !== en.file) err(where, `file name differs from the English ${en.file}; use the same name`);
    const parts = splitFrontmatter(readFileSync(join(ROOT, locale, 'lessons', f), 'utf8'));
    if (!parts) {
      err(where, 'missing frontmatter');
      continue;
    }
    let raw: unknown;
    try {
      raw = parseYaml(parts.fm);
    } catch (e) {
      err(where, `invalid frontmatter YAML: ${(e as Error).message}`);
      continue;
    }
    const data = check(lessonTranslationSchema, raw, where);
    if (!data) continue;
    translatedLessons.add(key);
    if (data.objectives.length !== en.data.objectives.length)
      i18nWarn(where, `${data.objectives.length} objectives, English has ${en.data.objectives.length}`);
    const body = proseOf(parts.body);
    const usage = checkComponents(where, body);
    const enUsage = interactivesByLesson.get(key) ?? [];
    if (usage.join('|') !== enUsage.join('|'))
      i18nWarn(where, `<Sim>/<Diagram> usage differs from English (same names, presets and variants in the same order): [${usage.join(', ')}] vs [${enUsage.join(', ')}]`);
    if (!/<KeyTakeaways>/.test(body)) i18nWarn(where, 'no <KeyTakeaways> section');
    if (!data.sourceHash) i18nWarn(where, 'not stamped yet: run pnpm i18n:stamp after translating');
    else if (data.sourceHash !== lessonHash(englishLessonFiles.get(key)!)) i18nWarn(where, 'stale: the English lesson changed after this translation');
    checkTerminology(locale, where, [data.title, data.summary, ...data.objectives, body].join('\n'), avoid);
  }

  // overlays
  const overlaySchemas = {
    modules: moduleOverlaySchema,
    quizzes: quizOverlaySchema,
    exams: examOverlaySchema,
    flashcards: flashcardOverlaySchema,
    glossary: glossaryOverlaySchema,
  } as const;
  for (const type of OVERLAY_TYPES) {
    for (const f of files(`${locale}/${type}`, '.yaml')) {
      const where = tl(`${type}/${f}`);
      if (!existsSync(join(ROOT, type, f))) {
        err(where, `no English ${type}/${f}`);
        continue;
      }
      const raw = readYaml(`${locale}/${type}/${f}`);
      if (!check(overlaySchemas[type] as z.ZodType, raw, where)) continue;
      const enItems = englishItems(type, readYaml(`${type}/${f}`));
      for (const [id, item] of overlayItems(type, raw)) {
        const label = id ? `"${id}"` : 'top level';
        const en = enItems.get(id);
        if (!en) {
          err(where, `${label}: no such id in ${type}/${f}`);
          continue;
        }
        const e = en.item;
        if (en.kind === 'question') {
          for (const field of ['options', 'items'] as const) {
            const tr = item[field] as unknown[] | undefined;
            const n = (e[field] as unknown[] | undefined)?.length;
            if (tr && tr.length !== n) err(where, `${label}: ${field} has ${tr.length} entries, English has ${n ?? 'none'}`);
          }
          if (item.answers && e.type !== 'fill') err(where, `${label}: answers are only translatable on fill questions (this is "${e.type}")`);
          if (item.placeholder !== undefined && e.type !== 'fill') err(where, `${label}: placeholder only exists on fill questions`);
          if (item.unit !== undefined && e.type !== 'numeric') err(where, `${label}: unit only exists on numeric questions`);
        }
        if (item._src === undefined) i18nWarn(where, `${label}: not stamped yet: run pnpm i18n:stamp after translating`);
        else if (item._src !== itemHash(en.kind, e)) i18nWarn(where, `${label}: stale: the English text changed after this translation`);
        checkTerminology(locale, `${where} ${label}`, strings(item).join('\n'), avoid);
      }
    }
  }

  // registry text and lazy sim/diagram namespaces
  for (const [kind, registry] of [
    ['sims', sims],
    ['diagrams', diagrams],
  ] as const) {
    const file = join(ROOT, `../i18n/${locale}/registry-${kind}.ts`);
    if (existsSync(file)) {
      const text = (await import(file)).default as Record<string, { presets?: Record<string, unknown>; variants?: Record<string, string> }>;
      for (const [name, t] of Object.entries(text)) {
        const def = (registry as Record<string, { presets?: Record<string, unknown>; variants?: string[] }>)[name];
        if (!def) {
          err(`i18n/${locale}/registry-${kind}.ts`, `"${name}" is not in ${kind}/registry.ts`);
          continue;
        }
        for (const p of Object.keys(t.presets ?? {})) if (!def.presets || !(p in def.presets)) err(`i18n/${locale}/registry-${kind}.ts`, `"${name}": unknown preset "${p}"`);
        for (const v of Object.keys(t.variants ?? {})) if (!def.variants?.includes(v)) err(`i18n/${locale}/registry-${kind}.ts`, `"${name}": unknown variant "${v}"`);
      }
    }
    const dir = join(ROOT, `../i18n/${locale}/${kind}`);
    for (const f of existsSync(dir) ? readdirSync(dir) : []) {
      const name = f.replace(/\.tsx?$/, '');
      if (!(name in registry)) err(`i18n/${locale}/${kind}/${f}`, `"${name}" is not in ${kind === 'sims' ? 'sim' : 'diagrams'}/registry.ts`);
      if (!['.ts', '.tsx'].some((ext) => existsSync(join(ROOT, `../i18n/en/${kind}/${name}${ext}`))))
        err(`i18n/${locale}/${kind}/${f}`, `no English i18n/en/${kind}/${name}.ts[x] to translate from`);
    }
  }

  coverage.push(`${locale}: ${translatedLessons.size}/${lessons.size} lessons translated (pnpm i18n:status for details)`);
}

// ------------------------------------------------------------------------------------ report
const summary = `${modules.size} modules, ${lessons.size} lessons, ${quizKeys.size} quizzes, ${examModules.size} exams, ${terms.size} terms`;
for (const w of warnings) console.warn(`⚠ ${w}`);
for (const w of i18nWarnings) console.warn(`⚠ [i18n] ${w}`);
for (const e of errors) console.error(`✗ ${e}`);
console.log(`\n${summary}\n${coverage.join('\n')}`);
console.log(
  `${errors.length} error(s), ${warnings.length} warning(s), ${i18nWarnings.length} i18n warning(s)` +
    `${strict ? ' [strict]' : ''}${strictI18n ? ' [strict-i18n]' : ''}`,
);
if (errors.length || (strict && warnings.length) || (strictI18n && i18nWarnings.length)) process.exit(1);
