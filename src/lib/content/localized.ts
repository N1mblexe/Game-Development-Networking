/**
 * The single merge point for translated content. Every page reads content through src/lib/content/nav.ts, which calls
 * these functions; nothing else touches the `*Tr` collections.
 *
 * Each function returns { data, translated, stale }:
 *   data        the English entry's data with the translated text merged over it (English where nothing is translated)
 *   translated  true when every translatable item has a translation
 *   stale       true when at least one translation was made from an older English source (hash mismatch)
 *
 * The default locale short-circuits (data is the English data object itself), so English output can't change.
 * Merge rules: only text fields are taken from a translation (the schemas reject anything else); `options` and
 * `items` are used only when their length matches English; Turkish `fill` answers are added to the English ones;
 * glossary aliases are the translated aliases plus the English term and aliases (so English jargon stays searchable).
 */
import { readFileSync } from 'node:fs';
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locales';
import { hashText, sourceHash, type SourceKind } from '../i18n/hash';
import type { Exam, Flashcard, GlossaryTerm, ModuleData, Question, QuestionOverlay, Quiz } from './schemas';

export interface Localized<T> {
  data: T;
  translated: boolean;
  stale: boolean;
}

// Every translated locale has the same collections (see translations() in src/content.config.ts); they are typed
// through the Turkish ones.
type Kind = 'lessons' | 'modules' | 'quizzes' | 'exams' | 'flashcards' | 'glossary';
type TrName<K extends Kind> = `${K}Tr`;
const collectionName = <K extends Kind>(kind: K, locale: Locale) =>
  `${kind}${locale[0]!.toUpperCase()}${locale.slice(1)}` as TrName<K>;

async function translationEntry<K extends Kind>(kind: K, locale: Locale, id: string) {
  // getEntry with a collection that has no files yet returns undefined (and warns once at build start).
  return (await getEntry(collectionName(kind, locale), id)) as CollectionEntry<TrName<K>> | undefined;
}

const isStale = (kind: SourceKind, english: object, src: string | undefined) => src !== undefined && src !== sourceHash(kind, english);
const english = <T>(data: T): Localized<T> => ({ data, translated: true, stale: false });

// ------------------------------------------------------------------------------------ lessons
export type LessonEntry = CollectionEntry<'lessons'>;

export interface LocalizedLesson extends Localized<LessonEntry['data']> {
  /** The entry to render(): the translation when there is one, otherwise the English lesson (a fallback page). */
  entry: LessonEntry | CollectionEntry<'lessonsTr'>;
}

/** Hash of an English lesson file, as stored in a translation's `sourceHash`. */
export const lessonSourceHash = (lesson: LessonEntry) => hashText(readFileSync(lesson.filePath!, 'utf8'));

export async function localizeLesson(lesson: LessonEntry, locale: Locale): Promise<LocalizedLesson> {
  if (locale === DEFAULT_LOCALE) return { ...english(lesson.data), entry: lesson };
  const tr = await translationEntry('lessons', locale, lesson.id);
  if (!tr) return { data: lesson.data, translated: false, stale: false, entry: lesson };
  const { sourceHash: src, ...text } = tr.data;
  return {
    data: { ...lesson.data, ...text },
    translated: true,
    stale: src !== undefined && src !== lessonSourceHash(lesson),
    entry: tr,
  };
}

// ------------------------------------------------------------------------------------ modules
export async function localizeModule(id: string, data: ModuleData, locale: Locale): Promise<Localized<ModuleData>> {
  if (locale === DEFAULT_LOCALE) return english(data);
  const o = (await translationEntry('modules', locale, id))?.data;
  if (!o) return { data, translated: false, stale: false };
  const { _src, ...text } = o;
  return { data: { ...data, ...text, short: text.short ?? data.short }, translated: true, stale: isStale('module', data, _src) };
}

