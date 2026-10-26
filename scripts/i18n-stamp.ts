/**
 * Record which English source a translation was made from, so later English edits show up as "stale".
 *
 *   pnpm i18n:stamp --module theory            # stamp every Turkish file of one module
 *   pnpm i18n:stamp src/content/tr/quizzes/theory/rpcs.yaml ...   # or specific files
 *   pnpm i18n:stamp --all                      # everything (careful: marks stale translations as fresh)
 *   options: --locale tr (default: every translated locale), --missing (only items without a hash yet), --dry
 *
 * Writes `sourceHash:` into a translated lesson's frontmatter (hash of the English .mdx file) and `_src:` onto every
 * translated overlay item (hash of the English item's text fields, see TRANSLATION_SOURCE_FIELDS). Run it right after
 * you translate or update a translation against the current English, and only for what you actually checked.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseDocument } from 'yaml';
import { TRANSLATED_LOCALES, isLocale, type Locale } from '../src/i18n/locales';
import { lessonIdFromPath } from '../src/lib/content/schemas';
import { CONTENT, OVERLAY_TYPES, OVERLAYS, englishItems, englishLessons, filesIn, itemHash, lessonHash, moduleOf, readYamlFile, type OverlayType } from './i18n-shared';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const onlyModule = opt('module');
const localeArg = opt('locale');
const paths = args.filter((a, i) => !a.startsWith('--') && !['--module', '--locale'].includes(args[i - 1] ?? '')).map((p) => resolve(p));
if (!onlyModule && !paths.length && !flag('all')) {
  console.error('i18n-stamp: pass --module <id>, file paths, or --all (see the header of scripts/i18n-stamp.ts).');
  process.exit(2);
}
if (localeArg && !isLocale(localeArg)) {
  console.error(`i18n-stamp: unknown locale "${localeArg}"`);
  process.exit(2);
}
const locales = localeArg ? [localeArg as Locale] : TRANSLATED_LOCALES;
const missingOnly = flag('missing');
const dry = flag('dry');

const selected = (abs: string, module: string) => (!onlyModule || module === onlyModule) && (!paths.length || paths.includes(abs));
let changed = 0;
let stamped = 0;

function write(abs: string, before: string, after: string) {
  if (after === before) return;
  changed++;
  if (!dry) writeFileSync(abs, after);
  console.log(`${dry ? 'would stamp' : 'stamped'} ${relative(process.cwd(), abs)}`);
}

const english = englishLessons();
for (const locale of locales) {
  // ------------------------------------------------------------------ lessons
  for (const f of filesIn(`${locale}/lessons`, '.mdx')) {
    const abs = join(CONTENT, locale, 'lessons', f);
    const key = lessonIdFromPath(f);
    if (!selected(abs, key.split('/')[0]!)) continue;
    const en = english.get(key);
    if (!en) {
      console.warn(`skip ${f}: no English lesson ${key}`);
      continue;
    }
    const text = readFileSync(abs, 'utf8');
    const hash = lessonHash(en);
    const has = /^sourceHash:.*$/m.test(text.split('\n---')[0]!);
    if (missingOnly && has) continue;
    const next = has
      ? text.replace(/^(---\n[\s\S]*?)^sourceHash:.*$/m, `$1sourceHash: ${hash}`)
      : text.replace(/^(---\n[\s\S]*?)\n---/, `$1\nsourceHash: ${hash}\n---`);
    stamped++;
    write(abs, text, next);
  }

  // ------------------------------------------------------------------ overlays
  for (const type of OVERLAY_TYPES as OverlayType[]) {
    for (const f of filesIn(`${locale}/${type}`, '.yaml')) {
      const abs = join(CONTENT, locale, type, f);
      if (!selected(abs, moduleOf(type, f))) continue;
      let enData: unknown;
      try {
        enData = readYamlFile(`${type}/${f}`);
      } catch {
        console.warn(`skip ${locale}/${type}/${f}: no English ${type}/${f}`);
        continue;
      }
      const items = englishItems(type, enData);
      const text = readFileSync(abs, 'utf8');
      const doc = parseDocument(text);
      const spec = OVERLAYS[type];
      if (spec.top && items.has('') && Object.keys((doc.toJS() ?? {}) as object).some((k) => k !== '_src' && k !== spec.list?.field)) {
        if (!(missingOnly && doc.has('_src'))) {
          doc.set('_src', itemHash(items.get('')!.kind, items.get('')!.item));
          stamped++;
        }
      }
      if (spec.list) {
        const list = (doc.toJS()?.[spec.list.field] ?? {}) as Record<string, unknown>;
        for (const id of Object.keys(list)) {
          const en = items.get(id);
          if (!en) {
            console.warn(`skip ${locale}/${type}/${f}: "${id}" is not an id in the English file`);
            continue;
          }
          if (missingOnly && doc.hasIn([spec.list.field, id, '_src'])) continue;
          doc.setIn([spec.list.field, id, '_src'], itemHash(en.kind, en.item));
          stamped++;
        }
      }
      write(abs, text, doc.toString({ lineWidth: 120 }));
    }
  }
}
console.log(`\ni18n-stamp: ${stamped} item(s) checked, ${changed} file(s) ${dry ? 'would change' : 'changed'}`);
