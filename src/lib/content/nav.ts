/** Navigation and lookup helpers. Navigation is always derived from content, never hand-written. */
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { withBase } from '../url';

export type ModuleEntry = CollectionEntry<'modules'>;
export type LessonEntry = CollectionEntry<'lessons'>;

const visible = (l: LessonEntry) => import.meta.env.DEV || !l.data.draft;

export async function getModules(): Promise<ModuleEntry[]> {
  return (await getCollection('modules')).sort((a, b) => a.data.order - b.data.order);
}

export const lessonModule = (lesson: LessonEntry) => lesson.id.split('/')[0];
export const lessonSlug = (lesson: LessonEntry) => lesson.id.split('/')[1];

/** All visible lessons in course order (module order, then lesson order). */
export async function getLessons(moduleId?: string): Promise<LessonEntry[]> {
  const modules = await getModules();
  const moduleOrder = new Map(modules.map((m, i) => [m.id, i]));
  return (await getCollection('lessons', visible))
    .filter((l) => !moduleId || lessonModule(l) === moduleId)
    .sort(
      (a, b) =>
        (moduleOrder.get(lessonModule(a)) ?? 99) - (moduleOrder.get(lessonModule(b)) ?? 99) ||
        a.data.order - b.data.order,
    );
}

export const moduleUrl = (moduleId: string) => withBase(`/modules/${moduleId}/`);
export const lessonUrlFromKey = (key: string) => withBase(`/modules/${key}/`);
export const lessonUrl = (lesson: LessonEntry) => lessonUrlFromKey(lesson.id);
export const examUrl = (moduleId: string) => withBase(`/modules/${moduleId}/exam/`);
export const certificateUrl = (moduleId: string) => withBase(`/certificate/${moduleId}/`);

/** Previous/next lesson across the whole course, so the last lesson of a module links onward. */
export async function getPrevNext(lesson: LessonEntry) {
  const all = await getLessons();
  const i = all.findIndex((l) => l.id === lesson.id);
  return { prev: all[i - 1], next: all[i + 1] };
}

export async function getQuiz(lessonKey: string) {
  return getEntry('quizzes', lessonKey);
}

/** All glossary terms from every module file, keyed by term id. */
export async function getGlossary() {
  const files = await getCollection('glossary');
  const map = new Map<string, CollectionEntry<'glossary'>['data']['terms'][number] & { module: string }>();
  for (const file of files) for (const t of file.data.terms) map.set(t.id, { ...t, module: file.id });
  return map;
}

/** All flashcards with their global id ("<module>/<card-id>"). */
export async function getFlashcards(moduleId?: string) {
  const files = await getCollection('flashcards');
  return files
    .filter((f) => !moduleId || f.id === moduleId)
    .flatMap((f) => f.data.cards.map((c) => ({ ...c, module: f.id, globalId: `${f.id}/${c.id}` })));
}
