/**
 * The content contract. Every collection in src/content is validated against these schemas,
 * both by Astro at build time (src/content.config.ts) and by scripts/validate-content.ts.
 *
 * Keep this file free of `astro:*` imports so plain Node scripts and Vitest can load it.
 */
import { z } from 'astro/zod';

const kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be kebab-case (a-z, 0-9, -)');
/** Lesson key: "<module>/<lesson-slug>", e.g. "theory/packets-and-protocols". */
const lessonKey = z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/, 'must be "<module>/<lesson-slug>"');

// ---------------------------------------------------------------------------------------------
// Modules — src/content/modules/<module-id>.yaml
// ---------------------------------------------------------------------------------------------
export const moduleSchema = z.object({
  title: z.string(),
  /** Short label for nav and badges, e.g. "Theory". */
  short: z.string().max(16),
  order: z.number().int(),
  summary: z.string(),
  /** Accent color (any CSS color). Used for badges, progress bars, and certificates. */
  color: z.string(),
  /** 1–3 character monogram shown in the module badge. */
  badge: z.string().min(1).max(3),
  /** Module ids that should be completed first (shown as a hint, never enforced). */
  prerequisites: z.array(kebab).default([]),
  estimatedHours: z.number().positive().optional(),
});

// ---------------------------------------------------------------------------------------------
// Lessons — src/content/lessons/<module-id>/NN-<slug>.mdx  (id = "<module-id>/<slug>")
// ---------------------------------------------------------------------------------------------
export const lessonSchema = z.object({
  title: z.string(),
  order: z.number().int().positive(),
  /** One sentence shown in lesson lists and search results. */
  summary: z.string(),
  durationMin: z.number().int().positive(),
  objectives: z.array(z.string()).min(1),
  /** Lesson keys ("<module>/<slug>") the learner should know first. */
  prerequisites: z.array(lessonKey).default([]),
  tags: z.array(z.string()).default([]),
  /** Versions the lesson was written against. Required for engine/SDK lessons. */
  targets: z
    .object({
      unity: z.string().optional(),
      packages: z.array(z.object({ name: z.string(), version: z.string() })).default([]),
    })
    .optional(),
  /** Official sources the technical claims were checked against. */
  sources: z.array(z.object({ title: z.string(), url: z.url() })).default([]),
  draft: z.boolean().default(false),
});

// ---------------------------------------------------------------------------------------------
// Questions — shared by lesson quizzes and module exams
// ---------------------------------------------------------------------------------------------
const questionBase = {
  id: kebab,
  /** Supports inline `code` and **bold**. */
  prompt: z.string(),
  /** Shown after answering, whether right or wrong. Explain *why*. */
  explanation: z.string(),
  /** Optional code shown under the prompt (required for "codeline"). */
  code: z.string().optional(),
  lang: z.string().default('csharp'),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  tags: z.array(z.string()).default([]),
};

export const questionSchema = z
  .discriminatedUnion('type', [
    /** Pick exactly one option. `answer` is the 0-based index. */
    z.object({
      ...questionBase,
      type: z.literal('single'),
      options: z.array(z.string()).min(2).max(6),
      answer: z.number().int().min(0),
    }),
    /** Pick all that apply. `answers` are 0-based indices. */
    z.object({
      ...questionBase,
      type: z.literal('multi'),
      options: z.array(z.string()).min(3).max(8),
      answers: z.array(z.number().int().min(0)).min(1),
    }),
    z.object({ ...questionBase, type: z.literal('truefalse'), answer: z.boolean() }),
    /** Put steps in order. `items` are listed in the CORRECT order; the UI shuffles them. */
    z.object({ ...questionBase, type: z.literal('order'), items: z.array(z.string()).min(3).max(8) }),
    /** Click the offending line(s) in `code`. `answerLines` are 1-based. */
    z.object({
      ...questionBase,
      type: z.literal('codeline'),
      code: z.string(),
      answerLines: z.array(z.number().int().min(1)).min(1),
    }),
    /** Type a short answer. Compared trimmed and case-insensitive unless `caseSensitive`. */
    z.object({
      ...questionBase,
      type: z.literal('fill'),
      answers: z.array(z.string()).min(1),
      caseSensitive: z.boolean().default(false),
      placeholder: z.string().optional(),
    }),
    /** Numeric answer within ±tolerance (absolute). */
    z.object({
      ...questionBase,
      type: z.literal('numeric'),
      answer: z.number(),
      tolerance: z.number().min(0).default(0),
      unit: z.string().optional(),
    }),
  ])
  .superRefine((q, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message: `[${q.id}] ${message}` });
    if (q.type === 'single' && q.answer >= q.options.length) issue('answer index out of range');
    if (q.type === 'multi') {
      if (q.answers.some((a) => a >= q.options.length)) issue('answer index out of range');
      if (new Set(q.answers).size !== q.answers.length) issue('duplicate answer index');
    }
    if (q.type === 'codeline') {
      const lines = q.code.replace(/\n$/, '').split('\n').length;
      if (q.answerLines.some((l) => l > lines)) issue(`answerLines beyond code length (${lines} lines)`);
    }
  });

