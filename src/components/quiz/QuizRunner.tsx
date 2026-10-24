import type { Question } from '../../lib/content/schemas';

export interface QuizRunnerProps {
  /** Lesson key; results are stored with recordQuiz(lessonKey, pct, passPct). */
  lessonKey: string;
  questions: Question[];
  passPct: number;
}

/** Phase 0 stub. Agent A implements the full lesson quiz (all question types, feedback, retry). */
export default function QuizRunner({ questions, passPct }: QuizRunnerProps) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
      Quiz engine coming soon: {questions.length} questions, pass at {passPct}%.
    </div>
  );
}
