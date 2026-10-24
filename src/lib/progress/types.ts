/** Persisted learner progress. Bump PROGRESS_VERSION and add a migration in store.ts when this changes. */
export const PROGRESS_VERSION = 1;

export interface LessonProgress {
  /** ISO timestamp; set when the quiz is passed or the learner marks the lesson complete. */
  completedAt?: string;
  /** Best quiz score, 0–100. */
  quizBest?: number;
  quizAttempts?: number;
}

export interface ExamProgress {
  bestPct: number;
  attempts: number;
  /** ISO timestamp of the first passing attempt. */
  passedAt?: string;
}

/** SM-2 scheduling state for one flashcard. */
export interface CardState {
  /** Easiness factor, >= 1.3. */
  ef: number;
  /** Current interval in days. */
  interval: number;
  /** Consecutive successful reviews. */
  reps: number;
  lapses: number;
  /** ISO date (YYYY-MM-DD) the card is next due. */
  due: string;
}

export interface Progress {
  version: typeof PROGRESS_VERSION;
  /** Keyed by lesson key, e.g. "theory/packets-and-protocols". */
  lessons: Record<string, LessonProgress>;
  /** Keyed by module id. */
  exams: Record<string, ExamProgress>;
  /** Keyed by global card id, e.g. "theory/udp-vs-tcp". */
  srs: Record<string, CardState>;
  /** Name printed on certificates. */
  certName?: string;
  updatedAt: string;
}

export const emptyProgress = (): Progress => ({
  version: PROGRESS_VERSION,
  lessons: {},
  exams: {},
  srs: {},
  updatedAt: new Date(0).toISOString(),
});
