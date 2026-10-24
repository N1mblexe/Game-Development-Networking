import type { Question } from '../../lib/content/schemas';

export interface ExamRunnerProps {
  moduleId: string;
  title: string;
  /** Full pool; each attempt draws `drawCount` with a seeded shuffle. */
  questions: Question[];
  drawCount: number;
  passPct: number;
  timeLimitMin?: number;
  /** Shown as a link after a passing attempt. */
  certificateUrl: string;
}

/** Phase 0 stub. Agent A implements: start screen, draw, answer all, grade, review, recordExam(). */
export default function ExamRunner({ title, questions, drawCount, passPct }: ExamRunnerProps) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
      {title}: exam engine coming soon ({drawCount} of {questions.length} questions, pass at {passPct}%).
    </div>
  );
}