// ------------------------------------------------------------------------------------ questions
function mergeQuestion(q: Question, o: QuestionOverlay | undefined): Question {
  if (!o) return q;
  const m = { ...q, prompt: o.prompt, explanation: o.explanation } as Question;
  if ('options' in m && o.options?.length === m.options.length) m.options = o.options;
  if (m.type === 'order' && o.items?.length === m.items.length) m.items = o.items;
  if (m.type === 'fill') {
    if (o.placeholder !== undefined) m.placeholder = o.placeholder;
    if (o.answers) m.answers = [...new Set([...m.answers, ...o.answers])];
  }
  if (m.type === 'numeric' && o.unit !== undefined) m.unit = o.unit;
  return m;
}

function mergeQuestions(questions: Question[], overlay: Record<string, QuestionOverlay> | undefined) {
  let n = 0;
  let stale = false;
  const merged = questions.map((q) => {
    const o = overlay?.[q.id];
    if (o) {
      n++;
      stale ||= isStale('question', q, o._src);
    }
    return mergeQuestion(q, o);
  });
  return { merged, translated: n === questions.length, stale };
}

export async function localizeQuiz(lessonKey: string, quiz: Quiz, locale: Locale): Promise<Localized<Quiz>> {
  if (locale === DEFAULT_LOCALE) return english(quiz);
  const o = (await translationEntry('quizzes', locale, lessonKey))?.data;
  const { merged, translated, stale } = mergeQuestions(quiz.questions, o?.questions);
  return { data: { ...quiz, questions: merged }, translated, stale };
}

export async function localizeExam(moduleId: string, exam: Exam, locale: Locale): Promise<Localized<Exam>> {
  if (locale === DEFAULT_LOCALE) return english(exam);
  const o = (await translationEntry('exams', locale, moduleId))?.data;
  const { merged, translated, stale } = mergeQuestions(exam.questions, o?.questions);
  return {
    data: { ...exam, title: o?.title ?? exam.title, questions: merged },
    translated: translated && o?.title !== undefined,
    stale: stale || isStale('exam', exam, o?._src),
  };
}

// ------------------------------------------------------------------------------------ flashcards
export async function localizeFlashcards(moduleId: string, cards: Flashcard[], locale: Locale): Promise<Localized<Flashcard[]>> {
  if (locale === DEFAULT_LOCALE) return english(cards);
  const o = (await translationEntry('flashcards', locale, moduleId))?.data.cards;
  let n = 0;
  let stale = false;
  const data = cards.map((c) => {
    const t = o?.[c.id];
    if (!t) return c;
    n++;
    stale ||= isStale('flashcard', c, t._src);
    return { ...c, front: t.front, back: t.back };
  });
  return { data, translated: n === cards.length, stale };
}

// ------------------------------------------------------------------------------------ glossary
export interface LocalizedTerm extends GlossaryTerm {
  /** False when this term is shown in English on a translated page. */
  translated: boolean;
}

export async function localizeGlossary(moduleId: string, terms: GlossaryTerm[], locale: Locale): Promise<Localized<LocalizedTerm[]>> {
  if (locale === DEFAULT_LOCALE) return english(terms.map((t) => ({ ...t, translated: true })));
  const o = (await translationEntry('glossary', locale, moduleId))?.data.terms;
  let n = 0;
  let stale = false;
  const data = terms.map((t) => {
    const tr = o?.[t.id];
    if (!tr) return { ...t, translated: false };
    n++;
    stale ||= isStale('glossary', t, tr._src);
    const aliases = [...new Set([...(tr.aliases ?? []), ...(tr.term !== t.term ? [t.term] : []), ...t.aliases])];
    // No translated `long`: the glossary page shows the translated `short` instead of mixing in English.
    return { ...t, term: tr.term, short: tr.short, long: tr.long, aliases, translated: true };
  });
  return { data, translated: n === terms.length, stale };
}

/** All translation entries of one kind for a locale (used by coverage reports). */
export const translationEntries = (kind: Kind, locale: Locale) => getCollection(collectionName(kind, locale));
