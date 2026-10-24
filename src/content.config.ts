import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import {
  examSchema,
  flashcardFileSchema,
  glossaryFileSchema,
  lessonIdFromPath,
  lessonSchema,
  moduleSchema,
  quizSchema,
} from './lib/content/schemas';

const yaml = (dir: string) => glob({ pattern: '**/*.yaml', base: `./src/content/${dir}` });

export const collections = {
  /** id = module id, e.g. "theory" */
  modules: defineCollection({ loader: yaml('modules'), schema: moduleSchema }),
  /** id = lesson key, e.g. "theory/packets-and-protocols" (NN- prefix stripped) */
  lessons: defineCollection({
    loader: glob({
      pattern: '**/*.mdx',
      base: './src/content/lessons',
      generateId: ({ entry }) => lessonIdFromPath(entry),
    }),
    schema: lessonSchema,
  }),
  /** id = lesson key */
  quizzes: defineCollection({ loader: yaml('quizzes'), schema: quizSchema }),
  /** id = module id */
  exams: defineCollection({ loader: yaml('exams'), schema: examSchema }),
  /** id = module id */
  flashcards: defineCollection({ loader: yaml('flashcards'), schema: flashcardFileSchema }),
  /** id = module id */
  glossary: defineCollection({ loader: yaml('glossary'), schema: glossaryFileSchema }),
};
