/**
 * Grading for every question type. Pure and framework-free, so it is unit-tested directly.
 *
 * Responses always refer to the ORIGINAL content indices, whatever order the UI showed:
 *   single     number | null                 chosen option index
 *   multi      number[]                      chosen option indices
 *   truefalse  boolean | null
 *   order      number[]                      the learner's arrangement, as indices into `items`
 *                                            (items are authored in the correct order, so correct = [0,1,2,…])
 *   codeline   number[]                      selected 1-based line numbers
 *   fill       string
 *   numeric    string | number               raw input; a trailing unit is ignored
 */
import type { Question, QuestionType } from '../content/schemas';
import { deriveSeed, range, shuffle } from './random';

export type QuizResponse = number | number[] | boolean | string | null;

export interface GradeResult {
  correct: boolean;
  /** Fraction of credit 0–1 for types where that is meaningful (multi, order, codeline). */
  partial?: number;
}

type Of<T extends QuestionType> = Extract<Question, { type: T }>;

const asIndices = (r: QuizResponse): number[] =>
  Array.isArray(r) ? r.filter((n) => Number.isInteger(n)) : [];

/** Hits minus false positives over the number of correct answers, clamped to 0–1. */
function setScore(selected: number[], answers: number[]): GradeResult {
  const want = new Set(answers);
  const got = new Set(selected);
  let hits = 0;
  let wrong = 0;
  for (const s of got) (want.has(s) ? hits++ : wrong++);
  const correct = hits === want.size && wrong === 0;
  const partial = want.size ? Math.max(0, Math.min(1, (hits - wrong) / want.size)) : 0;
  return { correct, partial };
}

/** Trim, collapse inner whitespace, optionally lower-case. */
export function normalizeText(s: string, caseSensitive = false): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return caseSensitive ? t : t.toLowerCase();
}

/** Parse a learner's number. Accepts "1 500", "1,5" (decimal comma), "50ms", "50 ms" with the unit. */
export function parseNumber(raw: string | number, unit?: string): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = raw.trim();
  if (unit && s.toLowerCase().endsWith(unit.toLowerCase())) s = s.slice(0, -unit.length).trim();
  s = s.replace(/[\s_]/g, '');
  // "1,500" / "12,000,000" are thousands separators; any other lone comma ("0,5", "1,25") is a decimal comma.
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^[+-]?\d*,\d+$/.test(s)) s = s.replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function grade(q: Question, r: QuizResponse | undefined): GradeResult {
  const res = r ?? null;
  switch (q.type) {
    case 'single':
      return { correct: typeof res === 'number' && res === q.answer };
    case 'multi':
      return setScore(asIndices(res), q.answers);
    case 'truefalse':
      return { correct: typeof res === 'boolean' && res === q.answer };
    case 'order': {
      const arr = asIndices(res);
      const n = q.items.length;
      const valid = arr.length === n && new Set(arr).size === n && arr.every((v) => v >= 0 && v < n);
      if (!valid) return { correct: false, partial: 0 };
      const inPlace = arr.filter((v, i) => v === i).length;
      return { correct: inPlace === n, partial: inPlace / n };
    }
    case 'codeline':
      return setScore(asIndices(res), q.answerLines);
    case 'fill': {
      if (typeof res !== 'string') return { correct: false };
      const given = normalizeText(res, q.caseSensitive);
      if (!given) return { correct: false };
      return { correct: q.answers.some((a) => normalizeText(a, q.caseSensitive) === given) };
    }
    case 'numeric': {
      if (typeof res !== 'string' && typeof res !== 'number') return { correct: false };
      const n = parseNumber(res, q.unit);
      if (n === null) return { correct: false };
      // Small epsilon so 0.1 + 0.2 style float noise never fails an exact answer.
      return { correct: Math.abs(n - q.answer) <= (q.tolerance ?? 0) + 1e-9 };
    }
  }
}

/** Whether the learner has given something gradable (enables the Check button). */
export function isAnswered(q: Question, r: QuizResponse | undefined): boolean {
  switch (q.type) {
    case 'single':
      return typeof r === 'number';
    case 'truefalse':
      return typeof r === 'boolean';
    case 'multi':
    case 'codeline':
      return Array.isArray(r) && r.length > 0;
    case 'order':
      return Array.isArray(r) && r.length === q.items.length;
    case 'fill':
      return typeof r === 'string' && r.trim().length > 0;
    case 'numeric':
      return (typeof r === 'string' && r.trim().length > 0) || typeof r === 'number';
  }
}

/** Display order of options for single/multi (indices into `options`). Identity for other types. */
export function optionOrder(q: Question, seed: number): number[] {
  if (q.type === 'single' || q.type === 'multi') return shuffle(range(q.options.length), deriveSeed(seed, q.id));
  return [];
}

/** Starting response. Order questions start shuffled, and never already solved. */
export function initialResponse(q: Question, seed: number): QuizResponse {
  switch (q.type) {
    case 'multi':
    case 'codeline':
      return [];
    case 'order': {
      const n = q.items.length;
      let arr = shuffle(range(n), deriveSeed(seed, q.id));
      if (arr.every((v, i) => v === i)) arr = [...arr.slice(1), arr[0]];
      return arr;
    }
    case 'fill':
    case 'numeric':
      return '';
    default:
      return null;
  }
}

/** The correct response, used to reveal answers after grading. */
export function correctResponse(q: Question): QuizResponse {
  switch (q.type) {
    case 'single':
    case 'truefalse':
      return q.answer;
    case 'multi':
      return q.answers.slice();
    case 'order':
      return range(q.items.length);
    case 'codeline':
      return q.answerLines.slice();
    case 'fill':
      return q.answers[0];
    case 'numeric':
      return String(q.answer);
  }
}

/** Human-readable correct answer for the feedback panel (plain text, inline-formatting allowed). */
export function describeAnswer(q: Question): string {
  switch (q.type) {
    case 'single':
      return q.options[q.answer];
    case 'multi':
      return q.answers.map((i) => q.options[i]).join('; ');
    case 'truefalse':
      return q.answer ? 'True' : 'False';
    case 'order':
      return q.items.map((t, i) => `${i + 1}. ${t}`).join('  ');
    case 'codeline':
      return `Line${q.answerLines.length > 1 ? 's' : ''} ${q.answerLines.join(', ')}`;
    case 'fill':
      return q.answers.map((a) => `\`${a}\``).join(' or ');
    case 'numeric': {
      const unit = q.unit ? ` ${q.unit}` : '';
      return q.tolerance ? `${q.answer}${unit} (± ${q.tolerance})` : `${q.answer}${unit}`;
    }
  }
}

/** Percentage 0–100, rounded. */
export const scorePct = (correct: number, total: number) => (total ? Math.round((correct / total) * 100) : 0);

export type { Of as QuestionOf };
