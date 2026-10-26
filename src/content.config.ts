import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
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
} from './lib/content/schemas';

const yaml = (dir: string) => glob({ pattern: '**/*.yaml', base: `./src/content/${dir}` });
const mdx = (dir: string) => glob({ pattern: '**/*.mdx', base: `./src/content/${dir}`, generateId: ({ entry }) => lessonIdFromPath(entry) });

/**
 * Translated content for one locale, in its own tree src/content/<locale>/… (never nested inside the English folders:
 * lessonIdFromPath takes the first two path segments, so ids would collide). Ids are generated exactly like the
 * English ones, so progress keys, quiz shuffle seeds and exam draws are identical in every language.
 * Collection names are the English name plus the capitalised locale: lessonsTr, modulesTr, …
 * Read them only through src/lib/content/localized.ts, which merges them over English.
 */
function translations<L extends string>(locale: L) {
  const c = {
    /** Full MDX copy; frontmatter = title, summary, objectives, sourceHash. id = lesson key */
    lessons: defineCollection({ loader: mdx(`${locale}/lessons`), schema: lessonTranslationSchema }),
    /** Overlay; id = module id */
    modules: defineCollection({ loader: yaml(`${locale}/modules`), schema: moduleOverlaySchema }),
    /** Overlay keyed by question id; id = lesson key */
    quizzes: defineCollection({ loader: yaml(`${locale}/quizzes`), schema: quizOverlaySchema }),
    /** Overlay keyed by question id; id = module id */
    exams: defineCollection({ loader: yaml(`${locale}/exams`), schema: examOverlaySchema }),
    /** Overlay keyed by card id; id = module id */
    flashcards: defineCollection({ loader: yaml(`${locale}/flashcards`), schema: flashcardOverlaySchema }),
    /** Overlay keyed by term id; id = module id */
    glossary: defineCollection({ loader: yaml(`${locale}/glossary`), schema: glossaryOverlaySchema }),
  };
  const suffix = locale[0]!.toUpperCase() + locale.slice(1);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [`${k}${suffix}`, v])) as {
    [K in keyof typeof c as `${K}${Capitalize<L>}`]: (typeof c)[K];
  };
}

export const collections = {
  /** id = module id, e.g. "theory" */
  modules: defineCollection({ loader: yaml('modules'), schema: moduleSchema }),
  /** id = lesson key, e.g. "theory/packets-and-protocols" (NN- prefix stripped) */
  lessons: defineCollection({ loader: mdx('lessons'), schema: lessonSchema }),
  /** id = lesson key */
  quizzes: defineCollection({ loader: yaml('quizzes'), schema: quizSchema }),
  /** id = module id */
  exams: defineCollection({ loader: yaml('exams'), schema: examSchema }),
  /** id = module id */
  flashcards: defineCollection({ loader: yaml('flashcards'), schema: flashcardFileSchema }),
  /** id = module id */
  glossary: defineCollection({ loader: yaml('glossary'), schema: glossaryFileSchema }),
  // One line per translated locale (see src/i18n/locales.ts).
  ...translations('tr'),
};
