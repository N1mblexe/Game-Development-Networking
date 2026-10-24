/**
 * Progressive enhancement for server-rendered pages: reflects stored progress into the DOM
 * without an island per element. Runs on every page (imported by BaseLayout).
 *
 *   data-lesson-key="m/slug"                 → gets data-done="true" when complete
 *   data-module-progress data-lesson-keys="a,b,c"
 *        → sets --pct on itself; [data-progress-text] child gets "done/total"
 *   data-mark-complete="m/slug"              → toggle button
 *   data-exam-status="module-id"             → text "Passed (92%)", "Best 64%", or "Not attempted"
 *   data-cards-due data-card-ids="a,b,c"     → text "N due"
 */
import { $progress, isLessonComplete, setLessonComplete } from '../lib/progress/store';
import { isDue } from '../lib/srs/sm2';
import type { Progress } from '../lib/progress/types';

const split = (s: string | undefined) => (s ? s.split(',').filter(Boolean) : []);

function render(p: Progress) {
  document.querySelectorAll<HTMLElement>('[data-lesson-key]').forEach((el) => {
    el.dataset.done = String(isLessonComplete(p, el.dataset.lessonKey!));
  });

  document.querySelectorAll<HTMLElement>('[data-module-progress]').forEach((el) => {
    const keys = split(el.dataset.lessonKeys);
    const done = keys.filter((k) => isLessonComplete(p, k)).length;
    const pct = keys.length ? Math.round((done / keys.length) * 100) : 0;
    el.style.setProperty('--pct', `${pct}%`);
    el.dataset.pct = String(pct);
    const text = el.querySelector('[data-progress-text]');
    if (text) text.textContent = `${done}/${keys.length} lessons`;
  });

  document.querySelectorAll<HTMLButtonElement>('[data-mark-complete]').forEach((btn) => {
    const done = isLessonComplete(p, btn.dataset.markComplete!);
    btn.dataset.done = String(done);
    btn.setAttribute('aria-pressed', String(done));
    const label = btn.querySelector('[data-label]');
    if (label) label.textContent = done ? 'Completed' : 'Mark as complete';
  });

  document.querySelectorAll<HTMLElement>('[data-exam-status]').forEach((el) => {
    const e = p.exams[el.dataset.examStatus!];
    el.textContent = !e ? 'Not attempted' : e.passedAt ? `Passed (${e.bestPct}%)` : `Best ${e.bestPct}%`;
    el.dataset.passed = String(Boolean(e?.passedAt));
  });

  document.querySelectorAll<HTMLElement>('[data-cards-due]').forEach((el) => {
    const ids = split(el.dataset.cardIds);
    const due = ids.filter((id) => p.srs[id] && isDue(p.srs[id])).length;
    const fresh = ids.filter((id) => !p.srs[id]).length;
    el.textContent = `${due} due · ${fresh} new`;
  });
}

document.addEventListener('click', (e) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>('[data-mark-complete]');
  if (!btn) return;
  const key = btn.dataset.markComplete!;
  setLessonComplete(key, !isLessonComplete($progress.get(), key));
});

$progress.subscribe(render);
