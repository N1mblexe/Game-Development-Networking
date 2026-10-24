/**
 * Cross-reference checks that Astro's per-file schema validation can't do.
 *
 *   pnpm validate:content            errors fail, warnings are printed
 *   pnpm validate:content --strict   warnings fail too (use before release)
 *
 * Errors: broken references, unknown components/sims/diagrams/presets/terms, schema violations,
 *         missing quizzes, duplicate ids.
 * Warnings: references to lessons that don't exist *yet*, thin content (few cards, no sources).
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { z } from 'astro/zod';
import {
  examSchema,
  flashcardFileSchema,
  glossaryFileSchema,
  lessonIdFromPath,
  lessonSchema,
  moduleSchema,
  quizSchema,
} from '../src/lib/content/schemas';
import { sims } from '../src/components/sim/registry';
import { diagrams } from '../src/components/diagrams/registry';

const ROOT = new URL('../src/content/', import.meta.url).pathname;
const MDX_COMPONENTS = ['Callout', 'CodeTabs', 'Diagram', 'KeyTakeaways', 'Sequence', 'Sim', 'Steps', 'Term'];
const MIN_CARDS_PER_LESSON = 8;
const strict = process.argv.includes('--strict');

const errors: string[] = [];
const warnings: string[] = [];
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
for (const l of lessons.values()) {
  const body = l.body.replace(/^(```|~~~)[\s\S]*?^\1/gm, ''); // ignore fenced code
  for (const m of body.matchAll(/<([A-Z][A-Za-z0-9]*)\b[^>]*>/g)) {
    const [tag, name] = m;
    if (!MDX_COMPONENTS.includes(name)) {
      err(l.file, `unknown component <${name}> (available: ${MDX_COMPONENTS.join(', ')})`);
      continue;
    }
    if (name === 'Term') {
      const id = attr(tag, 'id');
      if (!id) err(l.file, '<Term> without id');
      else if (!terms.has(id)) err(l.file, `<Term id="${id}"> is not in any glossary file`);
    }
    if (name === 'Sim') {
      const sim = attr(tag, 'name');
      const preset = attr(tag, 'preset');
      const def = sim ? (sims as Record<string, { presets: Record<string, unknown> }>)[sim] : undefined;
      if (!def) err(l.file, `<Sim name="${sim}"> is not registered in sim/registry.ts`);
      else if (preset && !(preset in def.presets))
        err(l.file, `<Sim name="${sim}" preset="${preset}">: unknown preset (have: ${Object.keys(def.presets).join(', ')})`);
    }
    if (name === 'Diagram') {
      const d = attr(tag, 'name');
      const variant = attr(tag, 'variant');
      const def = d ? (diagrams as Record<string, { variants?: string[] }>)[d] : undefined;
      if (!def) err(l.file, `<Diagram name="${d}"> is not registered in diagrams/registry.ts`);
      else if (variant && !def.variants?.includes(variant))
        err(l.file, `<Diagram name="${d}" variant="${variant}">: unknown variant (have: ${def.variants?.join(', ') ?? 'none'})`);
    }
  }
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

// ------------------------------------------------------------------------------------ report
const summary = `${modules.size} modules, ${lessons.size} lessons, ${quizKeys.size} quizzes, ${examModules.size} exams, ${terms.size} terms`;
for (const w of warnings) console.warn(`⚠ ${w}`);
for (const e of errors) console.error(`✗ ${e}`);
console.log(`\n${summary}\n${errors.length} error(s), ${warnings.length} warning(s)${strict ? ' [strict]' : ''}`);
if (errors.length || (strict && warnings.length)) process.exit(1);
