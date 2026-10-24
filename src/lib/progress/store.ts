/**
 * Learner progress, persisted in localStorage and shared between islands via nanostores.
 * Every storage access is wrapped: private windows and blocked storage just mean
 * progress lives for the current page only.
 */
import { atom } from 'nanostores';
import { emptyProgress, PROGRESS_VERSION, type CardState, type Progress } from './types';

export const STORAGE_KEY = 'netlearn-progress';

export const $progress = atom<Progress>(emptyProgress());

/** Validate and upgrade anything that claims to be saved progress. Throws on garbage. */
export function migrate(raw: unknown): Progress {
  if (!raw || typeof raw !== 'object') throw new Error('Progress data must be an object');
  const data = raw as Partial<Progress> & { version?: number };
  if (data.version !== PROGRESS_VERSION) throw new Error(`Unsupported progress version: ${String(data.version)}`);
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, never>) : {});
  return {
    version: PROGRESS_VERSION,
    lessons: obj(data.lessons),
    exams: obj(data.exams),
    srs: obj(data.srs),
    certName: typeof data.certName === 'string' ? data.certName : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
  };
}

function load(): Progress {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return text ? migrate(JSON.parse(text)) : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

function save(p: Progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: keep in memory only */
  }
}

let initialized = false;
/** Load from storage and keep tabs in sync. Safe to call many times; no-op on the server. */
export function initProgress() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  $progress.set(load());
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) $progress.set(load());
  });
}
if (typeof window !== 'undefined') initProgress();

function update(fn: (draft: Progress) => void) {
  const next = structuredClone($progress.get());
  fn(next);
  next.updatedAt = new Date().toISOString();
  $progress.set(next);
  save(next);
}

// ------------------------------------------------------------------------------ lessons

export function isLessonComplete(p: Progress, key: string) {
  return Boolean(p.lessons[key]?.completedAt);
}

export function setLessonComplete(key: string, complete = true) {
  update((p) => {
    const l = (p.lessons[key] ??= {});
    if (complete) l.completedAt ??= new Date().toISOString();
    else delete l.completedAt;
  });
}

/** Record a quiz attempt; passing marks the lesson complete. */
export function recordQuiz(key: string, pct: number, passPct: number) {
  update((p) => {
    const l = (p.lessons[key] ??= {});
    l.quizAttempts = (l.quizAttempts ?? 0) + 1;
    l.quizBest = Math.max(l.quizBest ?? 0, pct);
    if (pct >= passPct) l.completedAt ??= new Date().toISOString();
  });
}

// ------------------------------------------------------------------------------ exams

export function recordExam(moduleId: string, pct: number, passPct: number) {
  update((p) => {
    const e = (p.exams[moduleId] ??= { bestPct: 0, attempts: 0 });
    e.attempts += 1;
    e.bestPct = Math.max(e.bestPct, pct);
    if (pct >= passPct) e.passedAt ??= new Date().toISOString();
  });
}

// ------------------------------------------------------------------------------ flashcards

export function setCardState(cardId: string, state: CardState) {
  update((p) => {
    p.srs[cardId] = state;
  });
}

// ------------------------------------------------------------------------------ misc

export function setCertName(name: string) {
  update((p) => {
    p.certName = name.trim() || undefined;
  });
}

export function exportProgress(): string {
  return JSON.stringify($progress.get(), null, 2);
}

/** Replace progress with an exported JSON string. Throws with a readable message if invalid. */
export function importProgress(json: string) {
  const next = migrate(JSON.parse(json));
  $progress.set(next);
  save(next);
}

export function resetProgress() {
  const next = emptyProgress();
  $progress.set(next);
  save(next);
}