const uniqueIds = <T extends { id: string }>(items: T[], ctx: z.RefinementCtx, what: string) => {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) ctx.addIssue({ code: 'custom', message: `duplicate ${what} id "${item.id}"` });
    seen.add(item.id);
  }
};

// ---------------------------------------------------------------------------------------------
// Lesson quizzes — src/content/quizzes/<module-id>/<lesson-slug>.yaml  (id = lesson key)
// ---------------------------------------------------------------------------------------------
export const quizSchema = z
  .object({
    passPct: z.number().min(0).max(100).default(70),
    questions: z.array(questionSchema).min(3),
  })
  .superRefine((quiz, ctx) => uniqueIds(quiz.questions, ctx, 'question'));

// ---------------------------------------------------------------------------------------------
// Module exams — src/content/exams/<module-id>.yaml
// ---------------------------------------------------------------------------------------------
export const examSchema = z
  .object({
    title: z.string(),
    /** Questions drawn (seeded shuffle) from the pool for each attempt. */
    drawCount: z.number().int().positive().default(15),
    passPct: z.number().min(0).max(100).default(80),
    timeLimitMin: z.number().int().positive().optional(),
    questions: z.array(questionSchema).min(1),
  })
  .superRefine((exam, ctx) => {
    uniqueIds(exam.questions, ctx, 'question');
    if (exam.questions.length < exam.drawCount)
      ctx.addIssue({ code: 'custom', message: `pool (${exam.questions.length}) smaller than drawCount (${exam.drawCount})` });
  });

// ---------------------------------------------------------------------------------------------
// Flashcards — src/content/flashcards/<module-id>.yaml  (global card id = "<module>/<card.id>")
// ---------------------------------------------------------------------------------------------
export const flashcardSchema = z.object({
  id: kebab,
  /** Lesson key the card belongs to. */
  lesson: lessonKey.optional(),
  front: z.string(),
  back: z.string(),
  code: z.string().optional(),
  lang: z.string().default('csharp'),
});
export const flashcardFileSchema = z
  .object({ cards: z.array(flashcardSchema) })
  .superRefine((f, ctx) => uniqueIds(f.cards, ctx, 'card'));

// ---------------------------------------------------------------------------------------------
// Glossary — src/content/glossary/<module-id>.yaml  (term ids are GLOBAL across all files)
// ---------------------------------------------------------------------------------------------
export const glossaryTermSchema = z.object({
  id: kebab,
  term: z.string(),
  /** Tooltip text: one or two sentences, plain text. */
  short: z.string().max(240),
  /** Longer explanation for the glossary page. Supports inline `code` and **bold**. */
  long: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  /** Lesson key where the term is taught. */
  lesson: lessonKey.optional(),
  seeAlso: z.array(kebab).default([]),
});
export const glossaryFileSchema = z
  .object({ terms: z.array(glossaryTermSchema) })
  .superRefine((f, ctx) => uniqueIds(f.terms, ctx, 'term'));

// ---------------------------------------------------------------------------------------------
// Derived types used by components
// ---------------------------------------------------------------------------------------------
export type ModuleData = z.infer<typeof moduleSchema>;
export type LessonData = z.infer<typeof lessonSchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuestionType = Question['type'];
export type Quiz = z.infer<typeof quizSchema>;
export type Exam = z.infer<typeof examSchema>;
export type Flashcard = z.infer<typeof flashcardSchema>;
export type GlossaryTerm = z.infer<typeof glossaryTermSchema>;

/** Strip the "NN-" ordering prefix from a lesson file path: "theory/01-packets.mdx" → "theory/packets". */
export function lessonIdFromPath(entry: string): string {
  const [moduleId, file] = entry.replace(/\.mdx?$/, '').split('/');
  return `${moduleId}/${file.replace(/^\d+-/, '')}`;
}
