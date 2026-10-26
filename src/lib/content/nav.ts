/**
 * Navigation and lookup helpers. Navigation is always derived from content, never hand-written.
 *
 * Every getter and URL builder takes an optional locale (default: English). For another locale the getters return
 * the same entries with translated text merged in (see localized.ts); ids, order and structure never change.
 */
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locales';
import { localizePath } from '../i18n/route';
import {
  localizeExam,
  localizeFlashcards,
  localizeGlossary,
  localizeLesson,
  localizeModule,
  localizeQuiz,
  type LocalizedTerm,
} from './localized';

export type ModuleEntry = CollectionEntry<'modules'>;
export type LessonEntry = CollectionEntry<'lessons'>;

const visible = (l: LessonEntry) => import.meta.env.DEV || !l.data.draft;

export async function getModules(locale: Locale = DEFAULT_LOCALE): Promise<ModuleEntry[]> {
  const modules = (await getCollection('modules')).sort((a, b) => a.data.order - b.data.order);
  if (locale === DEFAULT_LOCALE) return modules;
  return Promise.all(modules.map(async (m) => ({ ...m, data: (await localizeModule(m.id, m.data, locale)).data })));
}

export async function getModule(id: string, locale: Locale = DEFAULT_LOCALE): Promise<ModuleEntry | undefined> {
  const m = await getEntry('modules', id);
  if (!m || locale === DEFAULT_LOCALE) return m;
  return { ...m, data: (await localizeModule(m.id, m.data, locale)).data };
}

export const lessonModule = (lesson: LessonEntry) => lesson.id.split('/')[0];
export const lessonSlug = (lesson: LessonEntry) => lesson.id.split('/')[1];

/** All visible lessons in course order (module order, then lesson order), with translated titles and summaries. */
export async function getLessons(moduleId?: string, locale: Locale = DEFAULT_LOCALE): Promise<LessonEntry[]> {
  const modules = await getModules();
  const moduleOrder = new Map(modules.map((m, i) => [m.id, i]));
  const lessons = (await getCollection('lessons', visible))
    .filter((l) => !moduleId || lessonModule(l) === moduleId)
    .sort(
      (a, b) =>
        (moduleOrder.get(lessonModule(a)) ?? 99) - (moduleOrder.get(lessonModule(b)) ?? 99) ||
        a.data.order - b.data.order,
    );
  if (locale === DEFAULT_LOCALE) return lessons;
  return Promise.all(lessons.map(async (l) => ({ ...l, data: (await localizeLesson(l, locale)).data })));
}

/** One lesson by key with translated frontmatter (undefined when missing or a draft in production). */
export async function getLesson(key: string, locale: Locale = DEFAULT_LOCALE): Promise<LessonEntry | undefined> {
  const l = await getEntry('lessons', key);
  if (!l || !visible(l)) return undefined;
  if (locale === DEFAULT_LOCALE) return l;
  return { ...l, data: (await localizeLesson(l, locale)).data };
}

export const moduleUrl = (moduleId: string, locale: Locale = DEFAULT_LOCALE) => localizePath(`/modules/${moduleId}/`, locale);
export const lessonUrlFromKey = (key: string, locale: Locale = DEFAULT_LOCALE) => localizePath(`/modules/${key}/`, locale);
export const lessonUrl = (lesson: LessonEntry, locale: Locale = DEFAULT_LOCALE) => lessonUrlFromKey(lesson.id, locale);
export const examUrl = (moduleId: string, locale: Locale = DEFAULT_LOCALE) => localizePath(`/modules/${moduleId}/exam/`, locale);
export const certificateUrl = (moduleId: string, locale: Locale = DEFAULT_LOCALE) => localizePath(`/certificate/${moduleId}/`, locale);
/** Any other site page: pageUrl('/review/', locale). */
export const pageUrl = (path: string, locale: Locale = DEFAULT_LOCALE) => localizePath(path, locale);

/** Previous/next lesson across the whole course, so the last lesson of a module links onward. */
export async function getPrevNext(lesson: LessonEntry, locale: Locale = DEFAULT_LOCALE) {
  const all = await getLessons(undefined, locale);
  const i = all.findIndex((l) => l.id === lesson.id);
  return { prev: all[i - 1], next: all[i + 1] };
}

export async function getQuiz(lessonKey: string, locale: Locale = DEFAULT_LOCALE) {
  const quiz = await getEntry('quizzes', lessonKey);
  if (!quiz || locale === DEFAULT_LOCALE) return quiz;
  return { ...quiz, data: (await localizeQuiz(lessonKey, quiz.data, locale)).data };
}

export async function getExam(moduleId: string, locale: Locale = DEFAULT_LOCALE) {
  const exam = await getEntry('exams', moduleId);
  if (!exam || locale === DEFAULT_LOCALE) return exam;
  return { ...exam, data: (await localizeExam(moduleId, exam.data, locale)).data };
}

export type GlossaryEntry = CollectionEntry<'glossary'>['data']['terms'][number] & { module: string } & Pick<LocalizedTerm, 'translated'>;

/** All glossary terms from every module file, keyed by term id. On other locales `translated` marks English fallbacks. */
export async function getGlossary(locale: Locale = DEFAULT_LOCALE) {
  const files = await getCollection('glossary');
  const map = new Map<string, GlossaryEntry>();
  for (const file of files) {
    const terms = locale === DEFAULT_LOCALE ? file.data.terms.map((t) => ({ ...t, translated: true })) : (await localizeGlossary(file.id, file.data.terms, locale)).data;
    for (const t of terms) map.set(t.id, { ...t, module: file.id });
  }
  return map;
}

/** All flashcards with their global id ("<module>/<card-id>"). */
export async function getFlashcards(moduleId?: string, locale: Locale = DEFAULT_LOCALE) {
  const files = (await getCollection('flashcards')).filter((f) => !moduleId || f.id === moduleId);
  const out = [];
  for (const f of files) {
    const cards = locale === DEFAULT_LOCALE ? f.data.cards : (await localizeFlashcards(f.id, f.data.cards, locale)).data;
    out.push(...cards.map((c) => ({ ...c, module: f.id, globalId: `${f.id}/${c.id}` })));
  }
  return out;
}
